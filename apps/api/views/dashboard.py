"""
Dashboard view — live stats and recent activity for the signed-in tenant user.

Performance design for high-scale (100 000+ employee organisations):

  Caching
  -------
  Every response is cached in Redis keyed per-user for DASHBOARD_CACHE_TTL
  seconds.  At 60s and 100k users spread across a workday the worst-case miss
  rate is ~1 700 req/s — well within a single Django process pool.  Bump
  CACHE_VERSION to bust all cached dashboards instantly.

  Parallelism
  -----------
  All five independent DB queries run concurrently in a ThreadPoolExecutor.
  Django assigns each thread its own connection from the CONN_MAX_AGE pool.
  Wall-clock latency ≈ slowest single query, not Σ all queries.

  DB efficiency
  -------------
  * count_accessible_documents uses a DB sub-SELECT; no Python UUID set.
  * Document count + storage bytes share one aggregate() call.
  * Queries-today uses an explicit datetime range so the DB can use the
    created_at B-tree index (__date cast disables index usage on most engines).
  * AuditLog defers user_agent (potentially multi-KB TEXT) and other
    columns not needed in the activity feed.
"""
import logging
from concurrent.futures import ThreadPoolExecutor, wait, ALL_COMPLETED
from datetime import datetime, time, timedelta

from django.core.cache import cache
from django.db.models import Sum, Count
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.models import AuditLog, User
from apps.documents.models import Document
from apps.documents.services.access import DocumentAccessService
from apps.rag.models import ChatMessage

logger = logging.getLogger(__name__)

# ── Tuning ────────────────────────────────────────────────────────────────────
DASHBOARD_CACHE_TTL = 60   # seconds — short enough to feel live
CACHE_VERSION = 'v2'        # bump to invalidate all user caches without clearing Redis


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_view(request):
    """
    Live dashboard statistics + recent-activity feed for the authenticated
    tenant user.  Response is cached in Redis per-user for DASHBOARD_CACHE_TTL
    seconds; all DB queries run concurrently via ThreadPoolExecutor.
    """
    user = request.user
    tenant = user.tenant

    # ── Cache HIT fast-path ───────────────────────────────────────────────────
    cache_key = f"dashboard:{CACHE_VERSION}:{user.id}"
    cached_data = cache.get(cache_key)
    if cached_data is not None:
        resp = Response(cached_data)
        resp['Cache-Control'] = 'private, max-age=60'
        resp['X-Cache'] = 'HIT'
        return resp

    # ── Index-friendly "today" datetime boundaries ────────────────────────────
    # __date casts apply a per-row DB function and bypass B-tree indexes.
    # Explicit gte/lt boundaries let the planner use created_at directly.
    today          = timezone.localdate()
    today_start    = timezone.make_aware(datetime.combine(today, time.min))
    tomorrow_start = today_start + timedelta(days=1)

    # ── Independent query callables (run in parallel) ─────────────────────────

    def _doc_count():
        """Accessible doc count via DB sub-SELECT — no Python UUID set."""
        try:
            return DocumentAccessService.count_accessible_documents(user)
        except Exception:
            logger.exception("dashboard: doc_count failed for user %s", user.id)
            return 0

    def _tenant_aggregate():
        """Count + storage bytes in one aggregate() — halves round-trips."""
        if not tenant:
            return {'count': 0, 'total_size': 0}
        row = Document.objects.filter(tenant=tenant).aggregate(
            count=Count('id'),
            total_size=Sum('file_size'),
        )
        return {'count': row.get('count') or 0, 'total_size': row.get('total_size') or 0}

    def _users_count():
        if not tenant:
            return 0
        return User.objects.filter(tenant=tenant, is_active=True).count()

    def _queries_today():
        if not tenant:
            return 0
        return (
            ChatMessage.objects
            .filter(
                session__tenant=tenant,
                session__user=user,
                role='user',
                created_at__gte=today_start,
                created_at__lt=tomorrow_start,
            )
            .count()
        )

    def _recent_activity():
        if not tenant:
            return []
        # Defer unused columns; user_agent can be multi-KB in some environments.
        logs = (
            AuditLog.objects
            .filter(tenant=tenant)
            .select_related('user')
            .defer('user_agent', 'ip_address', 'resource_id')
            .order_by('-created_at')[:10]
        )
        result = []
        for log in logs:
            actor_name = 'Unknown'
            actor_initial = '?'
            if log.user:
                full = log.user.full_name or log.user.email
                actor_name = full
                actor_initial = full[0].upper() if full else '?'
            action_label, resource_label = _format_activity(log)
            result.append({
                'id':            str(log.id),
                'actor':         actor_name,
                'actor_initial': actor_initial,
                'action':        action_label,
                'resource':      resource_label,
                'resource_type': log.resource_type,
                'timestamp':     log.created_at.isoformat(),
            })
        return result

    # ── Run all five queries concurrently ─────────────────────────────────────
    # max_workers=5: one per task so all start simultaneously.
    # Django gives each thread its own DB connection (CONN_MAX_AGE pool).
    with ThreadPoolExecutor(max_workers=5) as pool:
        f_doc   = pool.submit(_doc_count)
        f_agg   = pool.submit(_tenant_aggregate)
        f_users = pool.submit(_users_count)
        f_qry   = pool.submit(_queries_today)
        f_act   = pool.submit(_recent_activity)
        wait([f_doc, f_agg, f_users, f_qry, f_act], return_when=ALL_COMPLETED)

    agg  = f_agg.result()
    data = {
        'documents_count':        f_doc.result(),
        'users_count':            f_users.result(),
        'queries_today':          f_qry.result(),
        'storage_used_bytes':     agg['total_size'],
        'total_tenant_documents': agg['count'],
        'recent_activity':        f_act.result(),
    }

    cache.set(cache_key, data, DASHBOARD_CACHE_TTL)
    resp = Response(data)
    resp['Cache-Control'] = 'private, max-age=60'
    resp['X-Cache'] = 'MISS'
    return resp


