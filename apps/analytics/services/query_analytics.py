"""
QueryAnalytics capture service.
Called from the RAG pipeline after each query completes.
Stores per-query metrics with SHA-256 query hashing for privacy.
"""
import hashlib
import logging
from decimal import Decimal

from django.utils import timezone

logger = logging.getLogger(__name__)


def _hash_query(text: str) -> str:
    """SHA-256 hash of query text — privacy-preserving."""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def record_query_analytics(
    *,
    tenant,
    user,
    query_text: str,
    session_id=None,
    latency_ms: int,
    chunks_retrieved: int,
    avg_relevance: float | None,
    model_used: str,
    tokens_in: int,
    tokens_out: int,
    is_failed: bool = False,
    is_follow_up: bool = False,
) -> None:
    """
    Persist a QueryAnalytics record for a completed RAG query.
    Silently skips on any error to avoid breaking the query path.
    """
    try:
        from apps.analytics.models import QueryAnalytics
        from apps.analytics.services.cost_service import estimate_cost

        cost = estimate_cost(
            provider=getattr(model_used, 'provider', 'unknown'),
            model=model_used,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
        )

        QueryAnalytics.objects.create(
            tenant=tenant,
            user=user,
            session_id=session_id,
            query_hash=_hash_query(query_text),
            latency_ms=latency_ms,
            chunks_retrieved=chunks_retrieved,
            avg_relevance=avg_relevance,
            model_used=model_used or '',
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_usd=cost,
            is_failed=is_failed,
            is_follow_up=is_follow_up,
        )
    except Exception as exc:
        logger.debug("record_query_analytics failed (non-critical): %s", exc)


def get_query_stats(tenant, user=None, days: int = 30) -> dict:
    """
    Return aggregated query analytics for a tenant (or user).
    Used by the personal analytics and tenant analytics endpoints.
    """
    from apps.analytics.models import QueryAnalytics
    from django.db.models import Count, Avg, Sum

    since = timezone.now() - __import__('datetime').timedelta(days=days)
    qs = QueryAnalytics.objects.filter(tenant=tenant, created_at__gte=since)
    if user:
        qs = qs.filter(user=user)

    agg = qs.aggregate(
        total=Count('id'),
        failed=Count('id', filter=__import__('django').db.models.Q(is_failed=True)),
        avg_latency=Avg('latency_ms'),
        total_tokens_in=Sum('tokens_in'),
        total_tokens_out=Sum('tokens_out'),
        avg_relevance=Avg('avg_relevance'),
    )

    total = agg['total'] or 0
    failed = agg['failed'] or 0
    success_rate = round((total - failed) / total * 100, 1) if total else 100.0

    return {
        'total_queries': total,
        'failed_queries': failed,
        'success_rate': success_rate,
        'avg_latency_ms': round(agg['avg_latency'] or 0, 1),
        'total_tokens': (agg['total_tokens_in'] or 0) + (agg['total_tokens_out'] or 0),
        'avg_relevance': round(agg['avg_relevance'] or 0, 3),
    }


def get_query_trend(tenant, user=None, days: int = 30) -> list:
    """
    Return daily query counts for the trend chart.
    """
    from apps.analytics.models import QueryAnalytics
    from django.db.models import Count, Q
    from django.db.models.functions import TruncDate
    import datetime

    since = timezone.now().date() - datetime.timedelta(days=days)
    qs = QueryAnalytics.objects.filter(tenant=tenant, created_at__date__gte=since)
    if user:
        qs = qs.filter(user=user)

    daily = (
        qs.annotate(day=TruncDate('created_at'))
        .values('day')
        .annotate(
            total=Count('id'),
            failed=Count('id', filter=Q(is_failed=True)),
        )
        .order_by('day')
    )

    # Build a complete date series (fill gaps with 0)
    result_map = {row['day']: row for row in daily}
    result = []
    current = since
    end = timezone.now().date()
    while current <= end:
        row = result_map.get(current)
        result.append({
            'date': current.strftime('%b %d'),
            'full_date': current.isoformat(),
            'queries': row['total'] if row else 0,
            'failed': row['failed'] if row else 0,
        })
        current += datetime.timedelta(days=1)
    return result
