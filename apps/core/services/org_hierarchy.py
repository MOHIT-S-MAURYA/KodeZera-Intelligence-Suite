"""
Organisation hierarchy service using the closure table pattern.
Provides O(1) subtree and ancestor queries for OrgUnit trees.
"""
from typing import List, Optional, Set
from uuid import UUID

from django.db import transaction
from django.db.models import Count, Q
from django.core.cache import cache
from django.core.exceptions import ValidationError

from apps.core.models import OrgUnit, OrgUnitClosure, UserOrgUnit, Tenant


class OrgHierarchyService:
    """Service for managing org unit hierarchy via closure tables."""

    TREE_CACHE_TIMEOUT = 600  # 10 minutes

    # ── Closure Table Management ──────────────────────────────────────────

    @classmethod
    @transaction.atomic
    def create_org_unit(cls, tenant: Tenant, name: str, unit_type: str,
                        parent: Optional[OrgUnit] = None, **kwargs) -> OrgUnit:
        """Create an org unit and populate its closure table entries."""
        depth = 0
        path = name

        if parent:
            if parent.tenant_id != tenant.id:
                raise ValidationError('Parent must belong to the same tenant.')
            if parent.depth >= OrgUnit.MAX_DEPTH - 1:
                raise ValidationError(
                    f'Maximum hierarchy depth of {OrgUnit.MAX_DEPTH} exceeded.'
                )
            depth = parent.depth + 1
            path = f"{parent.path}/{name}"

        org_unit = OrgUnit.objects.create(
            tenant=tenant,
            name=name,
            unit_type=unit_type,
            parent=parent,
            depth=depth,
            path=path,
            **kwargs,
        )

        # Self-referencing closure row
        OrgUnitClosure.objects.create(
            ancestor=org_unit, descendant=org_unit, depth=0,
        )

        # Connect to all ancestors
        if parent:
            ancestor_links = OrgUnitClosure.objects.filter(
                descendant=parent,
            ).values_list('ancestor_id', 'depth')
            closure_rows = [
                OrgUnitClosure(
                    ancestor_id=ancestor_id,
                    descendant=org_unit,
                    depth=ancestor_depth + 1,
                )
                for ancestor_id, ancestor_depth in ancestor_links
            ]
            OrgUnitClosure.objects.bulk_create(closure_rows)

        cls._invalidate_tenant_tree_cache(tenant.id)
        return org_unit

    @classmethod
    @transaction.atomic
    def move_org_unit(cls, org_unit: OrgUnit, new_parent: Optional[OrgUnit]) -> OrgUnit:
        """Move an org unit to a new parent, rebuilding closure entries."""
        if new_parent:
            if new_parent.tenant_id != org_unit.tenant_id:
                raise ValidationError('Cannot move across tenants.')
            if new_parent.depth >= OrgUnit.MAX_DEPTH - 1:
                raise ValidationError(
                    f'Maximum hierarchy depth of {OrgUnit.MAX_DEPTH} exceeded.'
                )
            # Prevent moving to own subtree (creating a cycle)
            if cls.is_descendant(new_parent.id, org_unit.id):
                raise ValidationError('Cannot move a node under its own subtree.')

        # Lock the node to prevent concurrent moves
        OrgUnit.objects.select_for_update().filter(id=org_unit.id)

        # Get all descendants (including self)
        subtree_ids = set(
            OrgUnitClosure.objects.filter(ancestor=org_unit)
            .values_list('descendant_id', flat=True)
        )

        # Delete old ancestor links for the entire subtree
        # (keep internal subtree links intact)
        OrgUnitClosure.objects.filter(
            descendant_id__in=subtree_ids,
        ).exclude(
            ancestor_id__in=subtree_ids,
        ).delete()

        # Create new ancestor links if there's a new parent
        if new_parent:
            new_ancestor_links = OrgUnitClosure.objects.filter(
                descendant=new_parent,
            ).values_list('ancestor_id', 'depth')

            new_closure_rows = []
            for descendant_id in subtree_ids:
                # Get internal depth from org_unit to this descendant
                internal_depth = OrgUnitClosure.objects.get(
                    ancestor=org_unit, descendant_id=descendant_id,
                ).depth
                for ancestor_id, ancestor_depth in new_ancestor_links:
                    new_closure_rows.append(
                        OrgUnitClosure(
                            ancestor_id=ancestor_id,
                            descendant_id=descendant_id,
                            depth=ancestor_depth + 1 + internal_depth,
                        )
                    )
            OrgUnitClosure.objects.bulk_create(new_closure_rows)

        # Update the node itself
        org_unit.parent = new_parent
        org_unit.depth = (new_parent.depth + 1) if new_parent else 0
        org_unit.save(update_fields=['parent', 'depth', 'updated_at'])

        # Rebuild depth and path for all descendants
        cls._rebuild_subtree_metadata(org_unit)
        cls._invalidate_tenant_tree_cache(org_unit.tenant_id)
        return org_unit

    @classmethod
    @transaction.atomic
    def delete_org_unit(cls, org_unit: OrgUnit, force: bool = False):
        """
        Delete an org unit. Blocks if it has active members (unless force=True).
        Cascade deletes closure entries via FK CASCADE.
        """
        if not force:
            active_members = UserOrgUnit.objects.filter(
                org_unit=org_unit, is_active=True,
            ).count()
            if active_members > 0:
                raise ValidationError(
                    f'Cannot delete org unit with {active_members} active member(s). '
                    'Remove members first or use force=True.'
                )
            child_count = OrgUnitClosure.objects.filter(
                ancestor=org_unit, depth=1,
            ).count()
            if child_count > 0:
                raise ValidationError(
                    f'Cannot delete org unit with {child_count} child unit(s). '
                    'Move or delete children first.'
                )

        tenant_id = org_unit.tenant_id
        org_unit.delete()  # CASCADE handles closure + memberships
        cls._invalidate_tenant_tree_cache(tenant_id)

    # ── Query Methods (O(1) via closure table) ────────────────────────────

    @classmethod
    def get_descendants(cls, org_unit_id: UUID,
                        include_self: bool = False,
                        max_depth: Optional[int] = None) -> List[OrgUnit]:
        """Get all descendants of an org unit in O(1)."""
        qs = OrgUnitClosure.objects.filter(ancestor_id=org_unit_id)
        if not include_self:
            qs = qs.filter(depth__gt=0)
        if max_depth is not None:
            qs = qs.filter(depth__lte=max_depth)
        descendant_ids = qs.values_list('descendant_id', flat=True)
        return list(
            OrgUnit.objects.filter(id__in=descendant_ids)
            .select_related('parent', 'head')
            .order_by('path', 'sibling_order', 'name')
        )

    @classmethod
    def get_descendant_ids(cls, org_unit_id: UUID,
                           include_self: bool = False) -> Set[UUID]:
        """Get IDs of all descendants — used for access resolution."""
        qs = OrgUnitClosure.objects.filter(ancestor_id=org_unit_id)
        if not include_self:
            qs = qs.filter(depth__gt=0)
        return set(qs.values_list('descendant_id', flat=True))

    @classmethod
    def get_ancestors(cls, org_unit_id: UUID,
                      include_self: bool = False) -> List[OrgUnit]:
        """Get all ancestors of an org unit in O(1)."""
        qs = OrgUnitClosure.objects.filter(descendant_id=org_unit_id)
        if not include_self:
            qs = qs.filter(depth__gt=0)
        ancestor_ids = qs.values_list('ancestor_id', flat=True)
        return list(
            OrgUnit.objects.filter(id__in=ancestor_ids)
            .select_related('parent', 'head')
            .order_by('depth')
        )

    @classmethod
    def get_ancestor_ids(cls, org_unit_id: UUID,
                         include_self: bool = False) -> Set[UUID]:
        """Get IDs of all ancestors — used for access resolution."""
        qs = OrgUnitClosure.objects.filter(descendant_id=org_unit_id)
        if not include_self:
            qs = qs.filter(depth__gt=0)
        return set(qs.values_list('ancestor_id', flat=True))

    @classmethod
    def get_direct_children(cls, org_unit_id: UUID) -> List[OrgUnit]:
        """Get direct children only (depth=1)."""
        child_ids = OrgUnitClosure.objects.filter(
            ancestor_id=org_unit_id, depth=1,
        ).values_list('descendant_id', flat=True)
        return list(
            OrgUnit.objects.filter(id__in=child_ids)
            .select_related('parent', 'head')
            .annotate(
                member_count=Count(
                    'members', filter=Q(members__is_active=True),
                ),
            )
            .order_by('sibling_order', 'name')
        )

    @classmethod
    def is_descendant(cls, node_id: UUID, potential_ancestor_id: UUID) -> bool:
        """Check if node_id is a descendant of potential_ancestor_id."""
        return OrgUnitClosure.objects.filter(
            ancestor_id=potential_ancestor_id,
            descendant_id=node_id,
            depth__gt=0,
        ).exists()

    @classmethod
    def get_full_tree(cls, tenant_id: UUID) -> List[OrgUnit]:
        """Get the complete org tree for a tenant, annotated with member counts."""
        cache_key = f"tenant:{tenant_id}:org_tree"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        units = list(
            OrgUnit.objects.filter(tenant_id=tenant_id, is_active=True)
            .select_related('parent', 'head')
            .annotate(
                member_count=Count(
                    'members', filter=Q(members__is_active=True),
                ),
            )
            .order_by('depth', 'sibling_order', 'name')
        )
        cache.set(cache_key, units, cls.TREE_CACHE_TIMEOUT)
        return units

    @classmethod
    def build_tree_dict(cls, tenant_id: UUID) -> list:
        """Build a nested tree structure suitable for JSON serialization."""
        units = cls.get_full_tree(tenant_id)
        units_by_id = {}
        roots = []

        for unit in units:
            node = {
                'id': str(unit.id),
                'name': unit.name,
                'code': unit.code,
                'unit_type': unit.unit_type,
                'depth': unit.depth,
                'member_count': getattr(unit, 'member_count', 0),
                'head': {
                    'id': str(unit.head.id),
                    'name': unit.head.full_name,
                } if unit.head else None,
                'is_active': unit.is_active,
                'children': [],
            }
            units_by_id[str(unit.id)] = node

            parent_id = str(unit.parent_id) if unit.parent_id else None
            if parent_id and parent_id in units_by_id:
                units_by_id[parent_id]['children'].append(node)
            else:
                roots.append(node)

        return roots

    # ── Membership Management ─────────────────────────────────────────────

    @classmethod
    def add_member(cls, user, org_unit: OrgUnit,
                   membership_type: str = 'primary',
                   expires_at=None) -> UserOrgUnit:
        """Add a user to an org unit."""
        if membership_type == 'primary':
            # Demote any existing primary to secondary
            UserOrgUnit.objects.filter(
                user=user, membership_type='primary', is_active=True,
            ).update(membership_type='secondary')

        membership, created = UserOrgUnit.objects.get_or_create(
            user=user,
            org_unit=org_unit,
            defaults={
                'membership_type': membership_type,
                'expires_at': expires_at,
            },
        )
        if not created:
            membership.membership_type = membership_type
            membership.expires_at = expires_at
            membership.is_active = True
            membership.save(update_fields=[
                'membership_type', 'expires_at', 'is_active',
            ])
        return membership

    @classmethod
    def remove_member(cls, user, org_unit: OrgUnit):
        """Remove a user from an org unit (soft-deactivate)."""
        UserOrgUnit.objects.filter(
            user=user, org_unit=org_unit,
        ).update(is_active=False)

    @classmethod
    def get_user_org_units(cls, user, active_only: bool = True) -> List[OrgUnit]:
        """Get all org units a user belongs to."""
        qs = UserOrgUnit.objects.filter(user=user)
        if active_only:
            qs = qs.filter(is_active=True)
        return list(
            qs.select_related('org_unit', 'org_unit__parent')
            .order_by('membership_type', 'org_unit__name')
        )

    @classmethod
    def get_unit_members(cls, org_unit: OrgUnit,
                         include_descendants: bool = False,
                         active_only: bool = True):
        """Get all members of an org unit (optionally including descendants)."""
        if include_descendants:
            unit_ids = cls.get_descendant_ids(org_unit.id, include_self=True)
        else:
            unit_ids = {org_unit.id}

        qs = UserOrgUnit.objects.filter(org_unit_id__in=unit_ids)
        if active_only:
            qs = qs.filter(is_active=True)
        return qs.select_related('user', 'org_unit')

    # ── Internal Helpers ──────────────────────────────────────────────────

    @classmethod
    def _rebuild_subtree_metadata(cls, root: OrgUnit):
        """Rebuild depth and path for a subtree after a move."""
        descendants = cls.get_descendants(root.id, include_self=False)
        for desc in descendants:
            closure = OrgUnitClosure.objects.get(
                ancestor=root, descendant=desc,
            )
            desc.depth = root.depth + closure.depth
            if root.path:
                # Rebuild path from root's path + relative path
                desc.path = f"{root.path}/{desc.name}"
            else:
                desc.path = desc.name
        if descendants:
            OrgUnit.objects.bulk_update(descendants, ['depth', 'path'])

    @classmethod
    def _invalidate_tenant_tree_cache(cls, tenant_id: UUID):
        """Invalidate the cached org tree for a tenant."""
        cache.delete(f"tenant:{tenant_id}:org_tree")
