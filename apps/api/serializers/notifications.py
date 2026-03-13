"""
Serializers for the notification system.
"""
from rest_framework import serializers
from apps.core.models import (
    UserNotification, NotificationTemplate, UserNotificationPreference,
    DeliveryRecord,
)


class UserNotificationSerializer(serializers.ModelSerializer):
    """Serializer for the materialized user inbox."""
    time_ago = serializers.SerializerMethodField()

    class Meta:
        model = UserNotification
        fields = [
            'id', 'title', 'message', 'notification_type', 'category',
            'priority', 'action_url', 'metadata', 'is_read', 'read_at',
            'is_dismissed', 'created_at', 'time_ago',
        ]
        read_only_fields = fields

    def get_time_ago(self, obj):
        from django.utils import timezone
        delta = timezone.now() - obj.created_at
        seconds = int(delta.total_seconds())
        if seconds < 60:
            return 'just now'
        elif seconds < 3600:
            mins = seconds // 60
            return f'{mins}m ago'
        elif seconds < 86400:
            hours = seconds // 3600
            return f'{hours}h ago'
        else:
            days = seconds // 86400
            return f'{days}d ago'


class NotificationTemplateSerializer(serializers.ModelSerializer):
    """Admin serializer for notification templates."""

    class Meta:
        model = NotificationTemplate
        fields = [
            'id', 'key', 'title_template', 'message_template',
            'email_subject', 'email_body',
            'category', 'default_priority', 'default_channels',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class NotificationPreferenceSerializer(serializers.Serializer):
    """Serializer for user notification preferences."""
    category = serializers.CharField()
    channel = serializers.ChoiceField(choices=['in_app', 'email', 'browser_push'])
    enabled = serializers.BooleanField()
    digest_mode = serializers.ChoiceField(
        choices=['instant', 'hourly', 'daily', 'weekly'],
        default='instant',
    )
    mandatory = serializers.BooleanField(read_only=True, required=False)


class NotificationPreferenceUpdateSerializer(serializers.Serializer):
    """Serializer for bulk updating preferences."""
    preferences = NotificationPreferenceSerializer(many=True)


class DeliveryRecordSerializer(serializers.ModelSerializer):
    """Admin serializer for delivery tracking."""

    class Meta:
        model = DeliveryRecord
        fields = [
            'id', 'user_notification', 'channel', 'status',
            'sent_at', 'delivered_at', 'failure_reason',
            'retry_count', 'created_at',
        ]
        read_only_fields = fields


class AdminSendNotificationSerializer(serializers.Serializer):
    """Serializer for admin broadcast / targeted send."""
    template_key = serializers.CharField(required=False, allow_blank=True)
    title = serializers.CharField(required=False, max_length=255)
    message = serializers.CharField(required=False, max_length=2000)
    targets = serializers.ListField(
        child=serializers.DictField(),
        min_length=1,
    )
    context = serializers.DictField(required=False, default=dict)
    category = serializers.ChoiceField(
        choices=['documents', 'chat', 'system', 'admin', 'security', 'user_management'],
        default='admin',
    )
    priority = serializers.ChoiceField(
        choices=['low', 'normal', 'high', 'urgent'],
        default='normal',
    )
    action_url = serializers.URLField(required=False, allow_blank=True, default='')
    notification_type = serializers.ChoiceField(
        choices=['info', 'success', 'warning', 'error', 'system'],
        default='info',
    )

    def validate(self, data):
        # Must provide either template_key or (title + message)
        if not data.get('template_key') and not (data.get('title') and data.get('message')):
            raise serializers.ValidationError(
                "Provide either 'template_key' or both 'title' and 'message'."
            )
        # Validate target structure
        for target in data['targets']:
            if 'type' not in target or 'id' not in target:
                raise serializers.ValidationError(
                    "Each target must have 'type' and 'id' keys."
                )
            if target['type'] not in ('user', 'department', 'role', 'tenant'):
                raise serializers.ValidationError(
                    f"Invalid target type: {target['type']}"
                )
        return data


class UnreadCountSerializer(serializers.Serializer):
    """Simple serializer for unread count response."""
    unread_count = serializers.IntegerField()
