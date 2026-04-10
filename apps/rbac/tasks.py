"""
Celery tasks for RBAC maintenance.
Handles expiration of time-bound role assignments and document access grants.
"""
from celery import shared_task
from django.utils import timezone
from django.db import transaction
import logging

logger = logging.getLogger(__name__)


@shared_task
def cleanup_expired_assignments():
    """
    Deactivate expired UserRole assignments and DocumentAccess grants.

    Runs periodically via Celery Beat to enforce time-bound access.
    """
    now = timezone.now()

    # ── Expire UserRole assignments ──────────────────────────────────
    from apps.rbac.models import UserRole
    expired_roles = UserRole.objects.filter(
        expires_at__lte=now, is_active=True,
    )
    expired_role_count = expired_roles.count()
    if expired_role_count:
        affected_user_ids = set(
            expired_roles.values_list('user_id', flat=True)
        )
        with transaction.atomic():
            expired_roles.update(is_active=False)

        # Bust caches for affected users
        from apps.rbac.services.authorization import RoleResolutionService, PermissionService
        from apps.documents.services.access import DocumentAccessService
        for user_id in affected_user_ids:
            RoleResolutionService.invalidate_cache(user_id)
            PermissionService.invalidate_cache(user_id)
            DocumentAccessService.invalidate_cache(user_id)

        logger.info("Deactivated %d expired role assignments", expired_role_count)

    # ── Expire DocumentAccess grants ─────────────────────────────────
    from apps.documents.models import DocumentAccess
    expired_grants = DocumentAccess.objects.filter(
        expires_at__lte=now,
    )
    expired_grant_count = expired_grants.count()
    if expired_grant_count:
        affected_doc_ids = set(
            expired_grants.values_list('document_id', flat=True)
        )
        with transaction.atomic():
            expired_grants.delete()

        from apps.documents.services.access import DocumentAccessService
        for doc_id in affected_doc_ids:
            DocumentAccessService.invalidate_document_cache(doc_id)

        logger.info("Deleted %d expired document access grants", expired_grant_count)

    # ── Expire UserOrgUnit memberships ───────────────────────────────
    from apps.core.models import UserOrgUnit
    expired_memberships = UserOrgUnit.objects.filter(
        expires_at__lte=now, is_active=True,
    )
    expired_membership_count = expired_memberships.count()
    if expired_membership_count:
        affected_membership_user_ids = set(
            expired_memberships.values_list('user_id', flat=True)
        )
        with transaction.atomic():
            expired_memberships.update(is_active=False)

        from apps.documents.services.access import DocumentAccessService
        for user_id in affected_membership_user_ids:
            DocumentAccessService.invalidate_cache(user_id)

        logger.info("Deactivated %d expired org unit memberships", expired_membership_count)

    total = expired_role_count + expired_grant_count + expired_membership_count
    return f"Cleaned up {total} expired assignments"
