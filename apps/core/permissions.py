"""
Custom permissions for Kodezera Intelligence Suite.
"""
from rest_framework import permissions


class IsPlatformOwner(permissions.BasePermission):
    """
    Permission class to check if user is a platform owner (superuser with no tenant).
    Platform owners manage the platform, not tenant data.
    """
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.is_superuser and
            request.user.tenant is None
        )
    
    message = "Only platform owners can access this resource."


class NeverAllowTenantDataAccess(permissions.BasePermission):
    """
    Prevents platform owners from accessing tenant data objects.
    This enforces the privacy rule: Owner manages PLATFORM, not ORGANIZATION DATA.
    """
    
    def has_object_permission(self, request, view, obj):
        # If user is platform owner
        if (request.user.is_superuser and request.user.tenant is None):
            # Check if object is tenant data (import here to avoid circular imports)
            from apps.documents.models import Document
            from apps.rag.models import ChatMessage
            
            # Platform owner cannot access these objects
            if isinstance(obj, (Document, ChatMessage)):
                return False
        
        return True
    
    message = "Platform owners cannot access tenant data content."


class IsTenantMember(permissions.BasePermission):
    """
    Permission class to check if user belongs to a tenant.
    """
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.tenant is not None
        )
    
    message = "Only tenant members can access this resource."


class IsTenantAdmin(permissions.BasePermission):
    """
    Permission class to check if user is a tenant admin.
    """
    
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.tenant is not None and
            request.user.is_staff
        )
    
    message = "Only tenant administrators can access this resource."
