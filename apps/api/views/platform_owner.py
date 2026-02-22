"""
Platform owner API views.
Handles platform-level operations with strict privacy controls.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.cache import cache
from django.db.models import Count, Sum, Avg, Q
from django.utils import timezone
from datetime import timedelta

from apps.core.models import (
    Tenant, User, SystemAuditLog, UsageMetrics,
    TenantSubscription, SubscriptionPlan, AIProviderConfig
)
from apps.documents.models import Document
from apps.core.permissions import IsPlatformOwner
from apps.api.serializers.ai_config import AIProviderConfigSerializer

_PLATFORM_OVERVIEW_TTL = 60   # 1 minute — platform stats don’t need to be real-time
_PLATFORM_OVERVIEW_KEY = 'platform:overview:v1'


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_overview(request):
    """
    Get platform-wide statistics.
    Returns metadata only, no tenant data content.
    Cached for _PLATFORM_OVERVIEW_TTL seconds — avoids N parallel
    DB queries when multiple platform owners have the tab open.
    """
    # Fast-path: serve from cache
    cached = cache.get(_PLATFORM_OVERVIEW_KEY)
    if cached is not None:
        return Response(cached)

    today = timezone.now().date()
    
    # Tenant statistics
    total_tenants = Tenant.objects.count()
    active_tenants = Tenant.objects.filter(is_active=True).count()
    suspended_tenants = Tenant.objects.filter(is_active=False).count()
    
    # User statistics (across all tenants)
    total_users = User.objects.filter(tenant__isnull=False).count()
    
    # Usage statistics for today
    today_metrics = UsageMetrics.objects.filter(date=today).aggregate(
        total_queries=Sum('queries_count'),
        failed_queries=Sum('failed_queries_count'),
        avg_response_time=Avg('avg_response_time_ms'),
        total_tokens=Sum('tokens_used'),
    )
    
    # Document statistics (count only, no content)
    total_documents = Document.objects.count()
    
    # Storage statistics
    total_storage = UsageMetrics.objects.filter(date=today).aggregate(
        total=Sum('storage_used_bytes')
    )['total'] or 0
    
    # Active sessions (users active in last hour)
    one_hour_ago = timezone.now() - timedelta(hours=1)
    active_sessions = User.objects.filter(
        last_login__gte=one_hour_ago,
        tenant__isnull=False
    ).count()
    
    # System health indicators
    embedding_queue_length = 0  # TODO: Get from Celery
    active_workers = 0  # TODO: Get from Celery
    
    data = {
        'tenants': {
            'total': total_tenants,
            'active': active_tenants,
            'suspended': suspended_tenants,
        },
        'users': {
            'total': total_users,
        },
        'usage_today': {
            'queries': today_metrics['total_queries'] or 0,
            'failed_queries': today_metrics['failed_queries'] or 0,
            'avg_response_time_ms': today_metrics['avg_response_time'] or 0,
            'tokens_used': today_metrics['total_tokens'] or 0,
        },
        'documents': {
            'total_indexed': total_documents,
        },
        'storage': {
            'total_bytes': total_storage,
            'total_gb': round(total_storage / (1024**3), 2),
        },
        'sessions': {
            'active': active_sessions,
        },
        'system': {
            'embedding_queue_length': embedding_queue_length,
            'active_workers': active_workers,
        }
    }
    
    # Log this action
    SystemAuditLog.objects.create(
        action='platform_overview_viewed',
        performed_by=request.user,
        details={'timestamp': timezone.now().isoformat()},
        ip_address=request.META.get('REMOTE_ADDR'),
        user_agent=request.META.get('HTTP_USER_AGENT', '')
    )

    cache.set(_PLATFORM_OVERVIEW_KEY, data, _PLATFORM_OVERVIEW_TTL)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def tenants_list(request):
    """
    List all tenants with optimized metadata fetching.
    """
    # Optimize query to fetch everything in constant number of queries
    tenants = Tenant.objects.select_related(
        'subscription__plan'
    ).annotate(
        users_count=Count('users', distinct=True),
        documents_count=Count('documents', distinct=True)
    )
    
    # Get latest usage metrics for all tenants efficiently
    # Since we need the *latest* metric per tenant, standard annotation is tricky.
    # We'll fetch all metrics for today or recent date and map them, 
    # OR for a perfect "latest" we can use a Subquery or accept a separate query if needed.
    # For now, let's just fetch metrics for "today" which is the most common use case for the dashboard.
    today = timezone.now().date()
    today_metrics = UsageMetrics.objects.filter(date=today).select_related('tenant')
    metrics_map = {m.tenant_id: m for m in today_metrics}
    
    tenant_data = []
    for tenant in tenants:
        # Metrics
        metric = metrics_map.get(tenant.id)
        
        # Subscription
        if hasattr(tenant, 'subscription'):
            plan_name = tenant.subscription.plan.name
            subscription_status = tenant.subscription.status
        else:
            plan_name = 'No Plan'
            subscription_status = 'inactive'
            
        tenant_data.append({
            'id': str(tenant.id),
            'name': tenant.name,
            'slug': tenant.slug,
            'is_active': tenant.is_active,
            'created_at': tenant.created_at.isoformat(),
            'users_count': tenant.users_count,
            'documents_count': tenant.documents_count,
            'plan': plan_name,
            'subscription_status': subscription_status,
            'storage_used_bytes': metric.storage_used_bytes if metric else 0,
            'queries_today': metric.queries_count if metric else 0,
        })
    
    return Response({
        'count': len(tenant_data),
        'tenants': tenant_data
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def system_health(request):
    """
    Get system health status.
    Infrastructure monitoring only.
    """
    # TODO: Integrate with actual monitoring systems
    # For now, return mock data structure
    
    health_data = {
        'api_server': {
            'status': 'healthy',
            'uptime_percentage': 99.9,
            'latency_ms': 45,
            'error_rate': 0.1,
        },
        'database': {
            'status': 'healthy',
            'uptime_percentage': 99.8,
            'connections': 12,
            'query_time_ms': 8,
        },
        'vector_db': {
            'status': 'healthy',
            'uptime_percentage': 99.7,
            'collections': 15,
            'vectors_count': 125000,
        },
        'redis': {
            'status': 'healthy',
            'uptime_percentage': 100.0,
            'memory_used_mb': 256,
            'hit_rate': 95.5,
        },
        'celery_workers': {
            'status': 'warning',
            'uptime_percentage': 98.5,
            'active_workers': 4,
            'failed_tasks': 3,
            'queue_length': 12,
        },
        'llm_provider': {
            'status': 'healthy',
            'uptime_percentage': 99.5,
            'rate_limit_remaining': 8500,
        }
    }
    
    return Response(health_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def audit_logs_list(request):
    """
    Get system-level audit logs.
    Platform owner actions only, not tenant user actions.
    """
    # Filter parameters
    action = request.query_params.get('action')
    tenant_id = request.query_params.get('tenant_id')
    days = int(request.query_params.get('days', 30))
    limit = int(request.query_params.get('limit', 50))
    offset = int(request.query_params.get('offset', 0))
    
    # Base query
    logs = SystemAuditLog.objects.select_related('performed_by', 'tenant_affected').all()
    
    # Apply filters
    if action:
        logs = logs.filter(action=action)
    if tenant_id:
        logs = logs.filter(tenant_affected_id=tenant_id)
    
    # Date range
    start_date = timezone.now() - timedelta(days=days)
    logs = logs.filter(timestamp__gte=start_date)
    
    # Get total count before slicing
    total_count = logs.count()
    
    # Apply pagination
    logs = logs[offset : offset + limit]
    
    log_data = [{
        'id': str(log.id) if hasattr(log, 'id') else None,
        'action': log.action,
        'performed_by': log.performed_by.email if log.performed_by else 'System',
        'tenant_affected': log.tenant_affected.name if log.tenant_affected else None,
        'details': log.details,
        'timestamp': log.timestamp.isoformat(),
        'ip_address': log.ip_address,
    } for log in logs]
    
    return Response({
        'count': total_count,
        'logs': log_data
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_analytics(request):
    """
    Get aggregated platform analytics over time.
    Supports filtering by tenant and date range.
    """
    # Filter parameters
    tenant_id = request.query_params.get('tenant_id')
    days_param = request.query_params.get('days')
    start_date_param = request.query_params.get('start_date')
    end_date_param = request.query_params.get('end_date')
    
    # Determine date range
    today = timezone.now().date()
    
    if start_date_param and end_date_param:
        try:
            start_date = timezone.datetime.strptime(start_date_param, '%Y-%m-%d').date()
            end_date = timezone.datetime.strptime(end_date_param, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=400)
    else:
        days = int(days_param) if days_param else 30
        end_date = today
        start_date = end_date - timedelta(days=days)
    
    # Ensure end_date is inclusive for range filter if logic requires it
    # Django range is inclusive at both ends for dates.
    
    # Base query
    metrics = UsageMetrics.objects.filter(date__range=[start_date, end_date])
    
    if tenant_id and tenant_id != 'all':
        metrics = metrics.filter(tenant_id=tenant_id)
    
    # Aggregate by date
    # Validating if we need to group by date manually or if values() handles it.
    # Since we want daily stats, we group by 'date'.
    daily_stats = metrics.values('date').annotate(
        queries=Sum('queries_count'),
        failed=Sum('failed_queries_count'),
        latency=Avg('avg_response_time_ms'),
        tokens=Sum('tokens_used'),
        users=Sum('active_users_count')
    ).order_by('date')
    
    analytics_data = []
    
    # Convert queryset result to dictionary for quick lookup
    stats_map = {stat['date']: stat for stat in daily_stats}
    
    current_date = start_date
    while current_date <= end_date:
        stat = stats_map.get(current_date)
        
        analytics_data.append({
            'date': current_date.strftime('%b %d'), # Format like 'Jan 01'
            'full_date': current_date.isoformat(),
            'queries': stat['queries'] if stat and stat['queries'] else 0,
            'failed': stat['failed'] if stat and stat['failed'] else 0,
            'latency': round(stat['latency'], 1) if stat and stat['latency'] else 0,
            'tokens': stat['tokens'] if stat and stat['tokens'] else 0,
            'users': stat['users'] if stat and stat['users'] else 0,
        })
        current_date += timedelta(days=1)
        
    return Response(analytics_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def ai_config_get(request):
    """
    GET current AI provider configuration.
    API keys are returned masked (e.g. sk-abc1***yz).
    """
    config = AIProviderConfig.get_config()
    serializer = AIProviderConfigSerializer(config)
    return Response(serializer.data)


@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def ai_config_update(request):
    """
    PUT/PATCH AI provider configuration.
    Saves the new provider, model, and optionally an API key.
    If the API key field contains the masked value, the existing key is preserved.
    """
    config = AIProviderConfig.get_config()
    serializer = AIProviderConfigSerializer(config, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    config = serializer.save()

    # Tag who updated it
    config.updated_by = request.user
    config.save(update_fields=['updated_by'])

    # Audit log
    SystemAuditLog.objects.create(
        action='config_updated',
        performed_by=request.user,
        details={
            'llm_provider': config.llm_provider,
            'llm_model': config.llm_model,
            'embedding_provider': config.embedding_provider,
            'embedding_model': config.embedding_model,
        },
        ip_address=request.META.get('REMOTE_ADDR'),
        user_agent=request.META.get('HTTP_USER_AGENT', '')
    )

    return Response(AIProviderConfigSerializer(config).data)
