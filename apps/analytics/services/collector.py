"""
MetricCollector — lightweight, synchronous metric collection.
Increments Redis counters per query. Falls back to direct DB writes
if Redis is unavailable (development/testing).
"""
import hashlib
import logging
import time
from datetime import datetime, timezone

from django.core.cache import cache
from django.db.models import F

logger = logging.getLogger(__name__)

# Redis key TTL: 25 hours (covers the flush window with slack)
_KEY_TTL = 25 * 3600


def _minute_ts() -> str:
    """Return the current UTC minute as a compact timestamp string."""
    return datetime.now(tz=timezone.utc).strftime('%Y%m%d%H%M')


def _day_ts() -> str:
    return datetime.now(tz=timezone.utc).strftime('%Y%m%d')


def _hour_ts() -> str:
    return datetime.now(tz=timezone.utc).strftime('%Y%m%d%H')


def record_query(
    tenant_id: str,
    user_id: str,
    latency_ms: int,
    tokens_in: int,
    tokens_out: int,
    failed: bool = False,
) -> None:
    """
    Record a single RAG query against Redis counters.
    Called synchronously from the RAG pipeline — must be fast (< 1 ms).
    """
    tid = str(tenant_id)
    uid = str(user_id) if user_id else 'anon'
    mt  = _minute_ts()
    ht  = _hour_ts()

    try:
        # Batch all increments via pipeline for atomicity + speed
        pipe = cache.client.get_client().pipeline(transaction=False)
        base = f"metric:{tid}"

        # Per-minute query count (tenant-level)
        qs_key = f"{base}:queries:{mt}"
        pipe.incr(qs_key)
        pipe.expire(qs_key, _KEY_TTL)

        if failed:
            fk = f"{base}:failed:{mt}"
            pipe.incr(fk)
            pipe.expire(fk, _KEY_TTL)

        # Tokens
        tk = f"{base}:tokens:{mt}"
        pipe.incrby(tk, tokens_in + tokens_out)
        pipe.expire(tk, _KEY_TTL)

        # Latency — list for percentile calculation
        lk = f"{base}:latency:{mt}"
        pipe.rpush(lk, latency_ms)
        pipe.expire(lk, _KEY_TTL)

        # Active user set (per day)
        ak = f"{base}:active_users:{_day_ts()}"
        pipe.sadd(ak, uid)
        pipe.expire(ak, _KEY_TTL)

        pipe.execute()

    except Exception as exc:
        # Redis unavailable — fall back to direct DB write
        logger.debug("MetricCollector Redis unavailable, using DB fallback: %s", exc)
        _db_fallback(tid, latency_ms, tokens_in + tokens_out, failed)


def _db_fallback(tenant_id: str, latency_ms: int, tokens: int, failed: bool) -> None:
    """Directly upsert today's UsageMetrics row when Redis is not available."""
    try:
        from django.utils import timezone as tz
        from apps.core.models import UsageMetrics, Tenant
        today = tz.now().date()
        tenant = Tenant.objects.get(id=tenant_id)
        um, created = UsageMetrics.objects.get_or_create(
            tenant=tenant,
            date=today,
            defaults={
                'queries_count': 0,
                'failed_queries_count': 0,
                'avg_response_time_ms': 0.0,
                'tokens_used': 0,
            }
        )
        UsageMetrics.objects.filter(pk=um.pk).update(
            queries_count=F('queries_count') + 1,
            failed_queries_count=F('failed_queries_count') + (1 if failed else 0),
            tokens_used=F('tokens_used') + tokens,
        )
    except Exception as exc2:
        logger.warning("MetricCollector DB fallback also failed: %s", exc2)


def record_document_upload(tenant_id: str, file_size_bytes: int) -> None:
    """Record a document upload in Redis. Used by the document pipeline."""
    tid = str(tenant_id)
    try:
        pipe = cache.client.get_client().pipeline(transaction=False)
        dk = f"metric:{tid}:doc_uploads:{_day_ts()}"
        sk = f"metric:{tid}:storage_delta:{_day_ts()}"
        pipe.incr(dk)
        pipe.expire(dk, _KEY_TTL)
        pipe.incrby(sk, file_size_bytes)
        pipe.expire(sk, _KEY_TTL)
        pipe.execute()
    except Exception as exc:
        logger.debug("MetricCollector upload Redis unavailable: %s", exc)
