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

    # ── Database ──────────────────────────────────────────────────────────────
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks['db'] = 'ok'
    except OperationalError as e:
        logger.error("Health check: DB failure: %s", e)
        checks['db'] = 'error'
        all_healthy = False

    # ── Redis / Cache ─────────────────────────────────────────────────────────
    try:
        cache.set('health_probe', '1', timeout=5)
        assert cache.get('health_probe') == '1'
        checks['cache'] = 'ok'
    except Exception as e:
        logger.error("Health check: Cache failure: %s", e)
        checks['cache'] = 'error'
        all_healthy = False

    elapsed_ms = round((time.monotonic() - start) * 1000, 1)

    payload = {
        'status': 'healthy' if all_healthy else 'degraded',
        'checks': checks,
        'response_time_ms': elapsed_ms,
    }

    return Response(payload, status=200 if all_healthy else 503)
