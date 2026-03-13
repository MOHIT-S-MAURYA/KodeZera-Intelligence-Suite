"""
Redis-backed unread notification count cache.

Key pattern: notif:unread:{user_id}
Falls back to DB count if Redis is unavailable.
"""
from __future__ import annotations

import logging
from uuid import UUID

from django.conf import settings

logger = logging.getLogger(__name__)

CACHE_KEY_PREFIX = 'notif:unread:'
CACHE_TTL = 60 * 60 * 24  # 24 hours


def _get_redis():
    """Get Redis connection from Django cache backend or direct."""
    try:
        from django_redis import get_redis_connection
        return get_redis_connection('default')
    except Exception:
        return None


class UnreadCacheService:
    """Atomic unread count operations via Redis INCR/DECR."""

    @classmethod
    def _key(cls, user_id: UUID) -> str:
        return f"{CACHE_KEY_PREFIX}{user_id}"

    @classmethod
    def get(cls, user_id: UUID) -> int:
        """Get unread count; rebuild from DB if cache miss."""
        redis = _get_redis()
        if redis:
            try:
                val = redis.get(cls._key(user_id))
                if val is not None:
                    return max(0, int(val))
            except Exception:
                logger.debug("Redis get failed, falling back to DB")

        # Cache miss or no Redis — count from DB
        return cls._count_from_db(user_id)

    @classmethod
    def increment(cls, user_id: UUID, amount: int = 1) -> None:
        redis = _get_redis()
        if redis:
            try:
                key = cls._key(user_id)
                if not redis.exists(key):
                    # Seed from DB first
                    count = cls._count_from_db(user_id)
                    redis.set(key, count, ex=CACHE_TTL)
                redis.incrby(key, amount)
                redis.expire(key, CACHE_TTL)
            except Exception:
                logger.debug("Redis increment failed")

    @classmethod
    def decrement(cls, user_id: UUID, amount: int = 1) -> None:
        redis = _get_redis()
        if redis:
            try:
                key = cls._key(user_id)
                if not redis.exists(key):
                    count = cls._count_from_db(user_id)
                    redis.set(key, count, ex=CACHE_TTL)
                redis.decrby(key, amount)
                # Prevent negative
                if int(redis.get(key) or 0) < 0:
                    redis.set(key, 0, ex=CACHE_TTL)
            except Exception:
                logger.debug("Redis decrement failed")

    @classmethod
    def reset(cls, user_id: UUID) -> None:
        """Set count to 0 (e.g., after mark-all-read)."""
        redis = _get_redis()
        if redis:
            try:
                redis.set(cls._key(user_id), 0, ex=CACHE_TTL)
            except Exception:
                logger.debug("Redis reset failed")

    @classmethod
    def invalidate(cls, user_id: UUID) -> None:
        """Delete cache entry so it rebuilds on next get."""
        redis = _get_redis()
        if redis:
            try:
                redis.delete(cls._key(user_id))
            except Exception:
                logger.debug("Redis invalidate failed")

    @classmethod
    def _count_from_db(cls, user_id: UUID) -> int:
        from apps.core.models import UserNotification
        return UserNotification.objects.filter(
            user_id=user_id, is_read=False, is_dismissed=False,
        ).count()
