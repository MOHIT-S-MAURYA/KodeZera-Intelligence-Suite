"""
Admin views for tenant administrators.
"""
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.core.models import Department
from apps.rbac.models import Role, Permission, UserRole, RolePermission
from apps.api.serializers import (
    DepartmentSerializer, RoleSerializer, PermissionSerializer,
    UserRoleSerializer, RolePermissionSerializer
)
from apps.api.permissions import IsTenantAdmin
from apps.rbac.services.authorization import RoleResolutionService, PermissionService


class DepartmentViewSet(viewsets.ModelViewSet):
    """ViewSet for department management."""
    
    serializer_class = DepartmentSerializer
    permission_classes = [IsTenantAdmin]
    
    def get_queryset(self):
        """Return departments for user's tenant."""
        return Department.objects.filter(tenant=self.request.user.tenant)
    
    def perform_create(self, serializer):
        """Create department in user's tenant."""
        serializer.save(tenant=self.request.user.tenant)


class RoleViewSet(viewsets.ModelViewSet):
    """ViewSet for role management."""
    
    serializer_class = RoleSerializer
    permission_classes = [IsTenantAdmin]
    
    def get_queryset(self):
        """Return roles for user's tenant."""
        return Role.objects.filter(tenant=self.request.user.tenant)
    
    def perform_create(self, serializer):
        """Create role in user's tenant."""
        # Check for circular hierarchy
        parent = serializer.validated_data.get('parent')
        if parent:
            # Ensure parent is in same tenant
            if parent.tenant != self.request.user.tenant:
                from rest_framework.exceptions import ValidationError
                raise ValidationError("Parent role must be in the same tenant")
        
        serializer.save(tenant=self.request.user.tenant)
    
    @action(detail=True, methods=['post'])
    def assign_permissions(self, request, pk=None):
        """Assign permissions to a role."""
        role = self.get_object()
        permission_ids = request.data.get('permission_ids', [])
        
        # Create RolePermission records
        for perm_id in permission_ids:
            RolePermission.objects.get_or_create(
                role=role,
                permission_id=perm_id
            )
        
        # Invalidate cache for all users with this role
        RoleResolutionService.invalidate_tenant_cache(role.tenant.id)
        
        return Response({'status': 'permissions assigned'})


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing available permissions."""
    
    serializer_class = PermissionSerializer
    permission_classes = [IsTenantAdmin]
    queryset = Permission.objects.all()


class UserRoleViewSet(viewsets.ModelViewSet):
    """ViewSet for assigning roles to users."""
    
    serializer_class = UserRoleSerializer
    permission_classes = [IsTenantAdmin]
    
    def get_queryset(self):
        """Return user roles for user's tenant."""
        return UserRole.objects.filter(
            user__tenant=self.request.user.tenant
        )
    
    def perform_create(self, serializer):
        """Assign role to user."""
        user_role = serializer.save()
        
        # Invalidate cache for user
        RoleResolutionService.invalidate_cache(user_role.user.id)
        PermissionService.invalidate_cache(user_role.user.id)
    
    def perform_destroy(self, instance):
        """Remove role from user."""
        user_id = instance.user.id
        instance.delete()
        
        # Invalidate cache
        RoleResolutionService.invalidate_cache(user_id)
        PermissionService.invalidate_cache(user_id)
