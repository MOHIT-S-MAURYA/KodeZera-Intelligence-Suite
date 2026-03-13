"""
Circuit breaker utility for downstream service calls.

State is stored in Redis cache and keyed by service name.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable, Any

from django.core.cache import cache


@dataclass
class CircuitConfig:
    failure_threshold: int = 5
    recovery_timeout_seconds: int = 30


class CircuitOpenError(Exception):
    """Raised when the circuit is open and calls are blocked."""


class CircuitBreaker:
    """
    Simple Redis-backed circuit breaker.

    States:
      - closed: normal traffic
      - open: fail fast
      - half_open: allow single trial request after cooldown
    """

    def __init__(self, service_name: str, config: CircuitConfig | None = None):
        self.service_name = service_name
        self.config = config or CircuitConfig()
        self.cache_key = f"circuit:{service_name}"

    def _load(self) -> dict:
        return cache.get(self.cache_key) or {
            'state': 'closed',
            'failure_count': 0,
            'opened_at': None,
        }

    def _save(self, state: dict) -> None:
        cache.set(self.cache_key, state, timeout=86400)

    def _is_recovery_window_elapsed(self, opened_at: float | None) -> bool:
        if not opened_at:
            return True
        return (time.time() - opened_at) >= self.config.recovery_timeout_seconds

    def before_call(self) -> None:
        state = self._load()
        if state['state'] == 'open':
            if self._is_recovery_window_elapsed(state.get('opened_at')):
                state['state'] = 'half_open'
                self._save(state)
            else:
                raise CircuitOpenError(
                    f"Circuit open for {self.service_name}; retry after cooldown"
                )

    def on_success(self) -> None:
        self._save({'state': 'closed', 'failure_count': 0, 'opened_at': None})

    def on_failure(self) -> None:
        state = self._load()
        failures = int(state.get('failure_count', 0)) + 1
        if failures >= self.config.failure_threshold:
            state = {
                'state': 'open',
                'failure_count': failures,
                'opened_at': time.time(),
            }
        else:
            state['failure_count'] = failures
            if state.get('state') == 'half_open':
                state['state'] = 'open'
                state['opened_at'] = time.time()
        self._save(state)

    def call(self, fn: Callable[..., Any], *args, **kwargs) -> Any:
        """
        Execute a protected call through the breaker.
        """
        self.before_call()
        try:
            result = fn(*args, **kwargs)
        except Exception:
            self.on_failure()
            raise
        self.on_success()
        return result
