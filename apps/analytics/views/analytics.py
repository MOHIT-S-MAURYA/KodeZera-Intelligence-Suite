"""
Analytics API views — org dashboard trends, personal analytics,
platform analytics (enhanced), alert rules, metric alerts.
"""
from django.core.cache import cache
from django.db.models import Sum, Avg, Count, Q
from django.utils import timezone
from datetime import timedelta, date

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.api.permissions import IsTenantAdmin
from apps.core.permissions import IsPlatformOwner
from apps.core.models import UsageMetrics, Tenant, User


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_date_range(params, default_days=30):
    """Parse start/end date params, defaulting to last N days."""
    start_param = params.get('start_date')
    end_param   = params.get('end_date')
    days        = int(params.get('days', default_days))

    today = timezone.now().date()
    if start_param and end_param:
        try:
            start = date.fromisoformat(start_param)
            end   = date.fromisoformat(end_param)
        except ValueError:
            return None, None, 'Invalid date format. Use YYYY-MM-DD.'
    else:
        end   = today
        start = end - timedelta(days=days)
    return start, end, None


def _fill_daily_series(start: date, end: date, stats_map: dict) -> list:
    """Build a complete daily date series, filling gaps with zeros."""
    result = []
    current = start
    while current <= end:
        row = stats_map.get(current)
        result.append({
            'date': current.strftime('%b %d'),
            'full_date': current.isoformat(),
            'queries': row['queries'] if row else 0,
            'failed': row['failed'] if row else 0,
            'latency': round(row['latency'], 1) if row and row['latency'] else 0,
            'tokens': row['tokens'] if row else 0,
            'users': row['users'] if row else 0,
        })
        current += timedelta(days=1)
    return result


# ── Org Dashboard Trends ─────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_trends(request):
    """
    GET /api/dashboard/trends/
    Returns daily query/token usage for the last N days (default 30).
    Used by the org dashboard trend chart. Cached 5 minutes per user.
    """
    user   = request.user
    tenant = user.tenant
    if not tenant:
        return Response({'series': [], 'summary': {}})

    start, end, err = _parse_date_range(request.query_params)
    if err:
        return Response({'error': err}, status=400)

    cache_key = f"dashboard:trends:{user.id}:{start}:{end}"
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    from apps.analytics.services.query_analytics import get_query_trend, get_query_stats
    series  = get_query_trend(tenant=tenant, days=(end - start).days + 1)
    summary = get_query_stats(tenant=tenant, days=(end - start).days + 1)

    data = {'series': series, 'summary': summary}
    cache.set(cache_key, data, 300)
    return Response(data)


# ── Personal Analytics ────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_analytics(request):
    """
    GET /api/dashboard/my-analytics/
    Per-user query stats and daily trend.
    """
    user   = request.user
    tenant = user.tenant
    if not tenant:
        return Response({'series': [], 'summary': {}})

    start, end, err = _parse_date_range(request.query_params)
    if err:
        return Response({'error': err}, status=400)

    days = (end - start).days + 1
    from apps.analytics.services.query_analytics import get_query_trend, get_query_stats

    series  = get_query_trend(tenant=tenant, user=user, days=days)
    summary = get_query_stats(tenant=tenant, user=user, days=days)

    # Top sessions by query count
    from apps.rag.models import ChatSession, ChatMessage
    top_sessions = (
        ChatSession.objects
        .filter(tenant=tenant, user=user)
        .annotate(msg_count=Count('messages', filter=Q(messages__role='user')))
        .order_by('-msg_count')[:5]
        .values('id', 'title', 'msg_count', 'created_at')
    )
    sessions_data = [
        {
            'id': str(s['id']),
            'title': s['title'] or 'Untitled session',
            'query_count': s['msg_count'],
            'created_at': s['created_at'].isoformat(),
        }
        for s in top_sessions
    ]

    return Response({'series': series, 'summary': summary, 'top_sessions': sessions_data})


