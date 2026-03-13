"""
Feature flag evaluation service.

Resolution order:
  1. Per-tenant override (TenantFeatureFlag) — explicit on/off
  2. Plan-level gate (PlanFeatureGate) — enabled for plan tier
  3. Global default (FeatureFlag.default_enabled)
"""
from django.core.cache import cache

from apps.core.models import FeatureFlag, PlanFeatureGate, TenantFeatureFlag


_FLAG_CACHE_TTL = 60  # seconds


class FeatureFlagService:

    @staticmethod
    def is_enabled(tenant_id: str, feature_key: str) -> bool:
        """
        Evaluate whether *feature_key* is enabled for *tenant_id*.
        Uses a short cache to avoid per-request DB hits.
        """
        cache_key = f'ff:{tenant_id}:{feature_key}'
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        result = FeatureFlagService._evaluate(tenant_id, feature_key)
        cache.set(cache_key, result, _FLAG_CACHE_TTL)
        return result

    @staticmethod
    def _evaluate(tenant_id: str, feature_key: str) -> bool:
        try:
            flag = FeatureFlag.objects.get(key=feature_key)
        except FeatureFlag.DoesNotExist:
            return False

        if not flag.is_active:
            return False

        # 1. Per-tenant override
        override = TenantFeatureFlag.objects.filter(
            tenant_id=tenant_id, feature=flag,
        ).first()
        if override is not None:
            return override.enabled

        # 2. Plan-level gate
        from apps.core.models import TenantSubscription
        sub = TenantSubscription.objects.filter(tenant_id=tenant_id).select_related('plan').first()
        if sub:
            gate = PlanFeatureGate.objects.filter(plan=sub.plan, feature=flag).first()
            if gate is not None:
                return gate.enabled

        # 3. Global default
        return flag.default_enabled

    @staticmethod
    def get_all_for_tenant(tenant_id: str) -> dict[str, bool]:
        """Return {feature_key: enabled} dict for every active flag."""
        flags = FeatureFlag.objects.filter(is_active=True)
        return {f.key: FeatureFlagService.is_enabled(tenant_id, f.key) for f in flags}

    @staticmethod
    def set_override(tenant_id: str, feature_key: str, enabled: bool, reason: str = '') -> TenantFeatureFlag:
        flag = FeatureFlag.objects.get(key=feature_key)
        override, _ = TenantFeatureFlag.objects.update_or_create(
            tenant_id=tenant_id, feature=flag,
            defaults={'enabled': enabled, 'reason': reason},
        )
        cache.delete(f'ff:{tenant_id}:{feature_key}')
        return override

    @staticmethod
    def remove_override(tenant_id: str, feature_key: str) -> bool:
        deleted, _ = TenantFeatureFlag.objects.filter(
            tenant_id=tenant_id, feature__key=feature_key,
        ).delete()
        cache.delete(f'ff:{tenant_id}:{feature_key}')
        return deleted > 0
