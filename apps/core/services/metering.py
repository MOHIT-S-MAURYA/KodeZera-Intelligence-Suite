"""
Real-time metering service using Redis atomic counters.

Redis key patterns:
  meter:{tenant_id}:queries:{YYYY-MM-DD}   → INCR on each RAG query
  meter:{tenant_id}:tokens:{YYYY-MM-DD}    → INCRBY token_count
  meter:{tenant_id}:storage_bytes           → absolute value (SET)
"""
from datetime import date

from django.core.cache import cache


_DAY_SECONDS = 86400 * 2  # TTL: keep counters for 2 days past the date


def _date_key(tenant_id: str, metric: str, day: date | None = None) -> str:
    d = (day or date.today()).isoformat()
    return f'meter:{tenant_id}:{metric}:{d}'


class MeteringService:
    """Thin wrapper around Redis counters for usage metering."""

    # ── Increment helpers ──────────────────────────────────────────

    @staticmethod
    def record_query(tenant_id: str) -> int:
        key = _date_key(tenant_id, 'queries')
        try:
            val = cache.incr(key)
        except ValueError:
            cache.set(key, 1, _DAY_SECONDS)
            val = 1
        return val

    @staticmethod
    def record_tokens(tenant_id: str, count: int) -> int:
        key = _date_key(tenant_id, 'tokens')
        try:
            val = cache.incr(key, count)
        except ValueError:
            cache.set(key, count, _DAY_SECONDS)
            val = count
        return val

    @staticmethod
    def set_storage_bytes(tenant_id: str, total_bytes: int) -> None:
        cache.set(f'meter:{tenant_id}:storage_bytes', total_bytes, timeout=None)

    @staticmethod
    def record_failed_query(tenant_id: str) -> int:
        key = _date_key(tenant_id, 'failed_queries')
        try:
            val = cache.incr(key)
        except ValueError:
            cache.set(key, 1, _DAY_SECONDS)
            val = 1
        return val

    # ── Read helpers ───────────────────────────────────────────────

    @staticmethod
    def get_queries(tenant_id: str, day: date | None = None) -> int:
        return cache.get(_date_key(tenant_id, 'queries', day)) or 0

    @staticmethod
    def get_tokens(tenant_id: str, day: date | None = None) -> int:
        return cache.get(_date_key(tenant_id, 'tokens', day)) or 0

    @staticmethod
    def get_failed_queries(tenant_id: str, day: date | None = None) -> int:
        return cache.get(_date_key(tenant_id, 'failed_queries', day)) or 0

    @staticmethod
    def get_storage_bytes(tenant_id: str) -> int:
        return cache.get(f'meter:{tenant_id}:storage_bytes') or 0
