"""
Admin views for tenant administrators.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.core.models import Department, User
from apps.rbac.models import Role, Permission, UserRole, RolePermission
from apps.api.serializers import (
    DepartmentSerializer, RoleSerializer, PermissionSerializer,
    UserRoleSerializer, RolePermissionSerializer, UserManagementSerializer,
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

        # Bulk-insert in one query instead of N individual get_or_create calls.
        RolePermission.objects.bulk_create(
            [RolePermission(role=role, permission_id=perm_id) for perm_id in permission_ids],
            ignore_conflicts=True,
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


class UserManagementViewSet(viewsets.ModelViewSet):
    """
    CRUD for users within the requesting tenant.
    Accessible only to tenant admins.
    """
    serializer_class = UserManagementSerializer
    permission_classes = [IsTenantAdmin]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        return (
            User.objects
            .filter(tenant=self.request.user.tenant)
            .select_related('department')
            .prefetch_related('user_roles__role')
            .order_by('first_name', 'last_name', 'email')
        )

    def destroy(self, request, *args, **kwargs):
        """Prevent admins from deleting their own account."""
        user = self.get_object()
        if user.pk == request.user.pk:
            return Response(
                {'error': 'You cannot delete your own account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='toggle-status')
    def toggle_status(self, request, pk=None):
        """Flip is_active without a full PATCH payload."""
        user = self.get_object()
        if user.pk == request.user.pk:
            return Response(
                {'error': 'Cannot deactivate your own account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_active = not user.is_active
        user.save(update_fields=['is_active', 'updated_at'])
        serializer = self.get_serializer(user)
        return Response(serializer.data)
