"""
Security detection service — rule-based anomaly detection on audit events.

Each rule evaluates the latest event and recent history.  When a rule fires
it creates a SecurityAlert and (optionally) triggers a notification.

Designed for synchronous, lightweight evaluation on every AuditEvent.log()
call.  For sliding-window counters Django's cache framework (Redis) is used.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Optional

from django.core.cache import cache
from django.utils import timezone

from apps.core.models import AuditEvent, SecurityAlert

logger = logging.getLogger(__name__)


# ── Rule definitions ───────────────────────────────────────────────────────

RULES = [
    {
        'key': 'brute_force_login',
        'title': 'Brute-force login attempt',
        'severity': 'high',
        'description': 'Multiple failed login attempts from the same IP within a short window.',
        'action': 'login',
        'outcome': 'failure',
        'window_seconds': 300,  # 5 min
        'threshold': 5,
    },
    {
        'key': 'privilege_escalation',
        'title': 'Privilege escalation detected',
        'severity': 'critical',
        'description': 'Role change granting elevated privileges.',
        'action': 'grant_access',
    },
    {
        'key': 'mass_data_access',
        'title': 'Mass data access',
        'severity': 'high',
        'description': 'Unusually high volume of read operations in a short time.',
        'action': 'read',
        'window_seconds': 300,
        'threshold': 100,
    },
    {
        'key': 'bulk_delete',
        'title': 'Bulk deletion detected',
        'severity': 'high',
        'description': 'Large number of delete operations in a short time.',
        'action': 'delete',
        'window_seconds': 300,
        'threshold': 10,
    },
    {
        'key': 'admin_action_burst',
        'title': 'Admin action burst',
        'severity': 'medium',
        'description': 'Unusual volume of admin actions in a short period.',
        'action': 'config_change',
        'window_seconds': 600,
        'threshold': 15,
    },
    {
        'key': 'off_hours_activity',
        'title': 'Off-hours activity',
        'severity': 'low',
        'description': 'Sensitive operation performed outside business hours.',
    },
    {
        'key': 'config_change',
        'title': 'System configuration change',
        'severity': 'medium',
        'description': 'Critical system configuration was modified.',
        'action': 'config_change',
    },
]


# ── Service ────────────────────────────────────────────────────────────────

class SecurityDetectionService:
    """Evaluate security rules against audit events."""

    @classmethod
    def evaluate(cls, event: AuditEvent) -> list[SecurityAlert]:
        """
        Run all rules against the given event.
        Returns a list of any SecurityAlerts that were created.
        """
        alerts: list[SecurityAlert] = []

        for rule in RULES:
            try:
                alert = cls._evaluate_rule(rule, event)
                if alert:
                    alerts.append(alert)
            except Exception:
                logger.debug("Rule %s evaluation failed", rule['key'], exc_info=True)

        return alerts

    @classmethod
    def _evaluate_rule(cls, rule: dict, event: AuditEvent) -> Optional[SecurityAlert]:
        # Rule requires a specific action — skip if mismatch
        required_action = rule.get('action')
        if required_action and event.action != required_action:
            return None

        # Rule requires a specific outcome — skip if mismatch
        required_outcome = rule.get('outcome')
        if required_outcome and event.outcome != required_outcome:
            return None

        # ── Threshold / sliding-window rules ────────────────────────────
        if 'threshold' in rule:
            return cls._check_threshold(rule, event)

        # ── Off-hours rule ──────────────────────────────────────────────
        if rule['key'] == 'off_hours_activity':
            return cls._check_off_hours(rule, event)

        # ── Simple match rules (privilege escalation, config change) ────
        return cls._create_alert(rule, event)

    @classmethod
    def _check_threshold(cls, rule: dict, event: AuditEvent) -> Optional[SecurityAlert]:
        """Redis counter-based sliding window check."""
        window = rule['window_seconds']
        threshold = rule['threshold']

        # Build a unique counter key per user+rule (or IP for login)
        if event.action == 'login':
            counter_key = f"sec:{rule['key']}:{event.ip_address}"
        else:
            actor_id = str(event.user_id) if event.user_id else event.ip_address
            counter_key = f"sec:{rule['key']}:{event.tenant_id}:{actor_id}"

        # Increment counter in Redis
        try:
            count = cache.get(counter_key, 0) + 1
            cache.set(counter_key, count, timeout=window)
        except Exception:
            # If cache is unavailable, fall back to DB count
            since = timezone.now() - timedelta(seconds=window)
            qs = AuditEvent.objects.filter(
                action=event.action,
                timestamp__gte=since,
            )
            if event.action == 'login':
                qs = qs.filter(ip_address=event.ip_address)
            else:
                qs = qs.filter(user=event.user, tenant_id=event.tenant_id)
            count = qs.count()

        if count >= threshold:
            # Avoid alert spam: check if there's already an open alert for this rule+context
            existing = SecurityAlert.objects.filter(
                rule_key=rule['key'],
                tenant_id=event.tenant_id,
                status__in=['open', 'acknowledged'],
                created_at__gte=timezone.now() - timedelta(seconds=window * 2),
            ).exists()

            if not existing:
                return cls._create_alert(rule, event)

        return None

    @classmethod
    def _check_off_hours(cls, rule: dict, event: AuditEvent) -> Optional[SecurityAlert]:
        """Flag sensitive operations outside 06:00-22:00 local time."""
        hour = event.timestamp.hour
        is_off_hours = hour < 6 or hour >= 22
        is_sensitive = event.action in (
            'delete', 'config_change', 'grant_access', 'revoke_access', 'export',
        )

        if is_off_hours and is_sensitive:
            return cls._create_alert(rule, event)
        return None

    @classmethod
    def _create_alert(cls, rule: dict, event: AuditEvent) -> SecurityAlert:
        """Persist a SecurityAlert for the fired rule."""
        alert = SecurityAlert.objects.create(
            tenant_id=event.tenant_id,
            rule_key=rule['key'],
            severity=rule['severity'],
            title=rule['title'],
            description=rule.get('description', ''),
            source_events=[str(event.id)],
        )
        logger.info("SecurityAlert created: %s (rule=%s, tenant=%s)", alert.id, rule['key'], event.tenant_id)
        return alert
