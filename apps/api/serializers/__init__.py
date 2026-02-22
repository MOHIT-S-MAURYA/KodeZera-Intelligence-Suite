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


class UserManagementSerializer(serializers.ModelSerializer):
    """
    Full serializer for the Users admin page.
    Includes computed fields for department/role names and handles
    password hashing + role assignment in a single create/update call.
    """
    full_name          = serializers.SerializerMethodField()
    department_name    = serializers.SerializerMethodField()
    primary_role_id    = serializers.SerializerMethodField()
    primary_role_name  = serializers.SerializerMethodField()

    # Write-only helpers — not model fields
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    role_id  = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = User
        fields = [
            'id', 'full_name', 'first_name', 'last_name', 'email',
            'department', 'department_name',
            'primary_role_id', 'primary_role_name',
            'is_active', 'is_tenant_admin', 'created_at',
            # write-only
            'password', 'role_id',
        ]
        read_only_fields = [
            'id', 'full_name', 'department_name',
            'primary_role_id', 'primary_role_name', 'created_at',
        ]
        extra_kwargs = {
            'department': {'required': False, 'allow_null': True},
        }

    # ── Read helpers ──────────────────────────────────────────────────────────

    def get_full_name(self, obj):
        return obj.full_name

    def get_department_name(self, obj):
        return obj.department.name if obj.department else None

    def get_primary_role_id(self, obj):
        ur = next(iter(obj.user_roles.all()), None)
        return str(ur.role_id) if ur else None

    def get_primary_role_name(self, obj):
        ur = next(iter(obj.user_roles.all()), None)
        return ur.role.name if ur else None

    # ── Write helpers ─────────────────────────────────────────────────────────

    def _apply_role(self, user, role_id):
        """Replace the user's primary role. Pass None to clear all roles."""
        UserRole.objects.filter(user=user).delete()
        if role_id:
            role = Role.objects.filter(id=str(role_id), tenant=user.tenant).first()
            if role:
                UserRole.objects.create(user=user, role=role)
        # Bust RBAC caches so the change is effective immediately
        try:
            from apps.rbac.services.authorization import (
                RoleResolutionService, PermissionService,
            )
            RoleResolutionService.invalidate_cache(user.id)
            PermissionService.invalidate_cache(user.id)
        except Exception:
            pass

    def create(self, validated_data):
        role_id  = validated_data.pop('role_id', None)
        password = validated_data.pop('password', None)
        # Use email as username (it's unique by DB constraint)
        validated_data.setdefault('username', validated_data['email'])
        validated_data['tenant'] = self.context['request'].user.tenant

        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()

        if role_id is not None:
            self._apply_role(user, role_id)
        return user

    def update(self, instance, validated_data):
        role_id  = validated_data.pop('role_id', None)
        password = validated_data.pop('password', None)

        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        if password:
            instance.set_password(password)
        instance.save()

        if role_id is not None:
            self._apply_role(instance, role_id)
        return instance


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
        read_only_fields = ['id', 'uploaded_by', 'file_path', 'file_size', 'file_type', 'status', 'chunk_count', 'created_at']


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
    session_id = serializers.UUIDField(required=False, allow_null=True)


class RAGResponseSerializer(serializers.Serializer):
    """Serializer for RAG response."""
    answer = serializers.CharField()
    sources = serializers.ListField(
        child=serializers.DictField()
    )
    metadata = serializers.DictField(required=False)


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
