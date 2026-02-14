"""
DRF permissions for RBAC.
"""
from rest_framework import permissions
from apps.rbac.services.authorization import PermissionService


class HasPermission(permissions.BasePermission):
    """
    Custom permission class that checks dynamic RBAC permissions.
    
    Usage in views:
        permission_classes = [HasPermission]
        required_permission = ('document', 'read')
    """
    
    def has_permission(self, request, view):
        """Check if user has required permission."""
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Get required permission from view
        if not hasattr(view, 'required_permission'):
            return True  # No specific permission required
        
        resource_type, action = view.required_permission
        
        return PermissionService.has_permission(
            user=request.user,
            resource_type=resource_type,
            action=action
        )


class IsTenantAdmin(permissions.BasePermission):
    """Permission class for tenant admin only actions."""
    
    def has_permission(self, request, view):
        """Check if user is tenant admin."""
        if not request.user or not request.user.is_authenticated:
            return False
        
        return request.user.is_tenant_admin or request.user.is_superuser
