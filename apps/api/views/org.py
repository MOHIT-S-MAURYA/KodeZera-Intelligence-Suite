"""
ViewSet and endpoints for OrgUnit hierarchy management.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.core.models import OrgUnit, UserOrgUnit, User
from apps.api.serializers.org import (
    OrgUnitSerializer, OrgUnitTreeSerializer,
    OrgUnitMoveSerializer, OrgUnitMemberSerializer,
    OrgUnitAddMemberSerializer,
)
from apps.api.permissions import IsTenantAdmin
from apps.core.services.org_hierarchy import OrgHierarchyService


class IsTenantMember(IsAuthenticated):
    """Any authenticated user within a tenant."""
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return request.user.tenant_id is not None


class OrgUnitViewSet(viewsets.ModelViewSet):
    """
    CRUD + hierarchy endpoints for OrgUnit.

    Standard CRUD (TenantAdmin):
        GET    /org-units/          List org units
        POST   /org-units/          Create org unit
        GET    /org-units/{id}/     Detail
        PATCH  /org-units/{id}/     Update
        DELETE /org-units/{id}/     Delete (blocks if has active members/children)

    Hierarchy (TenantMember for reads, TenantAdmin for writes):
        GET    /org-units/tree/             Full org tree
        GET    /org-units/{id}/subtree/     Subtree rooted at unit
        GET    /org-units/{id}/ancestors/   Ancestor chain to root
        POST   /org-units/{id}/move/        Move to new parent
        GET    /org-units/{id}/members/     List members
        POST   /org-units/{id}/members/     Add member
        DELETE /org-units/{id}/members/     Remove member (user_id in body)
    """
    serializer_class = OrgUnitSerializer
    permission_classes = [IsTenantAdmin]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        return (
            OrgUnit.objects
            .filter(tenant=self.request.user.tenant)
            .select_related('parent', 'head')
            .annotate(
                member_count=Count('memberships', filter=Q(memberships__is_active=True), distinct=True),
                children_count=Count('children', distinct=True),
            )
            .order_by('path', 'sibling_order', 'name')
        )

    def perform_create(self, serializer):
        tenant = self.request.user.tenant
        parent = serializer.validated_data.get('parent')
        org_unit = OrgHierarchyService.create_org_unit(
            tenant=tenant,
            name=serializer.validated_data['name'],
            unit_type=serializer.validated_data.get('unit_type', 'department'),
            parent=parent,
            code=serializer.validated_data.get('code', ''),
            description=serializer.validated_data.get('description', ''),
            head=serializer.validated_data.get('head'),
            metadata=serializer.validated_data.get('metadata', {}),
        )
        serializer.instance = org_unit

    def perform_update(self, serializer):
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        org_unit = self.get_object()
        try:
            OrgHierarchyService.delete_org_unit(org_unit)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_409_CONFLICT)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ── Hierarchy endpoints ──────────────────────────────────────────

    @action(detail=False, methods=['get'], permission_classes=[IsTenantMember])
    def tree(self, request):
        """Full org tree as nested JSON."""
        tree = OrgHierarchyService.get_full_tree(request.user.tenant)
        tree_dicts = OrgHierarchyService.build_tree_dict(tree)
        serializer = OrgUnitTreeSerializer(tree_dicts, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], permission_classes=[IsTenantMember])
    def subtree(self, request, pk=None):
        """Subtree rooted at this org unit."""
        org_unit = self.get_object()
        descendants = OrgHierarchyService.get_descendants(org_unit, include_self=True)
        serializer = OrgUnitSerializer(descendants, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], permission_classes=[IsTenantMember])
    def ancestors(self, request, pk=None):
        """Ancestor chain from this unit to root."""
        org_unit = self.get_object()
        ancestor_list = OrgHierarchyService.get_ancestors(org_unit, include_self=True)
        serializer = OrgUnitSerializer(ancestor_list, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[IsTenantAdmin])
    def move(self, request, pk=None):
        """Move org unit to a new parent."""
        org_unit = self.get_object()
        ser = OrgUnitMoveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        new_parent_id = ser.validated_data.get('new_parent_id')
        new_parent = None
        if new_parent_id:
            new_parent = get_object_or_404(
                OrgUnit, id=new_parent_id, tenant=request.user.tenant,
            )

        try:
            OrgHierarchyService.move_org_unit(org_unit, new_parent)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        org_unit.refresh_from_db()
        return Response(OrgUnitSerializer(org_unit).data)

    @action(detail=True, methods=['get', 'post', 'delete'], permission_classes=[IsTenantAdmin])
    def members(self, request, pk=None):
        """List, add, or remove members of an org unit."""
        org_unit = self.get_object()

        if request.method == 'GET':
            members_qs = OrgHierarchyService.get_unit_members(org_unit)
            serializer = OrgUnitMemberSerializer(members_qs, many=True)
            return Response(serializer.data)

        if request.method == 'POST':
            ser = OrgUnitAddMemberSerializer(data=request.data)
            ser.is_valid(raise_exception=True)
            user = get_object_or_404(
                User, id=ser.validated_data['user_id'], tenant=request.user.tenant,
            )
            try:
                membership = OrgHierarchyService.add_member(
                    org_unit=org_unit,
                    user=user,
                    membership_type=ser.validated_data.get('membership_type', 'secondary'),
                    expires_at=ser.validated_data.get('expires_at'),
                )
            except ValueError as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            return Response(
                OrgUnitMemberSerializer(membership).data,
                status=status.HTTP_201_CREATED,
            )

        if request.method == 'DELETE':
            user_id = request.data.get('user_id')
            if not user_id:
                return Response(
                    {'error': 'user_id is required.'}, status=status.HTTP_400_BAD_REQUEST,
                )
            user = get_object_or_404(
                User, id=user_id, tenant=request.user.tenant,
            )
            OrgHierarchyService.remove_member(org_unit=org_unit, user=user)
            return Response(status=status.HTTP_204_NO_CONTENT)
