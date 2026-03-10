"""
RBAC (Role-Based Access Control) models.
Includes: Role, Permission, RolePermission, UserRole
"""
import uuid
from django.db import models
from apps.core.models import Tenant, User


class Role(models.Model):
    """
    Role model with inheritance support.
    Roles can inherit from parent roles.

    System roles (is_system_role=True) are auto-created per tenant
    and cannot be deleted by tenant admins.  The "Tenant Administrator"
    system role replaces the old hardcoded is_tenant_admin boolean.
    """
    SYSTEM_ADMIN_ROLE_NAME = 'Tenant Administrator'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='roles'
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children'
    )
    is_system_role = models.BooleanField(
        default=False,
        help_text='System roles are auto-created and cannot be deleted.',
    )
    max_users = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Maximum users that can hold this role. Null = unlimited.',
    )
    priority = models.PositiveIntegerField(
        default=0,
        help_text='For conflict resolution — higher priority wins.',
    )
    SCOPE_TYPES = [
        ('global', 'Global'),
        ('org_unit', 'Org Unit'),
    ]
    scope_type = models.CharField(
        max_length=20, choices=SCOPE_TYPES, default='global',
    )
    scope_org_unit = models.ForeignKey(
        'core.OrgUnit', on_delete=models.CASCADE, null=True, blank=True,
        related_name='scoped_roles',
        help_text='If scope_type=org_unit, restricts this role to a subtree.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'roles'
        ordering = ['name']
        unique_together = [['tenant', 'name']]
        indexes = [
            models.Index(fields=['tenant', 'parent']),
            models.Index(fields=['scope_type']),
        ]

    def __str__(self):
        return f"{self.tenant.name} - {self.name}"

    def get_ancestors(self):
        """Returns all parent roles up the hierarchy."""
        ancestors = []
        current = self.parent
        visited = set()  # Prevent circular references
        
        while current and current.id not in visited:
            ancestors.append(current)
            visited.add(current.id)
            current = current.parent
        
        return ancestors

    def get_all_permissions(self):
        """Returns all permissions including inherited from parent roles."""
        permission_ids = set()
        
        # Get direct permissions
        direct_perms = self.role_permissions.values_list('permission_id', flat=True)
        permission_ids.update(direct_perms)
        
        # Get inherited permissions
        for ancestor in self.get_ancestors():
            ancestor_perms = ancestor.role_permissions.values_list('permission_id', flat=True)
            permission_ids.update(ancestor_perms)
        
        return Permission.objects.filter(id__in=permission_ids)


class Permission(models.Model):
    """
    Global permission table (no tenant isolation).
    Defines system-wide permissions.
    """
    RESOURCE_TYPES = [
        ('document', 'Document'),
        ('role', 'Role'),
        ('user', 'User'),
        ('department', 'Department'),
        ('org_unit', 'Org Unit'),
        ('audit_log', 'Audit Log'),
        ('tenant', 'Tenant'),
    ]

    ACTIONS = [
        ('create', 'Create'),
        ('read', 'Read'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('manage', 'Manage'),
        ('upload', 'Upload'),
        ('download', 'Download'),
        ('share', 'Share'),
        ('query', 'Query'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    resource_type = models.CharField(max_length=50, choices=RESOURCE_TYPES)
    action = models.CharField(max_length=50, choices=ACTIONS)
    description = models.TextField(blank=True)
    conditions = models.JSONField(
        default=dict, blank=True,
        help_text='Optional ABAC conditions: {} = unrestricted, {"department": "own"} = own dept only.',
    )
    is_deny = models.BooleanField(
        default=False,
        help_text='If True, this permission DENIES rather than GRANTS. Deny always wins.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'permissions'
        ordering = ['resource_type', 'action']
        unique_together = [['resource_type', 'action']]
        indexes = [
            models.Index(fields=['resource_type', 'action']),
            models.Index(fields=['is_deny']),
        ]

    def __str__(self):
        return self.name


class RolePermission(models.Model):
    """
    Junction table linking roles to permissions.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        related_name='role_permissions'
    )
    permission = models.ForeignKey(
        Permission,
        on_delete=models.CASCADE,
        related_name='role_permissions'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'role_permissions'
        unique_together = [['role', 'permission']]
        indexes = [
            models.Index(fields=['role']),
            models.Index(fields=['permission']),
        ]

    def __str__(self):
        return f"{self.role.name} - {self.permission.name}"


class UserRole(models.Model):
    """
    Junction table linking users to roles.
    Users can have multiple roles. Supports time-bound assignments.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='user_roles'
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        related_name='user_roles'
    )
    assigned_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='role_assignments_made',
    )
    expires_at = models.DateTimeField(
        null=True, blank=True,
        help_text='Auto-expire this role assignment. Null = permanent.',
    )
    is_active = models.BooleanField(default=True)
    reason = models.CharField(
        max_length=500, blank=True, default='',
        help_text='Why this role was assigned.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_roles'
        unique_together = [['user', 'role']]
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['role']),
            models.Index(fields=['expires_at']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.role.name}"

    @property
    def is_expired(self):
        if self.expires_at is None:
            return False
        from django.utils import timezone
        return timezone.now() >= self.expires_at


class RoleClosure(models.Model):
    """Closure table for role hierarchy — O(1) ancestor/descendant queries."""
    ancestor = models.ForeignKey(
        Role, on_delete=models.CASCADE, related_name='descendant_role_links',
    )
    descendant = models.ForeignKey(
        Role, on_delete=models.CASCADE, related_name='ancestor_role_links',
    )
    depth = models.PositiveIntegerField()

    class Meta:
        db_table = 'role_closure'
        unique_together = [['ancestor', 'descendant']]
        indexes = [
            models.Index(fields=['ancestor', 'depth']),
            models.Index(fields=['descendant', 'depth']),
        ]

    def __str__(self):
        return f"{self.ancestor.name} -> {self.descendant.name} (depth={self.depth})"


# ─── Signals: keep RBAC permission cache in sync ─────────────────────────────
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

@receiver(post_save, sender=UserRole)
@receiver(post_delete, sender=UserRole)
def invalidate_user_rbac_cache(sender, instance, **kwargs):
    """
    Whenever a UserRole is created, updated or deleted, immediately bust the
    cached role and permission lookups for that user so that the next request
    returns fresh data and never serves stale permissions.
    """
    try:
        from django.core.cache import cache
        user_id = instance.user_id
        # Role resolution cache
        cache.delete(f"user:{user_id}:roles")
        # Broad permission cache (delete all known permission patterns)
        resource_types = ['document', 'role', 'user', 'department', 'audit_log', 'tenant']
        actions = ['create', 'read', 'update', 'delete', 'manage', 'upload', 'download', 'share', 'query']
        for rt in resource_types:
            for ac in actions:
                cache.delete(f"user:{user_id}:perm:{rt}:{ac}")
    except Exception:
        pass  # Never let a cache error break a DB write
