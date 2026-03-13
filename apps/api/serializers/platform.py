"""
Serializers for Platform & SaaS models:
  TenantConfig, FeatureFlag, PlanFeatureGate, TenantFeatureFlag,
  BillingEvent, Invoice, HealthCheckLog, SubscriptionPlan (enhanced),
  TenantDetail (enhanced)
"""
from rest_framework import serializers

from apps.core.models import (
    Tenant, TenantConfig, FeatureFlag, PlanFeatureGate,
    TenantFeatureFlag, BillingEvent, Invoice, HealthCheckLog,
    SubscriptionPlan, TenantSubscription,
)


# ── Tenant (enhanced) ──────────────────────────────────────────────────────

class TenantDetailSerializer(serializers.ModelSerializer):
    plan = serializers.SerializerMethodField()
    subscription_status = serializers.SerializerMethodField()
    users_count = serializers.IntegerField(read_only=True, default=0)
    documents_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Tenant
        fields = [
            'id', 'name', 'slug', 'is_active', 'created_at', 'updated_at',
            'contact_email', 'billing_email', 'onboarding_step', 'data_region',
            'deleted_at', 'trial_ends_at',
            'plan', 'subscription_status', 'users_count', 'documents_count',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_plan(self, obj):
        sub = getattr(obj, 'subscription', None)
        if sub:
            return sub.plan.name
        return 'No Plan'

    def get_subscription_status(self, obj):
        sub = getattr(obj, 'subscription', None)
        if sub:
            return sub.status
        return 'inactive'


# ── TenantConfig ────────────────────────────────────────────────────────────

class TenantConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantConfig
        fields = [
            'password_min_length', 'password_complexity', 'mfa_enforcement',
            'session_timeout_min', 'max_login_attempts',
            'logo_url', 'primary_color', 'custom_domain',
            'ai_provider_override', 'max_tokens_per_request', 'rag_top_k',
            'retention_days', 'updated_at',
        ]
        read_only_fields = ['updated_at']


# ── Feature Flags ───────────────────────────────────────────────────────────

class FeatureFlagSerializer(serializers.ModelSerializer):
    plan_gates = serializers.SerializerMethodField()
    override_count = serializers.SerializerMethodField()

    class Meta:
        model = FeatureFlag
        fields = [
            'id', 'key', 'name', 'description', 'default_enabled',
            'is_active', 'created_at', 'plan_gates', 'override_count',
        ]
        read_only_fields = ['id', 'created_at']

    def get_plan_gates(self, obj):
        gates = PlanFeatureGate.objects.filter(feature=obj).select_related('plan')
        return {g.plan.name: g.enabled for g in gates}

    def get_override_count(self, obj):
        return TenantFeatureFlag.objects.filter(feature=obj).count()


class PlanFeatureGateSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source='plan.name', read_only=True)
    feature_key = serializers.CharField(source='feature.key', read_only=True)

    class Meta:
        model = PlanFeatureGate
        fields = ['id', 'plan', 'feature', 'enabled', 'plan_name', 'feature_key']


class TenantFeatureFlagSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)
    feature_key = serializers.CharField(source='feature.key', read_only=True)

    class Meta:
        model = TenantFeatureFlag
        fields = ['id', 'tenant', 'feature', 'enabled', 'reason', 'tenant_name', 'feature_key']


# ── Billing ─────────────────────────────────────────────────────────────────

class BillingEventSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)

    class Meta:
        model = BillingEvent
        fields = [
            'id', 'tenant', 'tenant_name', 'event_type', 'amount',
            'currency', 'stripe_event_id', 'details', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class InvoiceSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'tenant', 'tenant_name', 'invoice_number',
            'period_start', 'period_end', 'subtotal', 'tax', 'total',
            'status', 'line_items', 'pdf_url', 'paid_at', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


# ── Health ──────────────────────────────────────────────────────────────────

class HealthCheckLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = HealthCheckLog
        fields = ['id', 'component', 'status', 'latency_ms', 'details', 'checked_at']


# ── Subscription Plan (enhanced) ───────────────────────────────────────────

class SubscriptionPlanSerializer(serializers.ModelSerializer):
    subscriber_count = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionPlan
        fields = [
            'id', 'name', 'plan_type', 'description',
            'max_users', 'max_storage_gb', 'max_queries_per_month',
            'max_tokens_per_month', 'price_monthly', 'features',
            'is_active', 'created_at', 'updated_at', 'subscriber_count',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_subscriber_count(self, obj):
        return TenantSubscription.objects.filter(plan=obj, status__in=['active', 'trial']).count()


class TenantSubscriptionSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source='plan.name', read_only=True)
    plan_type = serializers.CharField(source='plan.plan_type', read_only=True)
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)

    class Meta:
        model = TenantSubscription
        fields = [
            'id', 'tenant', 'tenant_name', 'plan', 'plan_name', 'plan_type',
            'status', 'current_period_start', 'current_period_end',
            'last_payment_date', 'next_payment_date', 'payment_method',
            'created_at', 'updated_at', 'cancelled_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