# ── Department Analytics ──────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def department_analytics(request, dept_id):
    """
    GET /api/dashboard/department/<dept_id>/
    Analytics for a specific department (tenant admin only).
    """
    user   = request.user
    tenant = user.tenant
    if not tenant:
        return Response({'error': 'No tenant.'}, status=400)

    try:
        from apps.core.models import Department
        dept = Department.objects.get(id=dept_id, tenant=tenant)
    except Exception:
        return Response({'error': 'Department not found.'}, status=404)

    start, end, err = _parse_date_range(request.query_params)
    if err:
        return Response({'error': err}, status=400)

    days = (end - start).days + 1
    dept_users = User.objects.filter(department=dept)
    total_users = dept_users.count()
    active_users = dept_users.filter(is_active=True).count()

    from apps.analytics.models import QueryAnalytics
    from django.db.models import Count, Avg

    qa = QueryAnalytics.objects.filter(
        tenant=tenant,
        user__in=dept_users,
        created_at__date__gte=start,
        created_at__date__lte=end,
    ).aggregate(
        total=Count('id'),
        failed=Count('id', filter=Q(is_failed=True)),
        avg_lat=Avg('latency_ms'),
    )

    return Response({
        'department': {'id': str(dept.id), 'name': dept.name},
        'period': {'start': start.isoformat(), 'end': end.isoformat()},
        'users': {'total': total_users, 'active': active_users},
        'queries': {
            'total': qa['total'] or 0,
            'failed': qa['failed'] or 0,
            'avg_latency_ms': round(qa['avg_lat'] or 0, 1),
        },
    })


# ── Tenant Analytics (enhanced platform_analytics replacement for tenants) ───

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def tenant_analytics(request):
    """
    GET /api/analytics/tenant/
    Enhanced analytics for a tenant admin: daily series + summary stats.
    """
    user   = request.user
    tenant = user.tenant
    if not tenant:
        return Response({'error': 'No tenant.'}, status=400)

    start, end, err = _parse_date_range(request.query_params)
    if err:
        return Response({'error': err}, status=400)

    cache_key = f"analytics:tenant:{tenant.id}:{start}:{end}"
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    metrics = (
        UsageMetrics.objects
        .filter(tenant=tenant, date__range=[start, end])
        .values('date')
        .annotate(
            queries=Sum('queries_count'),
            failed=Sum('failed_queries_count'),
            latency=Avg('avg_response_time_ms'),
            tokens=Sum('tokens_used'),
            users=Sum('active_users_count'),
        )
        .order_by('date')
    )
    stats_map = {row['date']: row for row in metrics}
    series = _fill_daily_series(start, end, stats_map)

    # Summary
    total_queries = sum(d['queries'] for d in series)
    total_tokens  = sum(d['tokens'] for d in series)
    avg_latency   = (sum(d['latency'] for d in series) / len(series)) if series else 0

    data = {
        'series': series,
        'summary': {
            'total_queries': total_queries,
            'total_tokens': total_tokens,
            'avg_latency_ms': round(avg_latency, 1),
            'period_days': len(series),
        }
    }
    cache.set(cache_key, data, 300)
    return Response(data)


