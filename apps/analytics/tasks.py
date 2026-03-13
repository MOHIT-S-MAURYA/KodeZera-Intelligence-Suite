"""
Analytics Celery tasks — metric aggregation and alert evaluation.
"""
import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='apps.analytics.tasks.flush_minute_metrics')
def flush_minute_metrics():
    """Flush Redis per-minute counters into UsageMetrics (daily)."""
    from apps.analytics.services.aggregator import flush_minute_metrics as _flush
    count = _flush()
    logger.info("analytics: flush_minute_metrics updated %d rows", count)
    return count


@shared_task(name='apps.analytics.tasks.aggregate_hourly')
def aggregate_hourly():
    """Roll up last 24 h UsageMetrics into MetricHour rows."""
    from apps.analytics.services.aggregator import aggregate_hourly as _agg
    count = _agg()
    logger.info("analytics: aggregate_hourly processed %d rows", count)
    return count


@shared_task(name='apps.analytics.tasks.aggregate_monthly')
def aggregate_monthly():
    """Roll up last month's UsageMetrics into MetricMonth rows."""
    from apps.analytics.services.aggregator import aggregate_monthly as _agg
    count = _agg()
    logger.info("analytics: aggregate_monthly processed %d rows", count)
    return count


@shared_task(name='apps.analytics.tasks.cleanup_old_metrics')
def cleanup_old_metrics():
    """Delete stale MetricHour rows (older than 30 days)."""
    from apps.analytics.services.aggregator import cleanup_old_metrics as _cleanup
    result = _cleanup()
    logger.info("analytics: cleanup_old_metrics — %s", result)
    return result


@shared_task(name='apps.analytics.tasks.evaluate_alert_rules')
def evaluate_alert_rules():
    """Evaluate all active AlertRules and fire MetricAlerts."""
    from apps.analytics.services.alert_service import evaluate_all_rules
    count = evaluate_all_rules()
    logger.info("analytics: evaluate_alert_rules created %d alerts", count)
    return count
