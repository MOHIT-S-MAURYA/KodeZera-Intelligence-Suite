"""
Alert evaluation service — checks AlertRules against latest metrics
and creates MetricAlert instances when thresholds are breached.
"""
import logging
from django.utils import timezone
from datetime import timedelta

logger = logging.getLogger(__name__)


def _compare(value: float, condition: str, threshold: float) -> bool:
    ops = {'gt': value > threshold, 'lt': value < threshold,
           'gte': value >= threshold, 'lte': value <= threshold}
    return ops.get(condition, False)


def _get_metric_value(metric: str, tenant, hours: int = 1) -> float | None:
    """Compute the current value for a given metric key from UsageMetrics."""
    from apps.core.models import UsageMetrics
    from django.db.models import Sum, Avg
    from django.db.models.functions import TruncHour

    since = timezone.now() - timedelta(hours=hours)
    qs = UsageMetrics.objects.filter(tenant=tenant) if tenant else UsageMetrics.objects.all()

    if metric == 'error_rate':
        agg = qs.aggregate(q=Sum('queries_count'), f=Sum('failed_queries_count'))
        total = agg['q'] or 0
        if not total:
            return None
        return round((agg['f'] or 0) / total * 100, 2)

    if metric == 'avg_latency_ms':
        val = qs.aggregate(v=Avg('avg_response_time_ms'))['v']
        return val

    if metric == 'queries_count':
        val = qs.aggregate(v=Sum('queries_count'))['v']
        return float(val or 0)

    if metric == 'tokens_used':
        val = qs.aggregate(v=Sum('tokens_used'))['v']
        return float(val or 0)

    if metric == 'active_users':
        val = qs.aggregate(v=Sum('active_users_count'))['v']
        return float(val or 0)

    return None


def evaluate_all_rules() -> int:
    """
    Evaluate all active AlertRules. Creates MetricAlert when breached.
    Returns number of alerts created.
    """
    from apps.analytics.models import AlertRule, MetricAlert

    rules = AlertRule.objects.filter(is_active=True).select_related('tenant')
    created_count = 0

    for rule in rules:
        try:
            tenant = rule.tenant  # None → platform-level
            value = _get_metric_value(rule.metric, tenant)
            if value is None:
                continue

            if not _compare(value, rule.condition, rule.threshold):
                continue

            # Check cooldown — don't spam
            cooldown_since = timezone.now() - timedelta(minutes=rule.cooldown_minutes)
            recent = MetricAlert.objects.filter(
                rule=rule,
                tenant=tenant,
                created_at__gte=cooldown_since,
            ).exists()
            if recent:
                continue

            MetricAlert.objects.create(
                rule=rule,
                tenant=tenant,
                metric_value=value,
                threshold_value=rule.threshold,
                status='open',
            )
            created_count += 1
            logger.info("MetricAlert created: rule=%s value=%.2f threshold=%.2f", rule.name, value, rule.threshold)

        except Exception as exc:
            logger.warning("evaluate_all_rules: rule %s failed: %s", rule.id, exc)

    return created_count