# ── Cache invalidation helper ─────────────────────────────────────────────────

def invalidate_dashboard_cache(user_id) -> None:
    """
    Purge the cached dashboard for *user_id* so the next request sees fresh
    data immediately instead of waiting for the TTL.  Call this after document
    upload/delete, role assignment, or any other event that changes the numbers
    a user sees on their dashboard::

        from apps.api.views.dashboard import invalidate_dashboard_cache
        invalidate_dashboard_cache(request.user.id)
    """
    cache.delete(f"dashboard:{CACHE_VERSION}:{user_id}")


# ── Formatting helpers ────────────────────────────────────────────────────────

_ACTION_LABELS: dict[str, str] = {
    'create':        'created',
    'update':        'updated',
    'delete':        'deleted',
    'read':          'read',
    'login':         'logged in',
    'logout':        'logged out',
    'upload':        'uploaded',
    'download':      'downloaded',
    'query':         'sent a query to',
    'grant_access':  'granted access to',
    'revoke_access': 'revoked access to',
}

_RESOURCE_LABELS: dict[str, str] = {
    'document':   'a document',
    'role':       'a role',
    'user':       'a user',
    'department': 'a department',
    'audit_log':  'an audit log',
    'session':    'a chat session',
    'folder':     'a folder',
}


def _format_activity(log: AuditLog) -> tuple[str, str]:
    """Return a human-readable (action, resource) pair for an AuditLog row."""
    action = _ACTION_LABELS.get(log.action, log.action)
    meta   = log.metadata or {}
    resource_name = (
        meta.get('document_title')
        or meta.get('role_name')
        or meta.get('department_name')
        or meta.get('email')
        or meta.get('title')
        or meta.get('name')
        or _RESOURCE_LABELS.get(log.resource_type, log.resource_type)
    )
    return action, resource_name
