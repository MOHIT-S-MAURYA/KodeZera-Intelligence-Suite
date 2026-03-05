"""
Quota enforcement for tenant daily query limits.
Place this check in any view that runs RAG queries so platform owners
can cap per-tenant AI usage.
"""
import logging
from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

logger = logging.getLogger(__name__)


def check_tenant_query_quota(user):
    """
    Raises PermissionDenied if the tenant has exceeded TENANT_DAILY_QUERY_LIMIT.
    Platform owners (superusers without a tenant) are always exempt.

    Call this at the start of any view that runs an AI query:

        from apps.core.quota import check_tenant_query_quota
        check_tenant_query_quota(request.user)
    """
    limit = getattr(settings, 'TENANT_DAILY_QUERY_LIMIT', 0)

    # Feature disabled or platform owner — skip
    if limit <= 0 or not user.tenant_id:
        return

    # Import late to avoid circular imports
    from apps.core.models import UsageMetrics

    today = timezone.now().date()
    metrics = (
        UsageMetrics.objects
        .filter(tenant_id=user.tenant_id, date=today)
        .only('queries_count')
        .first()
    )

    if metrics and metrics.queries_count >= limit:
        logger.warning(
            "Tenant %s hit daily query quota (%d/%d)",
            user.tenant_id, metrics.queries_count, limit
        )
        raise PermissionDenied(
            detail={
                "error": "daily_quota_exceeded",
                "message": (
                    f"Your organization has reached its daily AI query limit ({limit} queries). "
                    "Quota resets at midnight UTC."
                ),
                "quota": limit,
                "used": metrics.queries_count,
            }
        )
