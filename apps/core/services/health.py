"""
Health check service — runs checks against all system components,
stores results in HealthCheckLog for uptime history.
"""
import time
import logging

from django.db import connection
from django.core.cache import cache

from apps.core.models import HealthCheckLog

logger = logging.getLogger(__name__)


def _check_database() -> tuple[str, int]:
    try:
        start = time.time()
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
        latency = int((time.time() - start) * 1000)
        return ('healthy', latency)
    except Exception:
        return ('error', -1)


def _check_redis() -> tuple[str, int]:
    try:
        start = time.time()
        cache.set('health_check', 1, 10)
        cache.get('health_check')
        latency = int((time.time() - start) * 1000)
        return ('healthy', latency)
    except Exception:
        return ('error', -1)


def _check_qdrant() -> tuple[str, int]:
    try:
        start = time.time()
        from apps.rag.services.vector_store import VectorStoreService
        vs = VectorStoreService()
        vs.client.get_collections()
        latency = int((time.time() - start) * 1000)
        return ('healthy', latency)
    except Exception:
        return ('error', -1)


def _check_celery() -> tuple[str, int]:
    try:
        from celery import current_app
        start = time.time()
        ping = current_app.control.ping(timeout=1.0)
        latency = int((time.time() - start) * 1000)
        if ping:
            return ('healthy', latency)
        return ('warning', latency)
    except Exception:
        return ('error', -1)


class HealthService:

    CHECKERS = {
        'database': _check_database,
        'redis': _check_redis,
        'qdrant': _check_qdrant,
        'celery': _check_celery,
    }

    @staticmethod
    def run_all_checks() -> list[HealthCheckLog]:
        """Run all health checks and persist results."""
        logs = []
        for component, checker in HealthService.CHECKERS.items():
            status, latency = checker()
            log = HealthCheckLog.objects.create(
                component=component,
                status=status,
                latency_ms=latency if latency >= 0 else None,
                details={'latency_ms': latency},
            )
            logs.append(log)
        # API server is implicitly healthy if this code runs
        api_log = HealthCheckLog.objects.create(
            component='api_server',
            status='healthy',
            latency_ms=0,
            details={},
        )
        logs.append(api_log)
        return logs

    @staticmethod
    def get_latest_status() -> dict[str, dict]:
        """Get the most recent check result per component."""
        components = ['api_server', 'database', 'redis', 'qdrant', 'celery']
        result = {}
        for comp in components:
            latest = HealthCheckLog.objects.filter(component=comp).first()
            if latest:
                result[comp] = {
                    'status': latest.status,
                    'latency_ms': latest.latency_ms,
                    'checked_at': latest.checked_at.isoformat(),
                }
            else:
                result[comp] = {'status': 'unknown', 'latency_ms': None, 'checked_at': None}
        return result

    @staticmethod
    def get_uptime_percentage(component: str, hours: int = 24) -> float:
        """Calculate uptime % for a component over the given hours."""
        from django.utils import timezone
        from datetime import timedelta
        since = timezone.now() - timedelta(hours=hours)
        logs = HealthCheckLog.objects.filter(component=component, checked_at__gte=since)
        total = logs.count()
        if total == 0:
            return 100.0
        healthy = logs.filter(status='healthy').count()
        return round((healthy / total) * 100, 2)

    @staticmethod
    def get_history(component: str | None = None, hours: int = 24, limit: int = 100) -> list[dict]:
        """Return recent health check entries."""
        from django.utils import timezone
        from datetime import timedelta
        since = timezone.now() - timedelta(hours=hours)
        qs = HealthCheckLog.objects.filter(checked_at__gte=since)
        if component:
            qs = qs.filter(component=component)
        qs = qs[:limit]
        return [
            {
                'id': str(h.id),
                'component': h.component,
                'status': h.status,
                'latency_ms': h.latency_ms,
                'checked_at': h.checked_at.isoformat(),
            }
            for h in qs
        ]
