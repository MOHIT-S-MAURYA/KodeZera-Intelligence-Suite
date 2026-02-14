"""
Authorization service for role and permission resolution.
"""
from typing import Set, List
from uuid import UUID
from django.core.cache import cache
from django.db.models import Q
from apps.core.models import User
from apps.rbac.models import Role, Permission, UserRole, RolePermission


class RoleResolutionService:
    """Service for resolving user roles including inheritance."""
    
    CACHE_TIMEOUT = 3600  # 1 hour
    
    @classmethod
    def get_cache_key(cls, user_id: UUID) -> str:
        """Generate cache key for user roles."""
        return f"user:{user_id}:roles"
    
    @classmethod
    def resolve_user_roles(cls, user: User) -> Set[UUID]:
        """
        Resolve all role IDs for a user including inherited roles.
        Uses caching for performance.
        
        Args:
            user: User instance
            
        Returns:
            Set of role UUIDs
        """
        cache_key = cls.get_cache_key(user.id)
        cached_roles = cache.get(cache_key)
        
        if cached_roles is not None:
            return set(cached_roles)
        
        role_ids = set()
        
        # Get direct roles
        direct_roles = UserRole.objects.filter(user=user).select_related('role')
        
        for user_role in direct_roles:
            role = user_role.role
            role_ids.add(role.id)
            
            # Get inherited roles
            ancestors = role.get_ancestors()
            for ancestor in ancestors:
                role_ids.add(ancestor.id)
        
        # Cache the result
        cache.set(cache_key, list(role_ids), cls.CACHE_TIMEOUT)
        
        return role_ids
    
    @classmethod
    def invalidate_cache(cls, user_id: UUID):
        """Invalidate role cache for a user."""
        cache_key = cls.get_cache_key(user_id)
        cache.delete(cache_key)
    
    @classmethod
    def invalidate_tenant_cache(cls, tenant_id: UUID):
        """Invalidate role cache for all users in a tenant."""
        from apps.core.models import User
        users = User.objects.filter(tenant_id=tenant_id).values_list('id', flat=True)
        for user_id in users:
            cls.invalidate_cache(user_id)


class PermissionService:
    """Service for checking user permissions."""
    
    CACHE_TIMEOUT = 1800  # 30 minutes
    
    @classmethod
    def get_cache_key(cls, user_id: UUID, resource_type: str, action: str) -> str:
        """Generate cache key for permission check."""
        return f"user:{user_id}:perm:{resource_type}:{action}"
    
    @classmethod
    def has_permission(cls, user: User, resource_type: str, action: str) -> bool:
        """
        Check if user has a specific permission.
        
        Args:
            user: User instance
            resource_type: Type of resource (e.g., 'document', 'role')
            action: Action to perform (e.g., 'read', 'create')
            
        Returns:
            Boolean indicating if user has permission
        """
        # Superusers and tenant admins have all permissions
        if user.is_superuser or user.is_tenant_admin:
            return True
        
        cache_key = cls.get_cache_key(user.id, resource_type, action)
        cached_result = cache.get(cache_key)
        
        if cached_result is not None:
            return cached_result
        
        # Resolve user roles
        role_ids = RoleResolutionService.resolve_user_roles(user)
        
        if not role_ids:
            cache.set(cache_key, False, cls.CACHE_TIMEOUT)
            return False
        
        # Check if any role has the permission
        has_perm = RolePermission.objects.filter(
            role_id__in=role_ids,
            permission__resource_type=resource_type,
            permission__action=action
        ).exists()
        
        # Cache the result
        cache.set(cache_key, has_perm, cls.CACHE_TIMEOUT)
        
        return has_perm
    
    @classmethod
    def get_user_permissions(cls, user: User) -> List[Permission]:
        """
        Get all permissions for a user.
        
        Args:
            user: User instance
            
        Returns:
            List of Permission objects
        """
        if user.is_superuser:
            return list(Permission.objects.all())
        
        role_ids = RoleResolutionService.resolve_user_roles(user)
        
        if not role_ids:
            return []
        
        permission_ids = RolePermission.objects.filter(
            role_id__in=role_ids
        ).values_list('permission_id', flat=True).distinct()
        
        return list(Permission.objects.filter(id__in=permission_ids))
    
    @classmethod
    def invalidate_cache(cls, user_id: UUID, resource_type: str = None, action: str = None):
        """Invalidate permission cache for a user."""
        if resource_type and action:
            cache_key = cls.get_cache_key(user_id, resource_type, action)
            cache.delete(cache_key)
        else:
            # Invalidate all permission caches for user (expensive)
            # In production, consider using cache key patterns
            pass
