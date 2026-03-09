"""
Notification API views — list, mark-read, mark-all-read, dismiss.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils.timesince import timesince

from apps.core.models import NotificationReceipt
from apps.core.services.notifications import NotificationService


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notification_list(request):
    """
    GET /api/v1/notifications/
    Returns notifications targeted at the current user (newest first).
    """
    user = request.user
    notifications = NotificationService.get_notifications_for_user(user)[:50]

    # Collect read-receipt state in bulk
    read_ids = set(
        NotificationReceipt.objects.filter(
            user=user, is_read=True, notification__in=notifications,
        ).values_list('notification_id', flat=True)
    )

    data = []
    for n in notifications:
        data.append({
            'id': str(n.id),
            'title': n.title,
            'message': n.message,
            'category': n.category,
            'time': timesince(n.created_at) + ' ago',
            'created_at': n.created_at.isoformat(),
            'unread': n.id not in read_ids,
        })

    return Response(data)


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
    NotificationService.delete_for_user(notification_id, request.user)
    return Response(status=status.HTTP_204_NO_CONTENT)
