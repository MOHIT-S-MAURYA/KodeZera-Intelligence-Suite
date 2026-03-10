"""
Serializers for OrgUnit, membership, and enhanced role/permission endpoints.
"""
from rest_framework import serializers
from apps.core.models import OrgUnit, UserOrgUnit, User
from apps.rbac.models import Role, Permission


# ── OrgUnit Serializers ──────────────────────────────────────────────────

class OrgUnitSerializer(serializers.ModelSerializer):
    """Full CRUD serializer for OrgUnit."""
    parent_name = serializers.SerializerMethodField()
    head_name = serializers.SerializerMethodField()
    member_count = serializers.IntegerField(read_only=True, default=0)
    children_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = OrgUnit
        fields = [
            'id', 'name', 'code', 'description', 'unit_type',
            'parent', 'parent_name', 'depth', 'path',
            'head', 'head_name', 'is_active', 'metadata',
            'member_count', 'children_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'depth', 'path', 'parent_name', 'head_name',
            'member_count', 'children_count', 'created_at', 'updated_at',
        ]
        extra_kwargs = {
            'parent': {'required': False, 'allow_null': True},
            'code': {'required': False, 'allow_blank': True},
            'description': {'required': False, 'allow_blank': True},
            'head': {'required': False, 'allow_null': True},
            'metadata': {'required': False},
        }

    def get_parent_name(self, obj):
        return obj.parent.name if obj.parent_id else None

    def get_head_name(self, obj):
        if obj.head_id:
            return obj.head.full_name if hasattr(obj, '_head_cache') or obj.head else None
        return None

    def validate_parent(self, value):
        if value is None:
            return value
        request = self.context.get('request')
        if request and value.tenant_id != request.user.tenant_id:
            raise serializers.ValidationError('Parent must belong to the same tenant.')
        if self.instance and value.pk == self.instance.pk:
            raise serializers.ValidationError('An org unit cannot be its own parent.')
        return value


class OrgUnitTreeSerializer(serializers.Serializer):
    """Read-only recursive tree serializer for org unit hierarchy."""
    id = serializers.UUIDField()
    name = serializers.CharField()
    code = serializers.CharField()
    unit_type = serializers.CharField()
    depth = serializers.IntegerField()
    member_count = serializers.IntegerField(default=0)
    head = serializers.SerializerMethodField()
    children = serializers.SerializerMethodField()

    def get_head(self, obj):
        if isinstance(obj, dict):
            return obj.get('head')
        if obj.head_id:
            return {'id': str(obj.head.id), 'name': obj.head.full_name}
        return None

    def get_children(self, obj):
        if isinstance(obj, dict):
            children = obj.get('children', [])
        else:
            children = getattr(obj, '_children', [])
        return OrgUnitTreeSerializer(children, many=True).data


class OrgUnitMoveSerializer(serializers.Serializer):
    """Serializer for moving an org unit to a new parent."""
    new_parent_id = serializers.UUIDField(required=False, allow_null=True)


class OrgUnitMemberSerializer(serializers.ModelSerializer):
    """Serializer for org unit membership."""
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)

    class Meta:
        model = UserOrgUnit
        fields = [
            'id', 'user', 'user_name', 'user_email',
            'org_unit', 'membership_type',
            'started_at', 'expires_at', 'is_active',
        ]
        read_only_fields = ['id', 'org_unit', 'user_name', 'user_email']
        extra_kwargs = {
            'expires_at': {'required': False, 'allow_null': True},
        }


class OrgUnitAddMemberSerializer(serializers.Serializer):
    """Serializer for adding a member to an org unit."""
    user_id = serializers.UUIDField()
    membership_type = serializers.ChoiceField(
        choices=['primary', 'secondary', 'temporary'], default='secondary',
    )
    expires_at = serializers.DateTimeField(required=False, allow_null=True)


# ── Enhanced Role Serializers ────────────────────────────────────────────

class RoleTreeSerializer(serializers.Serializer):
    """Read-only recursive tree serializer for role hierarchy."""
    id = serializers.UUIDField()
    name = serializers.CharField()
    is_system_role = serializers.BooleanField()
    user_count = serializers.IntegerField(default=0)
    permission_count = serializers.IntegerField(default=0)
    children = serializers.SerializerMethodField()

    def get_children(self, obj):
        if isinstance(obj, dict):
            children = obj.get('children', [])
        else:
            children = getattr(obj, '_children', [])
        return RoleTreeSerializer(children, many=True).data


class RolePermissionsSerializer(serializers.Serializer):
    """Serializer for role's permissions including inherited."""
    id = serializers.UUIDField()
    name = serializers.CharField()
    resource_type = serializers.CharField()
    action = serializers.CharField()
    is_deny = serializers.BooleanField()
    inherited_from = serializers.UUIDField(allow_null=True)
    inherited_from_name = serializers.CharField(allow_null=True)


# ── Permission Matrix Serializer ─────────────────────────────────────────

class PermissionMatrixSerializer(serializers.Serializer):
    """Serializer for the roles × permissions matrix response."""
    permissions = serializers.ListField()
    roles = serializers.ListField()


# ── User Effective Permissions Serializer ────────────────────────────────

class UserEffectivePermissionSerializer(serializers.Serializer):
    """Serializer for a single effective permission."""
    resource_type = serializers.CharField()
    action = serializers.CharField()
    granted = serializers.BooleanField()
    conditions = serializers.DictField(required=False, allow_null=True)
    source = serializers.CharField()
