"""
Metric aggregation service — flushes Redis counters into DB tables.

Pipeline:
    flush_minute_metrics()    Redis counters → UsageMetrics (daily, upsert)
    aggregate_hourly()        UsageMetrics last 24 h → MetricHour
    aggregate_monthly()       UsageMetrics last month → MetricMonth
    cleanup_old_metrics()     Delete MetricHour > 30 d
"""
import logging
from datetime import timedelta, timezone as dt_tz, datetime

from django.db.models import Sum, Avg, Count, F
from django.utils import timezone

logger = logging.getLogger(__name__)


def flush_minute_metrics() -> int:
    """
    Flush Redis per-minute counters into UsageMetrics (daily granularity).
    Returns the number of tenant-days updated.
    """
    try:
        from django.core.cache import cache
        redis_client = cache.client.get_client()
    except Exception as exc:
        logger.warning("flush_minute_metrics: Redis unavailable — %s", exc)
        return 0

    from apps.core.models import UsageMetrics, Tenant
    from django.db.models import F

    updated = 0
    # Scan for all query counter keys
    pattern = "metric:*:queries:*"
    try:
        keys = list(redis_client.scan_iter(pattern, count=500))
    except Exception as exc:
        logger.warning("flush_minute_metrics: scan failed — %s", exc)
        return 0

    # Aggregate per tenant per day
    agg: dict[tuple, dict] = {}  # (tenant_id, date_str) → {queries, failed, tokens, latency_list}

    for key in keys:
        try:
            parts = key.decode() if isinstance(key, bytes) else key
            # metric:{tenant_id}:queries:{YYYYMMDDHHmm}
            segments = parts.split(':')
            if len(segments) < 4:
                continue
            tenant_id = segments[1]
            minute_ts = segments[3]
            date_str = minute_ts[:8]  # YYYYMMDD

            bucket = agg.setdefault((tenant_id, date_str), {
                'queries': 0, 'failed': 0, 'tokens': 0, 'latency_values': []
            })

            count_val = redis_client.get(key)
            bucket['queries'] += int(count_val or 0)

            # Check failed
            failed_key = f"metric:{tenant_id}:failed:{minute_ts}"
            fv = redis_client.get(failed_key)
            bucket['failed'] += int(fv or 0)

            # Check tokens
            token_key = f"metric:{tenant_id}:tokens:{minute_ts}"
            tv = redis_client.get(token_key)
            bucket['tokens'] += int(tv or 0)

            # Latency list
            latency_key = f"metric:{tenant_id}:latency:{minute_ts}"
            lv = redis_client.lrange(latency_key, 0, -1)
            bucket['latency_values'].extend([int(x) for x in lv])

        except Exception as exc:
            logger.debug("flush_minute_metrics: error processing key %s: %s", key, exc)
            continue

    # Upsert into UsageMetrics
    for (tenant_id, date_str), data in agg.items():
        try:
            from datetime import date as date_type
            d = date_type(int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]))
            tenant = Tenant.objects.get(id=tenant_id)

            avg_lat = (sum(data['latency_values']) / len(data['latency_values'])
                       if data['latency_values'] else 0.0)

            # Active users
            active_key = f"metric:{tenant_id}:active_users:{date_str}"
            active_count = redis_client.scard(active_key) or 0

            um, created = UsageMetrics.objects.get_or_create(
                tenant=tenant, date=d,
                defaults={
                    'queries_count': data['queries'],
                    'failed_queries_count': data['failed'],
                    'avg_response_time_ms': avg_lat,
                    'tokens_used': data['tokens'],
                    'active_users_count': int(active_count),
                }
            )
            if not created:
                UsageMetrics.objects.filter(pk=um.pk).update(
                    queries_count=F('queries_count') + data['queries'],
                    failed_queries_count=F('failed_queries_count') + data['failed'],
                    tokens_used=F('tokens_used') + data['tokens'],
                    active_users_count=int(active_count),
                )
            updated += 1
        except Exception as exc:
            logger.warning("flush_minute_metrics: upsert failed for %s/%s: %s", tenant_id, date_str, exc)

    return updated


def aggregate_hourly() -> int:
    """
    Aggregate last 24 h of UsageMetrics into MetricHour rows.
    Returns number of MetricHour rows created/updated.
    """
    from apps.analytics.models import MetricHour
    from apps.core.models import UsageMetrics, Tenant

    now = timezone.now()
    window_start = now - timedelta(hours=25)

    rows = (
        UsageMetrics.objects
        .filter(created_at__gte=window_start)
        .select_related('tenant')
    )

    updated = 0
    for row in rows:
        hour = now.replace(minute=0, second=0, microsecond=0)
        obj, created = MetricHour.objects.update_or_create(
            tenant=row.tenant,
            hour=row.date,  # daily row → approximate to midnight
            defaults={
                'queries_count': row.queries_count,
                'failed_count': row.failed_queries_count,
                'tokens_used': row.tokens_used,
                'avg_latency_ms': row.avg_response_time_ms,
                'active_users': row.active_users_count,
            }
        )
        updated += 1

    return updated


def aggregate_monthly() -> int:
    """
    Aggregate last month's UsageMetrics into MetricMonth rows.
    Returns number of MetricMonth rows created/updated.
    """
    from apps.analytics.models import MetricMonth
    from apps.core.models import UsageMetrics, Tenant

    now = timezone.now()
    first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # Cover previous full month + current
    window_start = (first_of_month - timedelta(days=1)).replace(day=1)

    from django.db.models import Sum, Avg, Max

    monthly_agg = (
        UsageMetrics.objects
        .filter(date__gte=window_start.date())
        .values('tenant')
        .annotate(
            month_start=window_start.date(),
            total_queries=Sum('queries_count'),
            total_failed=Sum('failed_queries_count'),
            total_tokens=Sum('tokens_used'),
            avg_lat=Avg('avg_response_time_ms'),
            max_users=Max('active_users_count'),
            total_storage=Max('storage_used_bytes'),
            total_docs=Max('documents_count'),
        )
    )

    updated = 0
    for row in monthly_agg:
        try:
            tenant = Tenant.objects.get(id=row['tenant'])
            MetricMonth.objects.update_or_create(
                tenant=tenant,
                month=window_start.date(),
                defaults={
                    'queries_count': row['total_queries'] or 0,
                    'failed_count': row['total_failed'] or 0,
                    'tokens_used': row['total_tokens'] or 0,
                    'avg_latency_ms': row['avg_lat'] or 0.0,
                    'active_users': row['max_users'] or 0,
                    'storage_bytes': row['total_storage'] or 0,
                    'documents_count': row['total_docs'] or 0,
                }
            )
            updated += 1
        except Exception as exc:
            logger.warning("aggregate_monthly: failed for tenant %s: %s", row['tenant'], exc)

    return updated


def cleanup_old_metrics() -> dict:
    """
    Delete stale metric data:
      - MetricHour rows older than 30 days
    Returns counts of deleted rows.
    """
    from apps.analytics.models import MetricHour

    cutoff_hour = timezone.now() - timedelta(days=30)

    hours_deleted, _ = MetricHour.objects.filter(hour__lt=cutoff_hour).delete()

    return {'metric_hours_deleted': hours_deleted}
