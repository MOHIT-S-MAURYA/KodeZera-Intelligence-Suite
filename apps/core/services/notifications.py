"""
Notification service — enterprise-grade notification system.

Supports both:
  1. Legacy targeted notifications (Notification + 4-way OR)
  2. New materialized inbox (UserNotification — fan-out per user)

The send() method is the primary entry point for new notifications.
Legacy helpers (notify_user, etc.) are kept for backward compatibility and
also fan-out into UserNotification.
"""
from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from django.db import models
from django.db.models import Q, Exists, OuterRef
from django.utils import timezone

from apps.core.models import (
    Notification, NotificationReceipt, User, UserNotification,
    DeliveryRecord, UserNotificationPreference, DigestQueue,
)

logger = logging.getLogger(__name__)

# Categories where notifications cannot be disabled
MANDATORY_CATEGORIES = {'security'}

# Default preferences if user has none configured
DEFAULT_PREFERENCE = {'in_app': True, 'email': False, 'browser_push': False}


class NotificationService:
    """Create, fan-out, and query notifications."""

    # ── New template-based send ────────────────────────────────────────────

    @classmethod
    def send(
        cls,
        template_key: str,
        context: dict,
        targets: list[dict],
        tenant_id: UUID,
        created_by: Optional[User] = None,
        action_url: str = '',
        notification_type: str = 'info',
        metadata: Optional[dict] = None,
    ) -> Notification:
        """
        Send a notification using a template.

        Args:
            template_key: key of the NotificationTemplate
            context: dict of variables for template rendering
            targets: list of {'type': 'user'|'department'|'role'|'tenant', 'id': uuid}
            tenant_id: tenant scope
            created_by: user who triggered the notification
            action_url: optional deep-link URL
            notification_type: info/success/warning/error/system
            metadata: optional extra data
        """
        from apps.core.services.template_service import TemplateService

        template = TemplateService.get_template(template_key)
        if not template:
            logger.warning(f"Notification template '{template_key}' not found, skipping")
            return None

        rendered = TemplateService.render(template, context)

        # Create source notification with first target
        primary_target = targets[0] if targets else {'type': 'tenant', 'id': str(tenant_id)}
        notification = Notification.objects.create(
            tenant_id=tenant_id,
            title=rendered['title'],
            message=rendered['message'],
            category=rendered['category'],
            target_type=primary_target['type'],
            target_id=primary_target['id'],
            created_by=created_by,
        )

        # Fan-out to all resolved users
        user_ids = cls._resolve_targets(targets, tenant_id)
        cls._fan_out(
            notification=notification,
            user_ids=user_ids,
            tenant_id=tenant_id,
            title=rendered['title'],
            message=rendered['message'],
            category=rendered['category'],
            priority=rendered['priority'],
            channels=rendered['channels'],
            notification_type=notification_type,
            action_url=action_url,
            metadata=metadata or {},
        )

        return notification

    @classmethod
    def send_raw(
        cls,
        title: str,
        message: str,
        targets: list[dict],
        tenant_id: UUID,
        category: str = 'system',
        priority: str = 'normal',
        notification_type: str = 'info',
        action_url: str = '',
        metadata: Optional[dict] = None,
        created_by: Optional[User] = None,
        channels: Optional[list[str]] = None,
    ) -> Notification:
        """Send a notification without a template (raw text)."""
        primary_target = targets[0] if targets else {'type': 'tenant', 'id': str(tenant_id)}
        notification = Notification.objects.create(
            tenant_id=tenant_id,
            title=title,
            message=message,
            category=category,
            target_type=primary_target['type'],
            target_id=primary_target['id'],
            created_by=created_by,
        )

        user_ids = cls._resolve_targets(targets, tenant_id)
        cls._fan_out(
            notification=notification,
            user_ids=user_ids,
            tenant_id=tenant_id,
            title=title,
            message=message,
            category=category,
            priority=priority,
            channels=channels or ['in_app'],
            notification_type=notification_type,
            action_url=action_url,
            metadata=metadata or {},
        )

        return notification

    # ── Target Resolution ──────────────────────────────────────────────────

    @classmethod
    def _resolve_targets(cls, targets: list[dict], tenant_id: UUID) -> list[UUID]:
        """Resolve target specs into a deduplicated list of user IDs."""
        from apps.rbac.models import UserRole

        user_ids = set()
        for target in targets:
            t_type = target['type']
            t_id = target['id']

            if t_type == 'user':
                user_ids.add(UUID(str(t_id)))
            elif t_type == 'department':
                dept_users = User.objects.filter(
                    tenant_id=tenant_id, department_id=t_id, is_active=True,
                ).values_list('id', flat=True)
                user_ids.update(dept_users)
            elif t_type == 'role':
                role_users = UserRole.objects.filter(
                    role_id=t_id, user__tenant_id=tenant_id, user__is_active=True,
                ).values_list('user_id', flat=True)
                user_ids.update(role_users)
            elif t_type == 'tenant':
                tenant_users = User.objects.filter(
                    tenant_id=tenant_id, is_active=True,
                ).values_list('id', flat=True)
                user_ids.update(tenant_users)

        return list(user_ids)

    # ── Fan-out ────────────────────────────────────────────────────────────

    @classmethod
    def _fan_out(
        cls,
        notification: Notification,
        user_ids: list[UUID],
        tenant_id: UUID,
        title: str,
        message: str,
        category: str,
        priority: str,
        channels: list[str],
        notification_type: str,
        action_url: str,
        metadata: dict,
    ) -> None:
        """Create UserNotification + DeliveryRecords for each user."""
        from apps.core.services.unread_cache import UnreadCacheService

        user_notifications = []
        for uid in user_ids:
            user_notifications.append(UserNotification(
                user_id=uid,
                tenant_id=tenant_id,
                title=title,
                message=message,
                notification_type=notification_type,
                category=category,
                priority=priority,
                action_url=action_url,
                metadata=metadata,
                source_notification=notification,
            ))

        created = UserNotification.objects.bulk_create(user_notifications, batch_size=500)

        # Create delivery records per channel
        delivery_records = []
        for un in created:
            user_prefs = cls._get_user_channel_prefs(un.user_id, category)
            for channel in channels:
                if channel == 'in_app':
                    # In-app is always delivered immediately
                    delivery_records.append(DeliveryRecord(
                        user_notification=un,
                        channel='in_app',
                        status='delivered',
                        sent_at=timezone.now(),
                        delivered_at=timezone.now(),
                    ))
                elif user_prefs.get(channel, False) or category in MANDATORY_CATEGORIES:
                    delivery_records.append(DeliveryRecord(
                        user_notification=un,
                        channel=channel,
                        status='pending',
                    ))

        if delivery_records:
            DeliveryRecord.objects.bulk_create(delivery_records, batch_size=500)

        # Increment unread cache for all users
        for uid in user_ids:
            UnreadCacheService.increment(uid)

    @classmethod
    def _get_user_channel_prefs(cls, user_id: UUID, category: str) -> dict:
        """Get user's channel preferences for a category."""
        prefs = UserNotificationPreference.objects.filter(
            user_id=user_id, category=category,
        ).values('channel', 'enabled')

        if not prefs.exists():
            return DEFAULT_PREFERENCE.copy()

        result = DEFAULT_PREFERENCE.copy()
        for p in prefs:
            result[p['channel']] = p['enabled']
        return result

    # ── Legacy creation helpers (backward-compatible) ───────────────────────

    @classmethod
    def notify_user(
        cls,
        tenant_id: UUID,
        user_id: UUID,
        title: str,
        message: str,
        category: str = 'system',
        created_by: Optional[User] = None,
    ) -> Notification:
        """Send a notification to a specific user."""
        return cls.send_raw(
            title=title,
            message=message,
            targets=[{'type': 'user', 'id': str(user_id)}],
            tenant_id=tenant_id,
            category=category,
            created_by=created_by,
        )

    @classmethod
    def notify_department(
        cls,
        tenant_id: UUID,
        department_id: UUID,
        title: str,
        message: str,
        category: str = 'system',
        created_by: Optional[User] = None,
    ) -> Notification:
        """Send a notification to all users in a department."""
        return cls.send_raw(
            title=title,
            message=message,
            targets=[{'type': 'department', 'id': str(department_id)}],
            tenant_id=tenant_id,
            category=category,
            created_by=created_by,
        )

    @classmethod
    def notify_role(
        cls,
        tenant_id: UUID,
        role_id: UUID,
        title: str,
        message: str,
        category: str = 'system',
        created_by: Optional[User] = None,
    ) -> Notification:
        """Send a notification to all users holding a specific role."""
        return cls.send_raw(
            title=title,
            message=message,
            targets=[{'type': 'role', 'id': str(role_id)}],
            tenant_id=tenant_id,
            category=category,
            created_by=created_by,
        )

    @classmethod
    def notify_tenant(
        cls,
        tenant_id: UUID,
        title: str,
        message: str,
        category: str = 'system',
        created_by: Optional[User] = None,
    ) -> Notification:
        """Broadcast a notification to every user in the tenant."""
        return cls.send_raw(
            title=title,
            message=message,
            targets=[{'type': 'tenant', 'id': str(tenant_id)}],
            tenant_id=tenant_id,
            category=category,
            created_by=created_by,
        )

    # ── Inbox queries (new — UserNotification based) ──────────────────────

    @classmethod
    def get_inbox(
        cls,
        user: User,
        category: str = None,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list, int]:
        """
        Return the user's materialized inbox, fast indexed query.
        Returns (notifications, total_count).
        """
        qs = UserNotification.objects.filter(
            user=user,
            is_dismissed=False,
        )

        # Filter out expired
        now = timezone.now()
        qs = qs.filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))

        if category:
            qs = qs.filter(category=category)
        if unread_only:
            qs = qs.filter(is_read=False)

        total = qs.count()
        items = list(qs[offset:offset + limit])
        return items, total

    @classmethod
    def get_unread_count(cls, user: User) -> int:
        """Get unread count from cache, falling back to DB."""
        from apps.core.services.unread_cache import UnreadCacheService
        return UnreadCacheService.get(user.id)

    @classmethod
    def mark_read(cls, notification_id: UUID, user: User) -> None:
        """Mark a UserNotification as read."""
        from apps.core.services.unread_cache import UnreadCacheService
        updated = UserNotification.objects.filter(
            id=notification_id, user=user, is_read=False,
        ).update(is_read=True, read_at=timezone.now())

        if updated:
            UnreadCacheService.decrement(user.id)

        # Also mark legacy receipt
        receipt, _ = NotificationReceipt.objects.get_or_create(
            notification_id=notification_id, user=user,
            defaults={'is_read': True, 'read_at': timezone.now()},
        )
        if not receipt.is_read:
            receipt.is_read = True
            receipt.read_at = timezone.now()
            receipt.save(update_fields=['is_read', 'read_at'])

    @classmethod
    def mark_all_read(cls, user: User) -> int:
        """Bulk mark all unread as read. Returns count updated."""
        from apps.core.services.unread_cache import UnreadCacheService
        now = timezone.now()
        count = UserNotification.objects.filter(
            user=user, is_read=False, is_dismissed=False,
        ).update(is_read=True, read_at=now)

        if count:
            UnreadCacheService.reset(user.id)

        return count

    @classmethod
    def dismiss(cls, notification_id: UUID, user: User) -> None:
        """Dismiss (soft-delete) a notification from the user's inbox."""
        from apps.core.services.unread_cache import UnreadCacheService
        un = UserNotification.objects.filter(id=notification_id, user=user).first()
        if un and not un.is_dismissed:
            was_unread = not un.is_read
            un.is_dismissed = True
            un.dismissed_at = timezone.now()
            if not un.is_read:
                un.is_read = True
                un.read_at = timezone.now()
            un.save(update_fields=['is_dismissed', 'dismissed_at', 'is_read', 'read_at'])

            if was_unread:
                UnreadCacheService.decrement(user.id)

    # ── Legacy query (kept for backward compatibility) ─────────────────────

    @classmethod
    def get_notifications_for_user(cls, user: User, unread_only: bool = False):
        """Legacy 4-way OR query. Use get_inbox() for new code."""
        from apps.rbac.models import UserRole

        role_ids = list(
            UserRole.objects.filter(user=user).values_list('role_id', flat=True)
        )

        q = Q(tenant_id=user.tenant_id) & (
            Q(target_type='user', target_id=user.id)
            | Q(target_type='tenant', target_id=user.tenant_id)
        )
        if user.department_id:
            q |= Q(
                tenant_id=user.tenant_id,
                target_type='department',
                target_id=user.department_id,
            )
        if role_ids:
            q |= Q(
                tenant_id=user.tenant_id,
                target_type='role',
                target_id__in=role_ids,
            )

        qs = Notification.objects.filter(q).order_by('-created_at')

        if unread_only:
            qs = qs.exclude(
                Exists(
                    NotificationReceipt.objects.filter(
                        notification=OuterRef('pk'),
                        user=user,
                        is_read=True,
                    )
                )
            )

        return qs

    @classmethod
    def delete_for_user(cls, notification_id: UUID, user: User) -> None:
        """Soft-delete: dismiss from inbox."""
        cls.dismiss(notification_id, user)

    # ── Preference helpers ─────────────────────────────────────────────────

    @classmethod
    def get_preferences(cls, user: User) -> list[dict]:
        """Get all notification preferences for a user, including defaults."""
        from apps.core.models import NotificationTemplate
        categories = [c[0] for c in NotificationTemplate.CATEGORY_CHOICES]
        channels = ['in_app', 'email', 'browser_push']

        existing = {
            (p.category, p.channel): p
            for p in UserNotificationPreference.objects.filter(user=user)
        }

        result = []
        for cat in categories:
            for ch in channels:
                pref = existing.get((cat, ch))
                is_mandatory = cat in MANDATORY_CATEGORIES
                result.append({
                    'category': cat,
                    'channel': ch,
                    'enabled': True if is_mandatory else (pref.enabled if pref else DEFAULT_PREFERENCE.get(ch, False)),
                    'digest_mode': pref.digest_mode if pref else 'instant',
                    'mandatory': is_mandatory,
                })

        return result

    @classmethod
    def update_preferences(cls, user: User, preferences: list[dict]) -> None:
        """Bulk update notification preferences."""
        for pref_data in preferences:
            cat = pref_data['category']
            ch = pref_data['channel']

            # Security category cannot be disabled
            if cat in MANDATORY_CATEGORIES:
                continue

            UserNotificationPreference.objects.update_or_create(
                user=user,
                category=cat,
                channel=ch,
                defaults={
                    'enabled': pref_data.get('enabled', True),
                    'digest_mode': pref_data.get('digest_mode', 'instant'),
                },
            )

    # ── Admin: delivery stats ──────────────────────────────────────────────

    @classmethod
    def get_delivery_stats(cls, tenant_id: UUID, days: int = 7) -> dict:
        """Get delivery statistics for the admin dashboard."""
        since = timezone.now() - timezone.timedelta(days=days)
        records = DeliveryRecord.objects.filter(
            user_notification__tenant_id=tenant_id,
            created_at__gte=since,
        )

        total = records.count()
        by_channel = {}
        for ch in ['in_app', 'email', 'browser_push', 'webhook']:
            ch_qs = records.filter(channel=ch)
            by_channel[ch] = {
                'total': ch_qs.count(),
                'delivered': ch_qs.filter(status='delivered').count(),
                'failed': ch_qs.filter(status='failed').count(),
                'pending': ch_qs.filter(status='pending').count(),
            }

        return {
            'total_deliveries': total,
            'by_channel': by_channel,
            'period_days': days,
        }
