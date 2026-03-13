"""
Quota enforcement service.

Checks Redis counters against subscription plan limits.
Returns structured quota-exceeded errors with usage details.
"""
from datetime import date

from django.utils import timezone

from apps.core.models import TenantSubscription, User
from apps.core.services.metering import MeteringService
from apps.documents.models import Document


class QuotaExceeded(Exception):
    """Raised when a tenant exceeds a plan quota."""

    def __init__(self, resource: str, limit: int, used: int, reset_at: str | None = None):
        self.resource = resource
        self.limit = limit
        self.used = used
        self.reset_at = reset_at
        super().__init__(f'Quota exceeded for {resource}: {used}/{limit}')

    def to_dict(self) -> dict:
        return {
            'error': 'quota_exceeded',
            'resource': self.resource,
            'limit': self.limit,
            'used': self.used,
            'reset_at': self.reset_at,
        }


class QuotaService:
    """Check tenant quotas against plan limits."""

    @staticmethod
    def _get_plan(tenant_id: str):
        sub = TenantSubscription.objects.filter(tenant_id=tenant_id).select_related('plan').first()
        if not sub:
            return None
        return sub.plan

    @staticmethod
    def check_queries(tenant_id: str) -> None:
        """Raise QuotaExceeded if monthly query limit reached."""
        plan = QuotaService._get_plan(tenant_id)
        if not plan:
            return
        used = MeteringService.get_queries(tenant_id)
        # Daily approximation of monthly limit
        daily_limit = plan.max_queries_per_month // 30 or plan.max_queries_per_month
        if used >= daily_limit:
            tomorrow = date.today().isoformat()
            raise QuotaExceeded('queries', daily_limit, used, reset_at=tomorrow)

    @staticmethod
    def check_tokens(tenant_id: str) -> None:
        plan = QuotaService._get_plan(tenant_id)
        if not plan:
            return
        used = MeteringService.get_tokens(tenant_id)
        daily_limit = plan.max_tokens_per_month // 30 or plan.max_tokens_per_month
        if used >= daily_limit:
            raise QuotaExceeded('tokens', daily_limit, used)

    @staticmethod
    def check_storage(tenant_id: str) -> None:
        plan = QuotaService._get_plan(tenant_id)
        if not plan:
            return
        used_bytes = MeteringService.get_storage_bytes(tenant_id)
        limit_bytes = plan.max_storage_gb * (1024 ** 3)
        if used_bytes >= limit_bytes:
            raise QuotaExceeded('storage', limit_bytes, used_bytes)

    @staticmethod
    def check_users(tenant_id: str) -> None:
        plan = QuotaService._get_plan(tenant_id)
        if not plan:
            return
        count = User.objects.filter(tenant_id=tenant_id, is_active=True).count()
        if count >= plan.max_users:
            raise QuotaExceeded('users', plan.max_users, count)

    @staticmethod
    def get_usage_summary(tenant_id: str) -> dict:
        """Return current usage vs limits for dashboard display."""
        plan = QuotaService._get_plan(tenant_id)
        queries_used = MeteringService.get_queries(tenant_id)
        tokens_used = MeteringService.get_tokens(tenant_id)
        storage_bytes = MeteringService.get_storage_bytes(tenant_id)
        users_count = User.objects.filter(tenant_id=tenant_id, is_active=True).count()

        if plan:
            return {
                'plan': plan.name,
                'queries': {'used': queries_used, 'limit': plan.max_queries_per_month // 30},
                'tokens': {'used': tokens_used, 'limit': plan.max_tokens_per_month // 30},
                'storage': {
                    'used_bytes': storage_bytes,
                    'limit_bytes': plan.max_storage_gb * (1024 ** 3),
                },
                'users': {'used': users_count, 'limit': plan.max_users},
            }
        return {
            'plan': 'None',
            'queries': {'used': queries_used, 'limit': 0},
            'tokens': {'used': tokens_used, 'limit': 0},
            'storage': {'used_bytes': storage_bytes, 'limit_bytes': 0},
            'users': {'used': users_count, 'limit': 0},
        }
