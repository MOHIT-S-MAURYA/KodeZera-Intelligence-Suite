"""
Per-tenant and per-user throttling for multi-tenant SaaS.
These throttle classes integrate with DRF's throttling system and
use Redis for state (ensuring correctness across multiple Gunicorn workers).
"""
import logging
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle

logger = logging.getLogger(__name__)


class TenantQueryThrottle(UserRateThrottle):
    """
    Rate-limit AI/RAG queries per TENANT, not per individual user.
    This prevents a single tenant from monopolising server resources
    and starving other tenants (noisy-neighbour problem).

    Scope 'tenant_query' → requires REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['tenant_query']
    """
    scope = 'tenant_query'

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        # Key by tenant_id, not user_id — all users in a tenant share the quota
        tenant_id = getattr(request.user, 'tenant_id', None)
        if tenant_id:
            return self.cache_format % {
                'scope': self.scope,
                'ident': str(tenant_id),
            }
        # Superusers/platform owners not rate-limited
        return None


class TenantUploadThrottle(UserRateThrottle):
    """
    Rate-limit document uploads per tenant.
    Prevents abuse of the embedding pipeline by a single tenant.
    """
    scope = 'tenant_upload'

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        tenant_id = getattr(request.user, 'tenant_id', None)
        if tenant_id:
            return self.cache_format % {
                'scope': self.scope,
                'ident': str(tenant_id),
            }
        return None


class UserQueryThrottle(UserRateThrottle):
    """
    Fine-grained per-user query rate limit (in addition to the tenant-level one).
    Prevents a single user within a tenant from exhausting the tenant's quota alone.
    """
    scope = 'user_query'
