"""
Notification service — Workday-inspired targeted notification delivery.

Notifications are scoped so that only the relevant audience receives them:
  - user:       a single user  (e.g. "Your account was created")
  - department: all users in a department  (e.g. "New document in HR")
  - role:       all users with a given role
  - tenant:     broadcast to every user in the tenant
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from django.db.models import Q, Exists, OuterRef
from django.utils import timezone

from apps.core.models import Notification, NotificationReceipt, User


class NotificationService:
    """Create and query targeted notifications."""

    # ── Creation helpers ──────────────────────────────────────────────────

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
        return Notification.objects.create(
            tenant_id=tenant_id,
            title=title,
            message=message,
            category=category,
            target_type='user',
            target_id=user_id,
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
        return Notification.objects.create(
            tenant_id=tenant_id,
            title=title,
            message=message,
            category=category,
            target_type='department',
            target_id=department_id,
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
        return Notification.objects.create(
            tenant_id=tenant_id,
            title=title,
            message=message,
            category=category,
            target_type='role',
            target_id=role_id,
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
        return Notification.objects.create(
            tenant_id=tenant_id,
            title=title,
            message=message,
            category=category,
            target_type='tenant',
            target_id=tenant_id,
            created_by=created_by,
        )

    # ── Query helpers ─────────────────────────────────────────────────────

    @classmethod
    def get_notifications_for_user(cls, user: User, unread_only: bool = False):
        """
        Return notifications visible to this user, ordered newest-first.

        A notification is visible when ANY of the following is true:
          1. target_type='user'       AND target_id = user.id
          2. target_type='department' AND target_id = user.department_id
          3. target_type='role'       AND target_id ∈ user's role IDs
          4. target_type='tenant'     AND target_id = user.tenant_id
        """
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
            # Exclude notifications that have a read receipt for this user
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
    def mark_read(cls, notification_id: UUID, user: User) -> None:
        receipt, _ = NotificationReceipt.objects.get_or_create(
            notification_id=notification_id,
            user=user,
        )
        if not receipt.is_read:
            receipt.is_read = True
            receipt.read_at = timezone.now()
            receipt.save(update_fields=['is_read', 'read_at'])

    @classmethod
    def mark_all_read(cls, user: User) -> int:
        """Mark all unread notifications as read. Returns count updated."""
        notif_ids = cls.get_notifications_for_user(user, unread_only=True).values_list('id', flat=True)
        now = timezone.now()
        created = 0
        for nid in notif_ids:
            _, was_created = NotificationReceipt.objects.update_or_create(
                notification_id=nid,
                user=user,
                defaults={'is_read': True, 'read_at': now},
            )
            created += 1
        return created

    @classmethod
    def delete_for_user(cls, notification_id: UUID, user: User) -> None:
        """Soft-delete: just mark as read so it doesn't reappear."""
        cls.mark_read(notification_id, user)
