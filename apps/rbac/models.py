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
    """
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'roles'
        ordering = ['name']
        unique_together = [['tenant', 'name']]
        indexes = [
            models.Index(fields=['tenant', 'parent']),
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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'permissions'
        ordering = ['resource_type', 'action']
        unique_together = [['resource_type', 'action']]
        indexes = [
            models.Index(fields=['resource_type', 'action']),
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
    Users can have multiple roles.
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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_roles'
        unique_together = [['user', 'role']]
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['role']),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.role.name}"


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
