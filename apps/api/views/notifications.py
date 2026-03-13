"""
Notification API views — inbox, mark-read, mark-all-read, dismiss,
unread count, preferences, admin send, admin templates.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.services.notifications import NotificationService
from apps.core.permissions import IsTenantAdmin
from apps.api.serializers.notifications import (
    UserNotificationSerializer,
    NotificationPreferenceSerializer,
    NotificationPreferenceUpdateSerializer,
    AdminSendNotificationSerializer,
    NotificationTemplateSerializer,
    UnreadCountSerializer,
)


# ── User inbox endpoints ──────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notification_list(request):
    """
    GET /api/v1/notifications/
    Returns the user's materialized inbox with pagination.

    Query params:
      - category: filter by category
      - unread: "true" for unread only
      - limit: page size (default 50, max 100)
      - offset: pagination offset
    """
    user = request.user
    category = request.query_params.get('category')
    unread_only = request.query_params.get('unread', '').lower() == 'true'
    limit = min(int(request.query_params.get('limit', 50)), 100)
    offset = int(request.query_params.get('offset', 0))

    items, total = NotificationService.get_inbox(
        user=user,
        category=category,
        unread_only=unread_only,
        limit=limit,
        offset=offset,
    )

    serializer = UserNotificationSerializer(items, many=True)
    return Response({
        'results': serializer.data,
        'total': total,
        'limit': limit,
        'offset': offset,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notification_unread_count(request):
    """GET /api/v1/notifications/unread-count/"""
    count = NotificationService.get_unread_count(request.user)
    return Response({'unread_count': count})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def notification_mark_read(request, notification_id):
    """POST /api/v1/notifications/<uuid>/read/"""
    NotificationService.mark_read(notification_id, request.user)
    return Response({'status': 'ok'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def notification_mark_all_read(request):
    """POST /api/v1/notifications/read-all/"""
    count = NotificationService.mark_all_read(request.user)
    return Response({'status': 'ok', 'count': count})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def notification_dismiss(request, notification_id):
    """DELETE /api/v1/notifications/<uuid>/"""
    NotificationService.dismiss(notification_id, request.user)
    return Response(status=status.HTTP_204_NO_CONTENT)


# ── Preference endpoints ──────────────────────────────────────────────────

@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def notification_preferences(request):
    """
    GET  /api/v1/notifications/preferences/  — list all preferences
    PUT  /api/v1/notifications/preferences/  — bulk update preferences
    """
    if request.method == 'GET':
        prefs = NotificationService.get_preferences(request.user)
        serializer = NotificationPreferenceSerializer(prefs, many=True)
        return Response(serializer.data)

    serializer = NotificationPreferenceUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    NotificationService.update_preferences(
        request.user, serializer.validated_data['preferences']
    )
    # Return updated preferences
    prefs = NotificationService.get_preferences(request.user)
    return Response(NotificationPreferenceSerializer(prefs, many=True).data)


# ── Admin endpoints ───────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def admin_send_notification(request):
    """
    POST /api/v1/admin/notifications/send/
    Admin endpoint to send targeted or broadcast notifications.
    """
    serializer = AdminSendNotificationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    if data.get('template_key'):
        notification = NotificationService.send(
            template_key=data['template_key'],
            context=data.get('context', {}),
            targets=data['targets'],
            tenant_id=request.user.tenant_id,
            created_by=request.user,
            action_url=data.get('action_url', ''),
            notification_type=data.get('notification_type', 'info'),
        )
    else:
        notification = NotificationService.send_raw(
            title=data['title'],
            message=data['message'],
            targets=data['targets'],
            tenant_id=request.user.tenant_id,
            category=data.get('category', 'admin'),
            priority=data.get('priority', 'normal'),
            notification_type=data.get('notification_type', 'info'),
            action_url=data.get('action_url', ''),
            created_by=request.user,
        )

    if notification is None:
        return Response(
            {'error': 'Template not found'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({
        'status': 'sent',
        'notification_id': str(notification.id),
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def admin_notification_templates(request):
    """
    GET /api/v1/admin/notifications/templates/
    List all notification templates.
    """
    from apps.core.models import NotificationTemplate
    templates = NotificationTemplate.objects.filter(is_active=True).order_by('key')
    serializer = NotificationTemplateSerializer(templates, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def admin_delivery_stats(request):
    """
    GET /api/v1/admin/notifications/stats/
    Delivery statistics for the admin dashboard.
    """
    days = int(request.query_params.get('days', 7))
    stats = NotificationService.get_delivery_stats(request.user.tenant_id, days=days)
    return Response(stats)
