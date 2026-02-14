"""
Admin configuration for models.
"""
from django.contrib import admin
from apps.core.models import Tenant, User, Department, AuditLog
from apps.rbac.models import Role, Permission, RolePermission, UserRole
from apps.documents.models import Document, DocumentAccess
from apps.rag.models import VectorChunk


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'slug']


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['email', 'username', 'tenant', 'is_tenant_admin', 'is_active', 'created_at']
    list_filter = ['is_active', 'is_tenant_admin', 'created_at']
    search_fields = ['email', 'username']
    raw_id_fields = ['tenant', 'department']


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant', 'parent', 'created_at']
    list_filter = ['created_at']
    search_fields = ['name']
    raw_id_fields = ['tenant', 'parent']


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant', 'parent', 'created_at']
    list_filter = ['created_at']
    search_fields = ['name']
    raw_id_fields = ['tenant', 'parent']


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ['name', 'resource_type', 'action']
    list_filter = ['resource_type', 'action']
    search_fields = ['name']


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ['role', 'permission', 'created_at']
    raw_id_fields = ['role', 'permission']


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ['user', 'role', 'created_at']
    raw_id_fields = ['user', 'role']


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ['title', 'tenant', 'uploaded_by', 'status', 'visibility_type', 'created_at']
    list_filter = ['status', 'visibility_type', 'created_at']
    search_fields = ['title']
    raw_id_fields = ['tenant', 'uploaded_by', 'department']


@admin.register(DocumentAccess)
class DocumentAccessAdmin(admin.ModelAdmin):
    list_display = ['document', 'access_type', 'access_id', 'granted_by', 'created_at']
    list_filter = ['access_type', 'created_at']
    raw_id_fields = ['document', 'granted_by']


@admin.register(VectorChunk)
class VectorChunkAdmin(admin.ModelAdmin):
    list_display = ['document', 'chunk_index', 'vector_id', 'created_at']
    raw_id_fields = ['document']


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['user', 'action', 'resource_type', 'created_at']
    list_filter = ['action', 'resource_type', 'created_at']
    search_fields = ['user__email']
    raw_id_fields = ['tenant', 'user']
    readonly_fields = ['created_at']
