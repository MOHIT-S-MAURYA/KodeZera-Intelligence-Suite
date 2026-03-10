"""
Role hierarchy service using the closure table pattern.
Provides O(1) ancestor/descendant queries for role trees.
"""
from typing import List, Optional, Set
from uuid import UUID

from django.db import transaction
from django.db.models import Count, Q
from django.core.cache import cache
from django.core.exceptions import ValidationError

from apps.rbac.models import Role, RoleClosure, Permission, RolePermission


class RoleHierarchyService:
    """Service for managing role hierarchy via closure tables."""

    CACHE_TIMEOUT = 3600  # 1 hour

    # ── Closure Table Management ──────────────────────────────────────────

    @classmethod
    @transaction.atomic
    def create_role(cls, tenant, name: str, parent: Optional[Role] = None,
                    **kwargs) -> Role:
        """Create a role and populate its closure table entries."""
        role = Role.objects.create(
            tenant=tenant,
            name=name,
            parent=parent,
            **kwargs,
        )

        # Self-referencing closure row
        RoleClosure.objects.create(ancestor=role, descendant=role, depth=0)

        # Connect to all ancestors
        if parent:
            if parent.tenant_id != tenant.id:
                raise ValidationError('Parent role must belong to the same tenant.')
            ancestor_links = RoleClosure.objects.filter(
                descendant=parent,
            ).values_list('ancestor_id', 'depth')
            closure_rows = [
                RoleClosure(
                    ancestor_id=ancestor_id,
                    descendant=role,
                    depth=ancestor_depth + 1,
                )
                for ancestor_id, ancestor_depth in ancestor_links
            ]
            RoleClosure.objects.bulk_create(closure_rows)

        return role

    @classmethod
    @transaction.atomic
    def move_role(cls, role: Role, new_parent: Optional[Role]) -> Role:
        """Move a role to a new parent, rebuilding closure entries."""
        if new_parent:
            if new_parent.tenant_id != role.tenant_id:
                raise ValidationError('Cannot move across tenants.')
            if cls.is_descendant(new_parent.id, role.id):
                raise ValidationError('Cannot move a role under its own subtree.')

        Role.objects.select_for_update().filter(id=role.id)

        subtree_ids = set(
            RoleClosure.objects.filter(ancestor=role)
            .values_list('descendant_id', flat=True)
        )

        # Delete old external ancestor links
        RoleClosure.objects.filter(
            descendant_id__in=subtree_ids,
        ).exclude(
            ancestor_id__in=subtree_ids,
        ).delete()

        # Create new ancestor links
        if new_parent:
            new_ancestor_links = RoleClosure.objects.filter(
                descendant=new_parent,
            ).values_list('ancestor_id', 'depth')

            new_closure_rows = []
            for descendant_id in subtree_ids:
                internal_depth = RoleClosure.objects.get(
                    ancestor=role, descendant_id=descendant_id,
                ).depth
                for ancestor_id, ancestor_depth in new_ancestor_links:
                    new_closure_rows.append(
                        RoleClosure(
                            ancestor_id=ancestor_id,
                            descendant_id=descendant_id,
                            depth=ancestor_depth + 1 + internal_depth,
                        )
                    )
            RoleClosure.objects.bulk_create(new_closure_rows)

        role.parent = new_parent
        role.save(update_fields=['parent', 'updated_at'])
        cls._invalidate_role_caches(role.tenant_id)
        return role

    # ── Query Methods ─────────────────────────────────────────────────────

    @classmethod
    def get_ancestor_ids(cls, role_id: UUID,
                         include_self: bool = False) -> Set[UUID]:
        """Get all ancestor role IDs in O(1)."""
        qs = RoleClosure.objects.filter(descendant_id=role_id)
        if not include_self:
            qs = qs.filter(depth__gt=0)
        return set(qs.values_list('ancestor_id', flat=True))

    @classmethod
    def get_descendant_ids(cls, role_id: UUID,
                           include_self: bool = False) -> Set[UUID]:
        """Get all descendant role IDs in O(1)."""
        qs = RoleClosure.objects.filter(ancestor_id=role_id)
        if not include_self:
            qs = qs.filter(depth__gt=0)
        return set(qs.values_list('descendant_id', flat=True))

    @classmethod
    def is_descendant(cls, node_id: UUID, potential_ancestor_id: UUID) -> bool:
        """Check if node_id is a descendant of potential_ancestor_id."""
        return RoleClosure.objects.filter(
            ancestor_id=potential_ancestor_id,
            descendant_id=node_id,
            depth__gt=0,
        ).exists()

    @classmethod
    def get_all_permissions_for_role(cls, role_id: UUID) -> List[Permission]:
        """
        Get all permissions for a role INCLUDING inherited from ancestors.
        Uses closure table for O(1) ancestor lookup.
        """
        cache_key = f"role:{role_id}:all_perms"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        # All role IDs = self + ancestors
        role_ids = cls.get_ancestor_ids(role_id, include_self=True)
        permission_ids = (
            RolePermission.objects.filter(role_id__in=role_ids)
            .values_list('permission_id', flat=True)
            .distinct()
        )
        perms = list(Permission.objects.filter(id__in=permission_ids))
        cache.set(cache_key, perms, cls.CACHE_TIMEOUT)
        return perms

    @classmethod
    def get_permission_matrix(cls, tenant_id: UUID) -> dict:
        """
        Build role × permission matrix for a tenant.
        Returns: {permissions: [...], roles: [{id, name, grants: {perm_id: {granted, inherited_from}}}]}
        """
        roles = list(
            Role.objects.filter(tenant_id=tenant_id)
            .order_by('name')
        )
        permissions = list(Permission.objects.all().order_by('resource_type', 'action'))

        # Direct grants per role
        direct_grants = {}
        for rp in RolePermission.objects.filter(role__tenant_id=tenant_id) \
                .select_related('role', 'permission'):
            direct_grants.setdefault(str(rp.role_id), set()).add(str(rp.permission_id))

        matrix_roles = []
        for role in roles:
            ancestor_ids = cls.get_ancestor_ids(role.id, include_self=False)
            grants = {}
            role_direct = direct_grants.get(str(role.id), set())

            for perm in permissions:
                perm_id = str(perm.id)
                if perm_id in role_direct:
                    grants[perm_id] = {'granted': True, 'inherited_from': None}
                else:
                    # Check if inherited from an ancestor
                    inherited_from = None
                    for anc_id in ancestor_ids:
                        anc_direct = direct_grants.get(str(anc_id), set())
                        if perm_id in anc_direct:
                            inherited_from = str(anc_id)
                            break
                    if inherited_from:
                        grants[perm_id] = {'granted': True, 'inherited_from': inherited_from}
                    else:
                        grants[perm_id] = {'granted': False, 'inherited_from': None}

            matrix_roles.append({
                'id': str(role.id),
                'name': role.name,
                'is_system_role': role.is_system_role,
                'grants': grants,
            })

        return {
            'permissions': [
                {
                    'id': str(p.id),
                    'name': p.name,
                    'resource_type': p.resource_type,
                    'action': p.action,
                }
                for p in permissions
            ],
            'roles': matrix_roles,
        }

    @classmethod
    def build_role_tree(cls, tenant_id: UUID) -> list:
        """Build a nested tree structure for role hierarchy."""
        roles = list(
            Role.objects.filter(tenant_id=tenant_id)
            .annotate(
                user_count=Count('user_roles', filter=Q(user_roles__is_active=True)),
                permission_count=Count('role_permissions'),
            )
            .order_by('name')
        )

        roles_by_id = {}
        roots = []

        for role in roles:
            node = {
                'id': str(role.id),
                'name': role.name,
                'description': role.description,
                'is_system_role': role.is_system_role,
                'scope_type': role.scope_type,
                'priority': role.priority,
                'user_count': getattr(role, 'user_count', 0),
                'permission_count': getattr(role, 'permission_count', 0),
                'children': [],
            }
            roles_by_id[str(role.id)] = node

            parent_id = str(role.parent_id) if role.parent_id else None
            if parent_id and parent_id in roles_by_id:
                roles_by_id[parent_id]['children'].append(node)
            else:
                roots.append(node)

        return roots

    # ── Internal Helpers ──────────────────────────────────────────────────

    @classmethod
    def _invalidate_role_caches(cls, tenant_id: UUID):
        """Invalidate role-related caches for all users in tenant."""
        from apps.core.models import User
        user_ids = User.objects.filter(
            tenant_id=tenant_id,
        ).values_list('id', flat=True)
        for user_id in user_ids:
            cache.delete(f"user:{user_id}:roles")
            cache.delete(f"user:{user_id}:is_admin")
            cache.delete(f"user:{user_id}:effective_perms")
        # Also invalidate per-role caches
        role_ids = Role.objects.filter(
            tenant_id=tenant_id,
        ).values_list('id', flat=True)
        for role_id in role_ids:
            cache.delete(f"role:{role_id}:all_perms")
