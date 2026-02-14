"""
Serializers for API.
"""
from rest_framework import serializers
from apps.core.models import User, Tenant, Department
from apps.rbac.models import Role, Permission, UserRole, RolePermission
from apps.documents.models import Document, DocumentAccess


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model."""
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 
                  'department', 'is_tenant_admin', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class TenantSerializer(serializers.ModelSerializer):
    """Serializer for Tenant model."""
    
    class Meta:
        model = Tenant
        fields = ['id', 'name', 'slug', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class DepartmentSerializer(serializers.ModelSerializer):
    """Serializer for Department model."""
    
    class Meta:
        model = Department
        fields = ['id', 'name', 'parent', 'created_at']
        read_only_fields = ['id', 'created_at']


class RoleSerializer(serializers.ModelSerializer):
    """Serializer for Role model."""
    
    class Meta:
        model = Role
        fields = ['id', 'name', 'description', 'parent', 'created_at']
        read_only_fields = ['id', 'created_at']


class PermissionSerializer(serializers.ModelSerializer):
    """Serializer for Permission model."""
    
    class Meta:
        model = Permission
        fields = ['id', 'name', 'resource_type', 'action', 'description']
        read_only_fields = ['id']


class DocumentSerializer(serializers.ModelSerializer):
    """Serializer for Document model."""
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True)
    
    class Meta:
        model = Document
        fields = ['id', 'title', 'file_path', 'file_size', 'file_type',
                  'uploaded_by', 'uploaded_by_name', 'department',
                  'classification_level', 'visibility_type', 'status',
                  'chunk_count', 'created_at']
        read_only_fields = ['id', 'uploaded_by', 'status', 'chunk_count', 'created_at']


class DocumentUploadSerializer(serializers.Serializer):
    """Serializer for document upload."""
    file = serializers.FileField()
    title = serializers.CharField(max_length=500, required=False)
    department = serializers.UUIDField(required=False, allow_null=True)
    classification_level = serializers.IntegerField(default=0, min_value=0, max_value=5)
    visibility_type = serializers.ChoiceField(
        choices=['public', 'restricted', 'private'],
        default='restricted'
    )


class DocumentAccessSerializer(serializers.ModelSerializer):
    """Serializer for DocumentAccess model."""
    
    class Meta:
        model = DocumentAccess
        fields = ['id', 'document', 'access_type', 'access_id', 'granted_by', 'created_at']
        read_only_fields = ['id', 'granted_by', 'created_at']


class RAGQuerySerializer(serializers.Serializer):
    """Serializer for RAG query."""
    question = serializers.CharField(max_length=1000)


class RAGResponseSerializer(serializers.Serializer):
    """Serializer for RAG response."""
    answer = serializers.CharField()
    sources = serializers.ListField(
        child=serializers.DictField()
    )


class UserRoleSerializer(serializers.ModelSerializer):
    """Serializer for UserRole."""
    role_name = serializers.CharField(source='role.name', read_only=True)
    
    class Meta:
        model = UserRole
        fields = ['id', 'user', 'role', 'role_name', 'created_at']
        read_only_fields = ['id', 'created_at']


class RolePermissionSerializer(serializers.ModelSerializer):
    """Serializer for RolePermission."""
    permission_name = serializers.CharField(source='permission.name', read_only=True)
    
    class Meta:
        model = RolePermission
        fields = ['id', 'role', 'permission', 'permission_name', 'created_at']
        read_only_fields = ['id', 'created_at']
