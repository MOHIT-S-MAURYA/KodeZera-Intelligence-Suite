"""
Serializers for the Audit Logging & Compliance module.
"""
from rest_framework import serializers

from apps.core.models import (
    AuditEvent,
    AuditRetentionPolicy,
    ComplianceLog,
    DataDeletionLog,
    SecurityAlert,
)


class AuditEventListSerializer(serializers.ModelSerializer):
    """Compact serializer for audit event list views."""
    user_email = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()
    tenant_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditEvent
        fields = [
            'id', 'scope', 'timestamp', 'action',
            'resource_type', 'resource_id',
            'user', 'user_email', 'user_name',
            'tenant_name',
            'outcome', 'status_code',
            'ip_address', 'endpoint', 'http_method',
        ]
        read_only_fields = fields

    def get_user_email(self, obj):
        return obj.user.email if obj.user_id else None

    def get_user_name(self, obj):
        if not obj.user_id:
            return 'System'
        u = obj.user
        return (f"{u.first_name} {u.last_name}".strip()) or u.email

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant_id else None


class AuditEventDetailSerializer(serializers.ModelSerializer):
    """Full serializer for a single audit event detail view."""
    user_email = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()
    tenant_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditEvent
        fields = [
            'id', 'scope', 'timestamp',
            'tenant', 'tenant_name',
            'user', 'user_email', 'user_name',
            'ip_address', 'user_agent', 'session_id',
            'action', 'resource_type', 'resource_id', 'changes',
            'request_id', 'endpoint', 'http_method',
            'outcome', 'status_code', 'error_message',
            'trigger', 'metadata',
            'regulation_tags', 'data_classification', 'retention_class',
            'previous_hash', 'event_hash',
        ]
        read_only_fields = fields

    def get_user_email(self, obj):
        return obj.user.email if obj.user_id else None

    def get_user_name(self, obj):
        if not obj.user_id:
            return 'System'
        u = obj.user
        return (f"{u.first_name} {u.last_name}".strip()) or u.email

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant_id else None


class SecurityAlertListSerializer(serializers.ModelSerializer):
    """Serializer for security alert list views."""
    tenant_name = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SecurityAlert
        fields = [
            'id', 'tenant', 'tenant_name',
            'rule_key', 'severity', 'title', 'description',
            'status', 'source_events',
            'resolved_by', 'resolved_by_name', 'resolved_at',
            'created_at',
        ]
        read_only_fields = fields

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant_id else None

    def get_resolved_by_name(self, obj):
        if not obj.resolved_by_id:
            return None
        u = obj.resolved_by
        return (f"{u.first_name} {u.last_name}".strip()) or u.email


class SecurityAlertUpdateSerializer(serializers.Serializer):
    """Serializer for updating security alert status."""
    status = serializers.ChoiceField(
        choices=['acknowledged', 'resolved', 'false_positive'],
    )
    resolution_notes = serializers.CharField(required=False, allow_blank=True)


class ComplianceLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComplianceLog
        fields = [
            'id', 'tenant', 'processing_purpose',
            'data_categories', 'data_subjects', 'recipients',
            'retention_period', 'legal_basis', 'created_at',
        ]
        read_only_fields = ['id', 'tenant', 'created_at']


class DataDeletionLogSerializer(serializers.ModelSerializer):
    requested_by_email = serializers.SerializerMethodField()
    subject_user_email = serializers.SerializerMethodField()

    class Meta:
        model = DataDeletionLog
        fields = [
            'id', 'tenant', 'requested_by', 'requested_by_email',
            'subject_user', 'subject_user_email',
            'data_scope', 'legal_basis', 'status',
            'completed_at', 'deletion_proof', 'created_at',
        ]
        read_only_fields = ['id', 'tenant', 'created_at', 'completed_at', 'deletion_proof']

    def get_requested_by_email(self, obj):
        return obj.requested_by.email if obj.requested_by_id else None

    def get_subject_user_email(self, obj):
        return obj.subject_user.email if obj.subject_user_id else None


class DataDeletionStatusUpdateSerializer(serializers.Serializer):
    """Serializer for updating data deletion request status."""
    status = serializers.ChoiceField(
        choices=['in_progress', 'completed', 'denied'],
    )
    deletion_proof = serializers.DictField(required=False)


class AuditRetentionPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditRetentionPolicy
        fields = [
            'id', 'tenant', 'retention_class', 'retention_days',
            'archive_to', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class AuditExportRequestSerializer(serializers.Serializer):
    """Input serializer for the export endpoint."""
    format = serializers.ChoiceField(choices=['csv', 'json'], default='csv')
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    scope = serializers.ChoiceField(
        choices=['tenant', 'platform', 'system'],
        required=False,
    )
