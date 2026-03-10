"""
Progressive account lockout service.

Lockout strategy (per-email, Redis-backed):
  Attempts 1-5:   No lockout
  Attempt 6:      Lock 1 minute
  Attempt 10:     Lock 5 minutes
  Attempt 15:     Lock 30 minutes
  Attempt 20+:    Lock 1 hour
Successful login resets the counter.
"""
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

LOCKOUT_PREFIX = 'lockout'
LOCKOUT_TIERS = [
    # (threshold, lock_duration_seconds)
    (6, 60),       # 1 minute
    (10, 300),     # 5 minutes
    (15, 1800),    # 30 minutes
    (20, 3600),    # 1 hour
]
COUNTER_TTL = 3600  # 1 hour — counter expires if no attempts for 1h


class LockoutService:
    """Redis-backed progressive account lockout."""

    @staticmethod
    def _counter_key(email: str) -> str:
        return f"{LOCKOUT_PREFIX}:count:{email.lower()}"

    @staticmethod
    def _lock_key(email: str) -> str:
        return f"{LOCKOUT_PREFIX}:lock:{email.lower()}"

    @classmethod
    def is_locked(cls, email: str) -> tuple[bool, int]:
        """
        Returns (is_locked, remaining_seconds).
        """
        lock_until = cache.get(cls._lock_key(email))
        if lock_until is None:
            return False, 0
        now = timezone.now()
        if now >= lock_until:
            cache.delete(cls._lock_key(email))
            return False, 0
        remaining = int((lock_until - now).total_seconds())
        return True, remaining

    @classmethod
    def record_failed_attempt(cls, email: str):
        """
        Increment failure counter; apply lockout if threshold crossed.
        Also updates the User.failed_login_count for audit.
        """
        key = cls._counter_key(email)
        try:
            count = cache.incr(key)
        except ValueError:
            cache.set(key, 1, COUNTER_TTL)
            count = 1

        # Refresh TTL on counter
        cache.expire(key, COUNTER_TTL)

        # Check lockout tiers (highest tier first)
        for threshold, duration in reversed(LOCKOUT_TIERS):
            if count >= threshold:
                lock_until = timezone.now() + timedelta(seconds=duration)
                cache.set(cls._lock_key(email), lock_until, duration + 10)
                logger.warning(
                    "Account locked: email=%s attempts=%d duration=%ds",
                    email, count, duration,
                )
                # Update DB for admin visibility
                cls._update_user_lockout(email, lock_until, count)
                break

    @classmethod
    def record_success(cls, email: str):
        """Reset counters on successful login."""
        cache.delete(cls._counter_key(email))
        cache.delete(cls._lock_key(email))
        cls._clear_user_lockout(email)

    @classmethod
    def admin_unlock(cls, email: str):
        """Admin-triggered unlock."""
        cache.delete(cls._counter_key(email))
        cache.delete(cls._lock_key(email))
        cls._clear_user_lockout(email)

    @staticmethod
    def _update_user_lockout(email: str, lock_until, count: int):
        from apps.core.models import User
        User.objects.filter(email=email).update(
            locked_until=lock_until,
            failed_login_count=count,
        )

    @staticmethod
    def _clear_user_lockout(email: str):
        from apps.core.models import User
        User.objects.filter(email=email).update(
            locked_until=None,
            failed_login_count=0,
        )
