"""
Analytics models — multi-granularity metric storage, RAG quality tracking,
cost rates, and configurable alert rules.
"""
import uuid
from django.db import models
from apps.core.models import Tenant, User


# ── MetricHour ────────────────────────────────────────────────────────────────

class MetricHour(models.Model):
    """Per-tenant hourly aggregated metrics (30-day retention)."""
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant      = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='metric_hours')
    hour        = models.DateTimeField(db_index=True)          # Truncated to hour
    queries_count  = models.IntegerField(default=0)
    failed_count   = models.IntegerField(default=0)
    tokens_used    = models.IntegerField(default=0)
    avg_latency_ms = models.FloatField(default=0.0)
    p95_latency_ms = models.FloatField(default=0.0)
    active_users   = models.IntegerField(default=0)
    cost_usd       = models.DecimalField(max_digits=10, decimal_places=4, default=0)

    class Meta:
        db_table = 'metric_hours'
        unique_together = [['tenant', 'hour']]
        indexes = [models.Index(fields=['tenant', '-hour'])]

    def __str__(self):
        return f"{self.tenant.name} – {self.hour}"


# ── MetricMonth ───────────────────────────────────────────────────────────────

class MetricMonth(models.Model):
    """Per-tenant monthly aggregated metrics (permanent retention)."""
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant         = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='metric_months')
    month          = models.DateField(db_index=True)           # First day of month
    queries_count  = models.IntegerField(default=0)
    failed_count   = models.IntegerField(default=0)
    tokens_used    = models.IntegerField(default=0)
    avg_latency_ms = models.FloatField(default=0.0)
    active_users   = models.IntegerField(default=0)
    storage_bytes  = models.BigIntegerField(default=0)
    documents_count = models.IntegerField(default=0)
    cost_usd       = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    revenue_usd    = models.DecimalField(max_digits=10, decimal_places=4, default=0)

    class Meta:
        db_table = 'metric_months'
        unique_together = [['tenant', 'month']]
        indexes = [models.Index(fields=['tenant', '-month'])]

    def __str__(self):
        return f"{self.tenant.name} – {self.month.strftime('%Y-%m')}"


# ── QueryAnalytics ────────────────────────────────────────────────────────────

class QueryAnalytics(models.Model):
    """Per-RAG-query analytics record: latency, tokens, relevance, cost."""
    FEEDBACK_CHOICES = [
        ('positive', 'Positive'),
        ('negative', 'Negative'),
        ('none', 'None'),
    ]

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant          = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='query_analytics')
    user            = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='query_analytics')
    session_id      = models.UUIDField(null=True, blank=True, db_index=True)
    query_hash      = models.CharField(max_length=64, db_index=True)  # SHA-256 for privacy
    latency_ms      = models.IntegerField(default=0)
    chunks_retrieved = models.IntegerField(default=0)
    avg_relevance   = models.FloatField(null=True, blank=True)
    model_used      = models.CharField(max_length=100, blank=True)
    tokens_in       = models.IntegerField(default=0)
    tokens_out      = models.IntegerField(default=0)
    cost_usd        = models.DecimalField(max_digits=8, decimal_places=6, default=0)
    user_feedback   = models.CharField(max_length=10, choices=FEEDBACK_CHOICES, default='none')
    is_follow_up    = models.BooleanField(default=False)
    is_failed       = models.BooleanField(default=False)
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'query_analytics'
        indexes = [
            models.Index(fields=['tenant', '-created_at']),
            models.Index(fields=['user', '-created_at']),
        ]

    def __str__(self):
        return f"{self.tenant.name} – {self.created_at.date()}"


# ── CostRate ──────────────────────────────────────────────────────────────────

class CostRate(models.Model):
    """Configurable LLM cost rates for billing accuracy."""
    id                    = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider              = models.CharField(max_length=50)     # openai, ollama, anthropic
    model                 = models.CharField(max_length=100)    # gpt-4, llama3, etc.
    input_cost_per_1k     = models.DecimalField(max_digits=8, decimal_places=6, default=0)
    output_cost_per_1k    = models.DecimalField(max_digits=8, decimal_places=6, default=0)
    embedding_cost_per_1k = models.DecimalField(max_digits=8, decimal_places=6, default=0)
    effective_from        = models.DateField()
    effective_to          = models.DateField(null=True, blank=True)
    is_active             = models.BooleanField(default=True)

    class Meta:
        db_table = 'cost_rates'
        indexes = [models.Index(fields=['provider', 'model', '-effective_from'])]

    def __str__(self):
        return f"{self.provider}/{self.model}"


# ── AlertRule ─────────────────────────────────────────────────────────────────

class AlertRule(models.Model):
    """Configurable metric alert thresholds."""
    SCOPES = [('platform', 'Platform'), ('tenant', 'Tenant')]
    METRICS = [
        ('error_rate', 'Error Rate (%)'),
        ('avg_latency_ms', 'Average Latency (ms)'),
        ('queries_count', 'Query Volume'),
        ('tokens_used', 'Tokens Used'),
        ('active_users', 'Active Users'),
    ]
    CONDITIONS = [('gt', '>'), ('lt', '<'), ('gte', '≥'), ('lte', '≤')]

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name         = models.CharField(max_length=200)
    metric       = models.CharField(max_length=50, choices=METRICS)
    condition    = models.CharField(max_length=10, choices=CONDITIONS, default='gt')
    threshold    = models.FloatField()
    scope        = models.CharField(max_length=10, choices=SCOPES, default='tenant')
    tenant       = models.ForeignKey(Tenant, on_delete=models.CASCADE, null=True, blank=True, related_name='alert_rules')
    notification_channels = models.JSONField(default=list)  # ['in_app', 'email']
    is_active    = models.BooleanField(default=True)
    cooldown_minutes = models.IntegerField(default=60)
    created_by   = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_alert_rules')
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'alert_rules'

    def __str__(self):
        return self.name


# ── MetricAlert ───────────────────────────────────────────────────────────────

class MetricAlert(models.Model):
    """Triggered metric alert instances."""
    STATUSES = [
        ('open', 'Open'),
        ('acknowledged', 'Acknowledged'),
        ('resolved', 'Resolved'),
    ]

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule            = models.ForeignKey(AlertRule, on_delete=models.CASCADE, related_name='triggered_alerts')
    tenant          = models.ForeignKey(Tenant, on_delete=models.SET_NULL, null=True, blank=True, related_name='metric_alerts')
    metric_value    = models.FloatField()
    threshold_value = models.FloatField()
    status          = models.CharField(max_length=20, choices=STATUSES, default='open')
    acknowledged_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='acknowledged_alerts')
    resolved_at     = models.DateTimeField(null=True, blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'metric_alerts'
        indexes = [
            models.Index(fields=['tenant', '-created_at']),
            models.Index(fields=['status', '-created_at']),
        ]

    def __str__(self):
        return f"{self.rule.name} – {self.status}"
