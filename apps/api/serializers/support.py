"""
SupportTicket serializer.
"""
from rest_framework import serializers
from apps.core.models import SupportTicket


class SupportTicketSerializer(serializers.ModelSerializer):
    tenant_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    created_by_email = serializers.SerializerMethodField()
    created_by_role = serializers.SerializerMethodField()
    tenant_slug = serializers.SerializerMethodField()

    class Meta:
        model = SupportTicket
        fields = [
            'id', 'subject', 'description', 'category',
            'priority', 'status',
            'tenant', 'tenant_name', 'tenant_slug',
            'created_by', 'created_by_name', 'created_by_email', 'created_by_role',
            'context_info',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'tenant', 'created_by',
                            'tenant_name', 'tenant_slug', 'created_by_name',
                            'created_by_email', 'created_by_role']

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant else None

    def get_tenant_slug(self, obj):
        return obj.tenant.slug if obj.tenant else None

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.full_name or obj.created_by.username

    def get_created_by_email(self, obj):
        return obj.created_by.email if obj.created_by else None

    def get_created_by_role(self, obj):
        if not obj.created_by:
            return None
        if obj.created_by.is_superuser:
            return 'Platform Owner'
        if obj.created_by.is_tenant_admin:
            return 'Tenant Admin'
        return 'User'
