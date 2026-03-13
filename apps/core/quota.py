"""
Legacy compatibility shim for tenant query quota checks.

New code should use apps.core.services.quota.QuotaService directly.
This module remains to avoid breaking older imports.
"""
import logging
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
    if not getattr(user, 'tenant_id', None):
        return

    from apps.core.services.quota import QuotaService, QuotaExceeded

    try:
        QuotaService.check_queries(str(user.tenant_id))
    except QuotaExceeded as exc:
        logger.warning(
            "Tenant %s hit query quota (%d/%d)",
            user.tenant_id, exc.used, exc.limit,
        )
        raise PermissionDenied(detail=exc.to_dict())
