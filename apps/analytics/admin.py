"""
Analytics app admin registrations.
"""
from django.contrib import admin
from apps.analytics.models import MetricHour, MetricMonth, QueryAnalytics, CostRate, AlertRule, MetricAlert


@admin.register(MetricHour)
class MetricHourAdmin(admin.ModelAdmin):
    list_display = ('tenant', 'hour', 'queries_count', 'failed_count', 'avg_latency_ms')
    list_filter = ('tenant',)


@admin.register(MetricMonth)
class MetricMonthAdmin(admin.ModelAdmin):
    list_display = ('tenant', 'month', 'queries_count', 'tokens_used', 'cost_usd')
    list_filter = ('tenant',)


@admin.register(QueryAnalytics)
class QueryAnalyticsAdmin(admin.ModelAdmin):
    list_display = ('tenant', 'user', 'latency_ms', 'chunks_retrieved', 'is_failed', 'created_at')
    list_filter = ('tenant', 'is_failed')


@admin.register(CostRate)
class CostRateAdmin(admin.ModelAdmin):
    list_display = ('provider', 'model', 'input_cost_per_1k', 'output_cost_per_1k', 'is_active')


@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    list_display = ('name', 'metric', 'condition', 'threshold', 'scope', 'is_active')


@admin.register(MetricAlert)
class MetricAlertAdmin(admin.ModelAdmin):
    list_display = ('rule', 'tenant', 'metric_value', 'status', 'created_at')
    list_filter = ('status',)