# ── Platform Analytics (enhanced) ────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_analytics_enhanced(request):
    """
    GET /api/platform/analytics/enhanced/
    Enhanced platform analytics with tenant breakdown and cost estimates.
    """
    start, end, err = _parse_date_range(request.query_params)
    if err:
        return Response({'error': err}, status=400)

    tenant_id = request.query_params.get('tenant_id')

    cache_key = f"analytics:platform:{tenant_id}:{start}:{end}"
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    metrics = UsageMetrics.objects.filter(date__range=[start, end])
    if tenant_id and tenant_id != 'all':
        metrics = metrics.filter(tenant_id=tenant_id)

    # Daily series
    daily = (
        metrics.values('date')
        .annotate(
            queries=Sum('queries_count'),
            failed=Sum('failed_queries_count'),
            latency=Avg('avg_response_time_ms'),
            tokens=Sum('tokens_used'),
            users=Sum('active_users_count'),
        )
        .order_by('date')
    )
    stats_map = {row['date']: row for row in daily}
    series = _fill_daily_series(start, end, stats_map)

    # Platform summary
    total_queries = sum(d['queries'] for d in series)
    total_failed  = sum(d['failed'] for d in series)
    total_tokens  = sum(d['tokens'] for d in series)
    avg_latency   = (sum(d['latency'] for d in series) / len(series)) if series else 0
    success_rate  = round((total_queries - total_failed) / total_queries * 100, 1) if total_queries else 100.0

    # Tenant breakdown
    tenant_breakdown = []
    if not (tenant_id and tenant_id != 'all'):
        tb = (
            metrics.values('tenant__id', 'tenant__name')
            .annotate(
                queries=Sum('queries_count'),
                users=Sum('active_users_count'),
                tokens=Sum('tokens_used'),
                storage=Sum('storage_used_bytes'),
            )
            .order_by('-queries')[:20]
        )
        tenant_breakdown = [
            {
                'tenant_id': str(row['tenant__id']),
                'tenant_name': row['tenant__name'],
                'queries': row['queries'] or 0,
                'users': row['users'] or 0,
                'tokens': row['tokens'] or 0,
                'storage_bytes': row['storage'] or 0,
            }
            for row in tb
        ]

    data = {
        'series': series,
        'summary': {
            'total_queries': total_queries,
            'total_failed': total_failed,
            'success_rate': success_rate,
            'total_tokens': total_tokens,
            'avg_latency_ms': round(avg_latency, 1),
        },
        'tenant_breakdown': tenant_breakdown,
    }
    cache.set(cache_key, data, 300)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_quality_analytics(request):
    """
    GET /api/platform/analytics/quality/
    RAG quality metrics across all tenants (or a specific tenant).
    """
    tenant_id = request.query_params.get('tenant_id')
    days      = int(request.query_params.get('days', 30))
    since     = timezone.now() - timedelta(days=days)

    from apps.analytics.models import QueryAnalytics

    qs = QueryAnalytics.objects.filter(created_at__gte=since)
    if tenant_id and tenant_id != 'all':
        qs = qs.filter(tenant_id=tenant_id)

    agg = qs.aggregate(
        total=Count('id'),
        failed=Count('id', filter=Q(is_failed=True)),
        avg_lat=Avg('latency_ms'),
        avg_rel=Avg('avg_relevance'),
        avg_chunks=Avg('chunks_retrieved'),
        positive_fb=Count('id', filter=Q(user_feedback='positive')),
        negative_fb=Count('id', filter=Q(user_feedback='negative')),
    )

    total = agg['total'] or 0
    with_fb = (agg['positive_fb'] or 0) + (agg['negative_fb'] or 0)
    satisfaction = round((agg['positive_fb'] or 0) / with_fb * 100, 1) if with_fb else None

    return Response({
        'total_queries': total,
        'failed_queries': agg['failed'] or 0,
        'success_rate': round((total - (agg['failed'] or 0)) / total * 100, 1) if total else 100.0,
        'avg_latency_ms': round(agg['avg_lat'] or 0, 1),
        'avg_relevance_score': round(agg['avg_rel'] or 0, 3) if agg['avg_rel'] else None,
        'avg_chunks_retrieved': round(agg['avg_chunks'] or 0, 1),
        'satisfaction_rate': satisfaction,
        'feedback_positive': agg['positive_fb'] or 0,
        'feedback_negative': agg['negative_fb'] or 0,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_forecast(request):
    """
    GET /api/platform/analytics/forecast/
    Simple linear projection of queries and tokens for the next 30 days.
    """
    days_back = int(request.query_params.get('days', 30))
    since = timezone.now().date() - timedelta(days=days_back)

    from apps.core.models import UsageMetrics
    from django.db.models import Sum
    from django.db.models.functions import TruncDate

    daily = (
        UsageMetrics.objects
        .filter(date__gte=since)
        .values('date')
        .annotate(queries=Sum('queries_count'), tokens=Sum('tokens_used'))
        .order_by('date')
    )
    if not daily:
        return Response({'forecast': []})

    # Simple average-based projection
    n = len(daily)
    avg_q = sum(d['queries'] or 0 for d in daily) / n
    avg_t = sum(d['tokens'] or 0 for d in daily) / n

    forecast = []
    last = timezone.now().date()
    for i in range(1, 31):
        d = last + timedelta(days=i)
        forecast.append({
            'date': d.strftime('%b %d'),
            'full_date': d.isoformat(),
            'queries': int(avg_q),
            'tokens': int(avg_t),
            'projected': True,
        })
    return Response({'forecast': forecast, 'avg_daily_queries': round(avg_q, 1), 'avg_daily_tokens': round(avg_t, 1)})


# ── Alert Rules ───────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def alert_rules_list(request):
    """GET list / POST create alert rules for the authenticated tenant."""
    from apps.analytics.models import AlertRule

    tenant = request.user.tenant
    if not tenant:
        return Response({'error': 'No tenant.'}, status=400)

    if request.method == 'GET':
        rules = AlertRule.objects.filter(tenant=tenant).order_by('-created_at')
        data = [
            {
                'id': str(r.id), 'name': r.name, 'metric': r.metric,
                'condition': r.condition, 'threshold': r.threshold,
                'is_active': r.is_active, 'cooldown_minutes': r.cooldown_minutes,
                'notification_channels': r.notification_channels,
                'created_at': r.created_at.isoformat(),
            }
            for r in rules
        ]
        return Response({'count': len(data), 'rules': data})

    # POST
    name      = (request.data.get('name') or '').strip()
    metric    = request.data.get('metric', '')
    condition = request.data.get('condition', 'gt')
    threshold = request.data.get('threshold')
    channels  = request.data.get('notification_channels', ['in_app'])
    cooldown  = int(request.data.get('cooldown_minutes', 60))

    valid_metrics = [m[0] for m in AlertRule.METRICS]
    if not name:
        return Response({'error': 'name is required'}, status=400)
    if metric not in valid_metrics:
        return Response({'error': f'metric must be one of: {valid_metrics}'}, status=400)
    if threshold is None:
        return Response({'error': 'threshold is required'}, status=400)

    rule = AlertRule.objects.create(
        name=name, metric=metric, condition=condition,
        threshold=float(threshold), tenant=tenant, scope='tenant',
        notification_channels=channels, cooldown_minutes=cooldown,
        created_by=request.user,
    )
    return Response({
        'id': str(rule.id), 'name': rule.name, 'metric': rule.metric,
        'condition': rule.condition, 'threshold': rule.threshold,
        'is_active': rule.is_active, 'created_at': rule.created_at.isoformat(),
    }, status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def alert_rule_detail(request, rule_id):
    """PATCH update / DELETE remove a specific alert rule."""
    from apps.analytics.models import AlertRule

    tenant = request.user.tenant
    try:
        rule = AlertRule.objects.get(id=rule_id, tenant=tenant)
    except AlertRule.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    if request.method == 'DELETE':
        rule.delete()
        return Response(status=204)

    # PATCH
    for field in ('name', 'threshold', 'condition', 'is_active', 'cooldown_minutes', 'notification_channels'):
        if field in request.data:
            setattr(rule, field, request.data[field])
    rule.save()
    return Response({'id': str(rule.id), 'name': rule.name, 'is_active': rule.is_active})


# ── Metric Alerts ─────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def metric_alerts_list(request):
    """GET triggered MetricAlerts for the authenticated tenant."""
    from apps.analytics.models import MetricAlert

    tenant = request.user.tenant
    if not tenant:
        return Response({'error': 'No tenant.'}, status=400)

    status_filter = request.query_params.get('status')
    qs = MetricAlert.objects.filter(tenant=tenant).select_related('rule').order_by('-created_at')
    if status_filter:
        qs = qs.filter(status=status_filter)

    data = [
        {
            'id': str(a.id),
            'rule_name': a.rule.name,
            'metric': a.rule.metric,
            'metric_value': a.metric_value,
            'threshold_value': a.threshold_value,
            'status': a.status,
            'created_at': a.created_at.isoformat(),
            'resolved_at': a.resolved_at.isoformat() if a.resolved_at else None,
        }
        for a in qs[:100]
    ]
    return Response({'count': len(data), 'alerts': data})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def metric_alert_action(request, alert_id, action):
    """POST acknowledge or resolve a MetricAlert."""
    from apps.analytics.models import MetricAlert

    tenant = request.user.tenant
    try:
        alert = MetricAlert.objects.get(id=alert_id, tenant=tenant)
    except MetricAlert.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)

    if action == 'acknowledge':
        alert.status = 'acknowledged'
        alert.acknowledged_by = request.user
        alert.save()
    elif action == 'resolve':
        alert.status = 'resolved'
        alert.resolved_at = timezone.now()
        alert.save()
    else:
        return Response({'error': 'action must be acknowledge or resolve'}, status=400)

    return Response({'id': str(alert.id), 'status': alert.status})


# ── Platform Alert Rules (platform owner) ─────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_alert_rules(request):
    """Platform owner: list all AlertRules or create a platform-scope rule."""
    from apps.analytics.models import AlertRule

    if request.method == 'GET':
        rules = AlertRule.objects.all().select_related('tenant').order_by('-created_at')
        data = [
            {
                'id': str(r.id), 'name': r.name, 'metric': r.metric,
                'condition': r.condition, 'threshold': r.threshold,
                'scope': r.scope, 'tenant_id': str(r.tenant_id) if r.tenant_id else None,
                'is_active': r.is_active, 'created_at': r.created_at.isoformat(),
            }
            for r in rules
        ]
        return Response({'count': len(data), 'rules': data})

    # POST — platform-scope rule
    name      = (request.data.get('name') or '').strip()
    metric    = request.data.get('metric', '')
    condition = request.data.get('condition', 'gt')
    threshold = request.data.get('threshold')
    scope     = request.data.get('scope', 'platform')
    tenant_id = request.data.get('tenant_id')

    if not name:
        return Response({'error': 'name is required'}, status=400)
    if threshold is None:
        return Response({'error': 'threshold is required'}, status=400)

    tenant = None
    if tenant_id:
        try:
            tenant = Tenant.objects.get(id=tenant_id)
        except Tenant.DoesNotExist:
            return Response({'error': 'Tenant not found.'}, status=404)

    rule = AlertRule.objects.create(
        name=name, metric=metric, condition=condition,
        threshold=float(threshold), scope=scope, tenant=tenant,
        notification_channels=request.data.get('notification_channels', ['in_app']),
        cooldown_minutes=int(request.data.get('cooldown_minutes', 60)),
        created_by=request.user,
    )
    return Response({'id': str(rule.id), 'name': rule.name}, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_metric_alerts(request):
    """Platform owner: list all triggered MetricAlerts across all tenants."""
    from apps.analytics.models import MetricAlert

    status_filter = request.query_params.get('status')
    tenant_id     = request.query_params.get('tenant_id')

    qs = MetricAlert.objects.all().select_related('rule', 'tenant').order_by('-created_at')
    if status_filter:
        qs = qs.filter(status=status_filter)
    if tenant_id:
        qs = qs.filter(tenant_id=tenant_id)

    data = [
        {
            'id': str(a.id),
            'rule_name': a.rule.name,
            'metric': a.rule.metric,
            'metric_value': a.metric_value,
            'threshold_value': a.threshold_value,
            'status': a.status,
            'tenant': a.tenant.name if a.tenant else None,
            'created_at': a.created_at.isoformat(),
        }
        for a in qs[:200]
    ]
    return Response({'count': len(data), 'alerts': data})
