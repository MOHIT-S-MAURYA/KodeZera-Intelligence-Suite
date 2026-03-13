"""
Per-tenant and per-user throttling for multi-tenant SaaS.
These throttle classes integrate with DRF's throttling system and
use Redis for state (ensuring correctness across multiple Gunicorn workers).
"""
import logging
import time
from django.conf import settings
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle

logger = logging.getLogger(__name__)


def _parse_plan_rate(raw: str, default_rate: str) -> str:
    """Validate and normalize a throttle rate string."""
    if not raw or '/' not in raw:
        return default_rate
    return raw


def _plan_rates(scope: str) -> dict:
    """Return per-plan rates for the given scope from settings."""
    defaults = {
        'tenant_query': {
            'basic': '200/minute',
            'pro': '400/minute',
            'enterprise': '800/minute',
        },
        'user_query': {
            'basic': '30/minute',
            'pro': '60/minute',
            'enterprise': '120/minute',
        },
        'tenant_upload': {
            'basic': '50/hour',
            'pro': '100/hour',
            'enterprise': '200/hour',
        },
    }
    conf = getattr(settings, 'PLAN_THROTTLE_RATES', {}) or {}
    merged = defaults.get(scope, {}).copy()
    merged.update(conf.get(scope, {}))
    return merged


class PlanAwareUserRateThrottle(UserRateThrottle):
    """
    UserRateThrottle variant that picks rate by tenant subscription plan type.

    It keeps DRF's default behavior but recalculates rate per request.
    """

    def _resolve_plan_type(self, request) -> str:
        if not request.user or not request.user.is_authenticated:
            return 'basic'
        tenant = getattr(request.user, 'tenant', None)
        sub = getattr(tenant, 'subscription', None) if tenant else None
        plan = getattr(sub, 'plan', None) if sub else None
        return (getattr(plan, 'plan_type', None) or 'basic').lower()

    def _resolve_rate(self, request) -> str | None:
        rates = _plan_rates(self.scope)
        plan_type = self._resolve_plan_type(request)
        fallback = getattr(settings, 'REST_FRAMEWORK', {}).get('DEFAULT_THROTTLE_RATES', {}).get(self.scope)
        return _parse_plan_rate(rates.get(plan_type), fallback)

    def allow_request(self, request, view):
        self.rate = self._resolve_rate(request)
        if self.rate is None:
            return True

        self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)


class TenantQueryThrottle(PlanAwareUserRateThrottle):
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


class TenantUploadThrottle(PlanAwareUserRateThrottle):
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


class UserQueryThrottle(PlanAwareUserRateThrottle):
    """
    Fine-grained per-user query rate limit (in addition to the tenant-level one).
    Prevents a single user within a tenant from exhausting the tenant's quota alone.
    """
    scope = 'user_query'


def _snapshot_for_throttle(throttle, request) -> dict:
    """Return limit/remaining/reset values for a throttle instance."""
    throttle.rate = throttle._resolve_rate(request)
    if not throttle.rate:
        return {'limit': 0, 'remaining': 0, 'reset': 0}

    num_requests, duration = throttle.parse_rate(throttle.rate)
    cache_key = throttle.get_cache_key(request, view=None)
    if not cache_key:
        return {'limit': int(num_requests), 'remaining': int(num_requests), 'reset': int(duration)}

    history = throttle.cache.get(cache_key, [])
    now = time.time()
    valid = [ts for ts in history if ts > now - duration]
    remaining = max(int(num_requests) - len(valid), 0)

    if valid:
        oldest = min(valid)
        reset = max(int(duration - (now - oldest)), 0)
    else:
        reset = int(duration)

    return {'limit': int(num_requests), 'remaining': int(remaining), 'reset': int(reset)}


def get_rate_limit_headers(request) -> dict:
    """
    Compute standard rate-limit headers for the current request.

    We expose the strictest remaining window across user and tenant throttles.
    """
    if not getattr(request, 'user', None) or not request.user.is_authenticated:
        return {}

    snapshots = []
    for throttle_cls in (UserQueryThrottle, TenantQueryThrottle):
        try:
            snapshots.append(_snapshot_for_throttle(throttle_cls(), request))
        except Exception:
            continue

    if not snapshots:
        return {}

    primary = min(snapshots, key=lambda s: s['remaining'])
    return {
        'X-RateLimit-Limit': str(primary['limit']),
        'X-RateLimit-Remaining': str(primary['remaining']),
        'X-RateLimit-Reset': str(primary['reset']),
    }
