"""
Core audit service — create, query, and export audit events.

All audit writes go through this service to ensure:
  - PII scrubbing
  - Hash chain integrity
  - Consistent field population
  - Security event detection trigger
"""
from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from django.db.models import Q
from django.utils import timezone

from apps.core.models import AuditEvent, User, Tenant

logger = logging.getLogger(__name__)

# ── PII Scrubbing ──────────────────────────────────────────────────────────

SCRUB_FIELDS = frozenset({
    'password', 'new_password', 'old_password', 'current_password',
    'password1', 'password2', 'confirm_password',
    'token', 'access_token', 'refresh_token', 'access', 'refresh',
    'api_key', 'secret', 'secret_key', 'private_key',
    'credit_card', 'ssn', 'social_security',
    'llm_api_key', 'embedding_api_key', 'certificate',
})

REDACTED = '***REDACTED***'


def scrub_audit_data(data: dict) -> dict:
    """Recursively redact sensitive fields from audit metadata."""
    if not isinstance(data, dict):
        return data
    scrubbed = {}
    for key, value in data.items():
        if key.lower() in SCRUB_FIELDS:
            scrubbed[key] = REDACTED
        elif isinstance(value, dict):
            scrubbed[key] = scrub_audit_data(value)
        elif isinstance(value, list):
            scrubbed[key] = [
                scrub_audit_data(item) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            scrubbed[key] = value
    return scrubbed


# ── Resource type mapping ──────────────────────────────────────────────────

# Maps URL path segments to clean resource type names
RESOURCE_TYPE_MAP = {
    'documents': 'document',
    'document-access': 'document_access',
    'document-folders': 'document_folder',
    'document-tags': 'document_tag',
    'departments': 'department',
    'roles': 'role',
    'permissions': 'permission',
    'users': 'user',
    'user-roles': 'user_role',
    'audit-logs': 'audit_log',
    'notifications': 'notification',
    'support': 'support_ticket',
    'org-units': 'org_unit',
    'rag': 'rag',
    'auth': 'auth',
    'platform': 'platform',
    'tenant': 'tenant',
    'admin': 'admin',
    'dashboard': 'dashboard',
}


def extract_resource_info(path: str) -> tuple[str, Optional[UUID]]:
    """
    Extract resource type and ID from URL path.
    Returns (resource_type, resource_id_or_None).
    """
    import re
    parts = [p for p in path.split('/') if p]
    resource_type = 'unknown'
    resource_id = None

    uuid_pattern = re.compile(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I
    )

    for i, part in enumerate(parts):
        # Skip api prefix and version
        if part == 'api' or re.fullmatch(r'v\d+', part):
            continue
        # Check if it's a UUID (resource ID)
        if uuid_pattern.match(part):
            resource_id = UUID(part)
            continue
        # Map to clean resource type
        mapped = RESOURCE_TYPE_MAP.get(part)
        if mapped:
            resource_type = mapped
            break
        # Fallback: use the part directly
        resource_type = part
        break

    return resource_type, resource_id


# ── Audit Service ──────────────────────────────────────────────────────────

class AuditService:
    """Central service for creating and querying audit events."""

    @classmethod
    def log(
        cls,
        action: str,
        resource_type: str,
        *,
        scope: str = 'tenant',
        tenant_id: Optional[UUID] = None,
        user: Optional[User] = None,
        resource_id: Optional[UUID] = None,
        changes: Optional[dict] = None,
        request_id: str = '',
        endpoint: str = '',
        http_method: str = '',
        outcome: str = 'success',
        status_code: Optional[int] = None,
        error_message: str = '',
        trigger: str = 'manual',
        metadata: Optional[dict] = None,
        ip_address: Optional[str] = None,
        user_agent: str = '',
        session_id: str = '',
        regulation_tags: Optional[list] = None,
        data_classification: str = '',
        retention_class: str = 'standard',
    ) -> AuditEvent:
        """
        Create an audit event with PII scrubbing and hash chain.

        This is the primary entry point for all audit logging.
        """
        # Scrub sensitive data from metadata and changes
        clean_metadata = scrub_audit_data(metadata or {})
        clean_changes = scrub_audit_data(changes or {})

        # Compute hash chain
        from apps.core.services.hash_chain import HashChainService
        previous_hash, event_hash = HashChainService.compute_hash(
            action=action,
            user_id=str(user.id) if user else '',
            tenant_id=str(tenant_id) if tenant_id else '',
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else '',
            timestamp_str=timezone.now().isoformat(),
            changes=clean_changes,
        )

        event = AuditEvent.objects.create(
            scope=scope,
            tenant_id=tenant_id,
            user=user,
            ip_address=ip_address,
            user_agent=user_agent[:500] if user_agent else '',
            session_id=session_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            changes=clean_changes,
            request_id=request_id,
            endpoint=endpoint,
            http_method=http_method,
            outcome=outcome,
            status_code=status_code,
            error_message=error_message[:1000] if error_message else '',
            trigger=trigger,
            metadata=clean_metadata,
            regulation_tags=regulation_tags or [],
            data_classification=data_classification,
            retention_class=retention_class,
            previous_hash=previous_hash,
            event_hash=event_hash,
        )

        # Trigger security detection (async, non-blocking)
        try:
            from apps.core.services.security_detection import SecurityDetectionService
            SecurityDetectionService.evaluate(event)
        except Exception:
            logger.debug("Security detection evaluation failed", exc_info=True)

        return event

    @classmethod
    def log_from_middleware(
        cls,
        request_meta: dict,
        user: Optional[User],
        tenant_id: Optional[UUID],
        action: str,
        status_code: int,
        changes: Optional[dict] = None,
    ) -> Optional[AuditEvent]:
        """
        Convenience method called from the AuditLoggingMiddleware.
        Extracts resource info from the request path.
        """
        path = request_meta.get('path', '')
        method = request_meta.get('method', '')
        resource_type, resource_id = extract_resource_info(path)

        x_forwarded_for = request_meta.get('HTTP_X_FORWARDED_FOR')
        ip = x_forwarded_for.split(',')[0].strip() if x_forwarded_for else request_meta.get('REMOTE_ADDR')

        # Determine outcome from status code
        if status_code < 400:
            outcome = 'success'
        elif status_code == 403:
            outcome = 'denied'
        else:
            outcome = 'failure'

        # Determine scope
        scope = 'platform' if '/platform/' in path else 'tenant'

        return cls.log(
            action=action,
            resource_type=resource_type,
            scope=scope,
            tenant_id=tenant_id,
            user=user,
            resource_id=resource_id,
            changes=changes,
            request_id=request_meta.get('request_id', ''),
            endpoint=path,
            http_method=method,
            outcome=outcome,
            status_code=status_code,
            ip_address=ip,
            user_agent=request_meta.get('HTTP_USER_AGENT', ''),
            session_id=request_meta.get('session_id', ''),
        )

    # ── Query helpers ──────────────────────────────────────────────────────

    @classmethod
    def get_events(
        cls,
        tenant_id: Optional[UUID] = None,
        scope: Optional[str] = None,
        action: Optional[str] = None,
        resource_type: Optional[str] = None,
        user_id: Optional[UUID] = None,
        outcome: Optional[str] = None,
        date_from=None,
        date_to=None,
        search: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list, int]:
        """
        Query audit events with filters. Returns (events, total_count).
        """
        qs = AuditEvent.objects.select_related('user', 'tenant')

        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        if scope:
            qs = qs.filter(scope=scope)
        if action:
            qs = qs.filter(action=action)
        if resource_type:
            qs = qs.filter(resource_type=resource_type)
        if user_id:
            qs = qs.filter(user_id=user_id)
        if outcome:
            qs = qs.filter(outcome=outcome)
        if date_from:
            qs = qs.filter(timestamp__date__gte=date_from)
        if date_to:
            qs = qs.filter(timestamp__date__lte=date_to)
        if search:
            qs = qs.filter(
                Q(resource_type__icontains=search)
                | Q(endpoint__icontains=search)
                | Q(user__email__icontains=search)
            )

        total = qs.count()
        items = list(qs[offset:offset + limit])
        return items, total

    @classmethod
    def get_event_detail(cls, event_id: UUID, tenant_id: Optional[UUID] = None) -> Optional[AuditEvent]:
        """Get a single audit event, optionally scoped to tenant."""
        qs = AuditEvent.objects.select_related('user', 'tenant')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        return qs.filter(id=event_id).first()

    # ── Statistics ─────────────────────────────────────────────────────────

    @classmethod
    def get_stats(cls, tenant_id: Optional[UUID] = None, days: int = 7) -> dict:
        """Get audit statistics for dashboard."""
        from django.db.models import Count
        since = timezone.now() - timezone.timedelta(days=days)

        qs = AuditEvent.objects.filter(timestamp__gte=since)
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)

        total = qs.count()
        by_action = dict(qs.values_list('action').annotate(c=Count('id')).values_list('action', 'c'))
        by_outcome = dict(qs.values_list('outcome').annotate(c=Count('id')).values_list('outcome', 'c'))

        failures = qs.filter(outcome__in=['failure', 'denied']).count()

        return {
            'total_events': total,
            'by_action': by_action,
            'by_outcome': by_outcome,
            'failures': failures,
            'period_days': days,
        }
