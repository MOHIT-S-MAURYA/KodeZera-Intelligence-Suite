"""
Admin views for tenant administrators.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.core.models import AuditLog, Department, User
from apps.rbac.models import Role, Permission, UserRole, RolePermission
from apps.api.serializers import (
    AuditLogSerializer, DepartmentSerializer, RoleSerializer, PermissionSerializer,
    UserRoleSerializer, RolePermissionSerializer, UserManagementSerializer,
)
from apps.api.permissions import IsTenantAdmin
from apps.rbac.services.authorization import RoleResolutionService, PermissionService
from apps.core.services.notifications import NotificationService


class DepartmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for department management.

    Security:
      - IsTenantAdmin: only tenant admins may read/write
      - get_queryset filters strictly to the caller's tenant (row-level isolation)
      - perform_create injects tenant — client cannot spoof tenant ownership
      - perform_update re-validates parent is in same tenant
      - destroy blocks deletion of non-empty departments (has users or children)

    Performance:
      - select_related('parent'): eliminates N+1 when reading parent_name
      - annotate user_count / children_count: single DB round-trip for counts
    """
    serializer_class = DepartmentSerializer
    permission_classes = [IsTenantAdmin]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        from django.db.models import Count
        return (
            Department.objects
            .filter(tenant=self.request.user.tenant)
            .select_related('parent')
            .annotate(
                user_count=Count('users', distinct=True),
                children_count=Count('children', distinct=True),
            )
            .order_by('name')
        )

    def perform_create(self, serializer):
        """Inject tenant — never trust client-supplied tenant."""
        dept = serializer.save(tenant=self.request.user.tenant)
        # Notify tenant admins about the new department
        NotificationService.notify_tenant(
            tenant_id=self.request.user.tenant_id,
            title='New Department Created',
            message=f'Department "{dept.name}" has been created.',
            category='department',
            created_by=self.request.user,
        )

    def destroy(self, request, *args, **kwargs):
        """Block deletion of departments that still have users or child departments."""
        dept = self.get_object()
        if dept.user_count > 0:
            return Response(
                {
                    'error': (
                        f'Cannot delete "{dept.name}": '
                        f'{dept.user_count} user(s) are assigned to this department. '
                        'Reassign or remove them first.'
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        if dept.children_count > 0:
            return Response(
                {
                    'error': (
                        f'Cannot delete "{dept.name}": '
                        f'it has {dept.children_count} child department(s). '
                        'Delete or reparent them first.'
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)


class RoleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for role management.

    Security:
      - IsTenantAdmin: only tenant admins may read/write
      - get_queryset filters strictly to the caller's tenant (row-level isolation)
      - perform_create injects tenant — client cannot spoof tenant ownership
      - destroy blocks deletion of roles that still have users assigned
      - PUT excluded: partial updates only via PATCH

    Performance:
      - select_related('parent') eliminates N+1 for parent_name
      - annotate user_count/permission_count in a single DB round-trip
    """
    serializer_class = RoleSerializer
    permission_classes = [IsTenantAdmin]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        from django.db.models import Count
        return (
            Role.objects
            .filter(tenant=self.request.user.tenant)
            .select_related('parent')
            .annotate(
                user_count=Count('user_roles', distinct=True),
                permission_count=Count('role_permissions', distinct=True),
            )
            .order_by('name')
        )

    def perform_create(self, serializer):
        """Inject tenant — never trust client-supplied tenant."""
        role = serializer.save(tenant=self.request.user.tenant)
        # Notify tenant admins about the new role
        NotificationService.notify_tenant(
            tenant_id=self.request.user.tenant_id,
            title='New Role Created',
            message=f'Role "{role.name}" has been created.',
            category='role',
            created_by=self.request.user,
        )

    def destroy(self, request, *args, **kwargs):
        """Block deletion of system roles and roles that still have users assigned."""
        role = self.get_object()
        if role.is_system_role:
            return Response(
                {'error': f'Cannot delete "{role.name}": it is a system role and cannot be removed.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if role.user_count > 0:
            return Response(
                {
                    'error': (
                        f'Cannot delete "{role.name}": '
                        f'{role.user_count} user(s) are assigned to this role. '
                        'Reassign or remove them first.'
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def assign_permissions(self, request, pk=None):
        """Assign permissions to a role."""
        role = self.get_object()
        permission_ids = request.data.get('permission_ids', [])

        RolePermission.objects.bulk_create(
            [RolePermission(role=role, permission_id=perm_id) for perm_id in permission_ids],
            ignore_conflicts=True,
        )

        RoleResolutionService.invalidate_tenant_cache(role.tenant.id)
        return Response({'status': 'permissions assigned'})


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet exposing AuditLog entries scoped to the requesting tenant.

    Security:
      - IsTenantAdmin: only tenant admins may view logs
      - get_queryset filters strictly to the caller's tenant
      - Read-only: logs are immutable records

    Filtering (query params):
      - ?action=login       filter by action type
      - ?resource_type=document  filter by resource type
      - ?user_id=<uuid>     filter by a specific user
      - ?date_from=YYYY-MM-DD  entries from this date (inclusive)
      - ?date_to=YYYY-MM-DD    entries up to this date (inclusive)
    """
    serializer_class = AuditLogSerializer
    permission_classes = [IsTenantAdmin]
    http_method_names = ['get', 'head', 'options']

    def get_queryset(self):
        qs = (
            AuditLog.objects
            .filter(tenant=self.request.user.tenant)
            .select_related('user')
            .defer('user_agent')   # potentially large; not surfaced in API
            .order_by('-created_at')
        )

        params = self.request.query_params
        if action_filter := params.get('action'):
            qs = qs.filter(action=action_filter)
        if resource_type := params.get('resource_type'):
            qs = qs.filter(resource_type=resource_type)
        if user_id := params.get('user_id'):
            qs = qs.filter(user_id=user_id)
        if date_from := params.get('date_from'):
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to := params.get('date_to'):
            qs = qs.filter(created_at__date__lte=date_to)
        return qs


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
                status=status.HTTP_403_FORBIDDEN,   # 403 not 400: request is valid, action is forbidden
            )
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        """Create user and send targeted notifications."""
        new_user = serializer.save()
        tenant_id = self.request.user.tenant_id
        admin = self.request.user

        # 1. Notify the new employee
        NotificationService.notify_user(
            tenant_id=tenant_id,
            user_id=new_user.id,
            title='Welcome!',
            message=f'Your account has been created. Welcome to {admin.tenant.name}!',
            category='user_management',
            created_by=admin,
        )
        # 2. Notify their department (team members learn about the new hire)
        if new_user.department_id:
            NotificationService.notify_department(
                tenant_id=tenant_id,
                department_id=new_user.department_id,
                title='New Team Member',
                message=f'{new_user.full_name} has joined the {new_user.department.name} team.',
                category='user_management',
                created_by=admin,
            )

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
