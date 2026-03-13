"""
Public health check endpoint for load balancers, Docker HEALTHCHECK,
and Kubernetes liveness/readiness probes.
No authentication required — but is intentionally minimal to avoid
leaking system information.
"""
import time
import logging
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db import connection, OperationalError
from django.core.cache import cache

logger = logging.getLogger(__name__)


def _check_db() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return True
    except OperationalError as e:
        logger.error("Health check: DB failure: %s", e)
        return False


def _check_cache() -> bool:
    try:
        cache.set('health_probe', '1', timeout=5)
        return cache.get('health_probe') == '1'
    except Exception as e:
        logger.error("Health check: Cache failure: %s", e)
        return False


def _check_qdrant() -> bool:
    try:
        from apps.rag.services.vector_store import VectorStoreService
        vs = VectorStoreService()
        vs.client.get_collections()
        return True
    except Exception as e:
        logger.error("Health check: Qdrant failure: %s", e)
        return False


@api_view(['GET'])
@permission_classes([AllowAny])
def healthz(request):
    """
    Fast liveness endpoint for orchestrators.
    Returns 200 when process is alive.
    """
    return Response({'status': 'ok'}, status=200)


@api_view(['GET'])
@permission_classes([AllowAny])
def readyz(request):
    """
    Readiness endpoint for traffic admission checks.
    Verifies critical dependencies.
    """
    start = time.monotonic()
    checks = {
        'db': 'ok' if _check_db() else 'error',
        'cache': 'ok' if _check_cache() else 'error',
        'qdrant': 'ok' if _check_qdrant() else 'error',
    }
    healthy = all(v == 'ok' for v in checks.values())
    elapsed_ms = round((time.monotonic() - start) * 1000, 1)
    return Response(
        {
            'status': 'ready' if healthy else 'not_ready',
            'checks': checks,
            'response_time_ms': elapsed_ms,
        },
        status=200 if healthy else 503,
    )


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    GET /api/health/

    Returns 200 if all critical services are healthy, 503 otherwise.
    Used by:
    - Docker HEALTHCHECK
    - Kubernetes liveness probe
    - Nginx upstream health monitoring
    - DevOps dashboards

    Response payload is intentionally minimal — no system details exposed.
    """
    start = time.monotonic()
    checks = {}
    all_healthy = True

    checks['db'] = 'ok' if _check_db() else 'error'
    checks['cache'] = 'ok' if _check_cache() else 'error'
    all_healthy = checks['db'] == 'ok' and checks['cache'] == 'ok'

    elapsed_ms = round((time.monotonic() - start) * 1000, 1)

    payload = {
        'status': 'healthy' if all_healthy else 'degraded',
        'checks': checks,
        'response_time_ms': elapsed_ms,
    }

    return Response(payload, status=200 if all_healthy else 503)
