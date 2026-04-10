"""
Authorization service for role and permission resolution.
Uses closure tables for O(1) hierarchy queries, supports deny rules
and conditional (ABAC) permissions.
"""
from typing import Dict, List, Optional, Set
from uuid import UUID
from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone
from apps.core.models import User
from apps.rbac.models import Role, Permission, UserRole, RolePermission, RoleClosure


class RoleResolutionService:
    """Service for resolving user roles including inheritance via closure table."""

    CACHE_TIMEOUT = 3600  # 1 hour

    @classmethod
    def get_cache_key(cls, user_id: UUID) -> str:
        return f"user:{user_id}:roles"

    @classmethod
    def _admin_cache_key(cls, user_id: UUID) -> str:
        return f"user:{user_id}:is_admin"

    @classmethod
    def resolve_user_roles(cls, user: User) -> Set[UUID]:
        """
        Resolve all role IDs for a user including inherited roles.
        Uses RoleClosure for O(1) ancestor resolution.
        Filters out expired/inactive role assignments.
        """
        cache_key = cls.get_cache_key(user.id)
        cached_roles = cache.get(cache_key)
        if cached_roles is not None:
            return set(cached_roles)

        now = timezone.now()
        # Get active, non-expired direct roles
        direct_role_ids = set(
            UserRole.objects.filter(
                user=user,
                is_active=True,
            ).filter(
                Q(expires_at__isnull=True) | Q(expires_at__gt=now),
            ).values_list('role_id', flat=True)
        )

        if not direct_role_ids:
            cache.set(cache_key, [], cls.CACHE_TIMEOUT)
            return set()

        # Use closure table to get all ancestor role IDs (O(1) join)
        all_role_ids = set(
            RoleClosure.objects.filter(
                descendant_id__in=direct_role_ids,
            ).values_list('ancestor_id', flat=True)
        )

        cache.set(cache_key, list(all_role_ids), cls.CACHE_TIMEOUT)
        return all_role_ids

    @classmethod
    def invalidate_cache(cls, user_id: UUID):
        cache.delete(cls.get_cache_key(user_id))
        cache.delete(cls._admin_cache_key(user_id))
        cache.delete(f"user:{user_id}:effective_perms")

    @classmethod
    def invalidate_tenant_cache(cls, tenant_id: UUID):
        user_ids = User.objects.filter(
            tenant_id=tenant_id,
        ).values_list('id', flat=True)
        try:
            from apps.documents.services.access import DocumentAccessService
        except Exception:
            DocumentAccessService = None

        for user_id in user_ids:
            cls.invalidate_cache(user_id)
            if DocumentAccessService is not None:
                DocumentAccessService.invalidate_cache(user_id)

    @classmethod
    def is_tenant_administrator(cls, user) -> bool:
        """Check if users holds the system 'Tenant Administrator' role."""
        cache_key = cls._admin_cache_key(user.id)
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        now = timezone.now()
        result = UserRole.objects.filter(
            user=user,
            role__tenant_id=user.tenant_id,
            role__is_system_role=True,
            role__name=Role.SYSTEM_ADMIN_ROLE_NAME,
            is_active=True,
        ).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=now),
        ).exists()

        cache.set(cache_key, result, cls.CACHE_TIMEOUT)
        return result


class ConditionEngine:
    """Evaluates ABAC conditions on permissions against request context."""

    @classmethod
    def evaluate(cls, conditions: dict, context: dict) -> bool:
        """
        Evaluate all conditions. ALL must pass (AND logic).

        Supported condition keys:
        - "department": "own" -> user must be in the same org unit
        - "classification_level": {"lte": N} -> doc classification <= N
        - "visibility_type": {"in": [...]} -> doc visibility in set
        """
        if not conditions:
            return True  # No conditions = unrestricted

        for key, rule in conditions.items():
            if not cls._evaluate_single(key, rule, context):
                return False
        return True

    @classmethod
    def _evaluate_single(cls, key: str, rule, context: dict) -> bool:
        if key == 'department' and rule == 'own':
            user_org_ids = context.get('user_org_unit_ids', set())
            resource_org_id = context.get('resource_org_unit_id')
            if not resource_org_id:
                return False
            return resource_org_id in user_org_ids

        if isinstance(rule, dict):
            actual = context.get(key)
            if actual is None:
                return False
            if 'lte' in rule:
                return actual <= rule['lte']
            if 'gte' in rule:
                return actual >= rule['gte']
            if 'eq' in rule:
                return actual == rule['eq']
            if 'in' in rule:
                return actual in rule['in']
            if 'not_in' in rule:
                return actual not in rule['not_in']

        return True


class PermissionService:
    """Service for checking user permissions with deny rule and condition support."""

    CACHE_TIMEOUT = 1800  # 30 minutes

    @classmethod
    def get_cache_key(cls, user_id: UUID, resource_type: str, action: str) -> str:
        return f"user:{user_id}:perm:{resource_type}:{action}"

    @classmethod
    def has_permission(cls, user: User, resource_type: str, action: str,
                       context: Optional[dict] = None) -> bool:
        """
        Check if user has a specific permission.
        Evaluation order: deny first, then superuser, then admin, then grants.
        """
        if user.is_superuser or user.is_tenant_admin:
            return True

        # For simple checks without context, use cache
        if context is None:
            cache_key = cls.get_cache_key(user.id, resource_type, action)
            cached_result = cache.get(cache_key)
            if cached_result is not None:
                return cached_result

        role_ids = RoleResolutionService.resolve_user_roles(user)
        if not role_ids:
            if context is None:
                cache.set(cls.get_cache_key(user.id, resource_type, action), False, cls.CACHE_TIMEOUT)
            return False

        # Get matching permissions (both allow and deny)
        matching_perms = Permission.objects.filter(
            resource_type=resource_type,
            action=action,
            role_permissions__role_id__in=role_ids,
        ).distinct()

        # Check deny rules first — deny always wins
        for perm in matching_perms:
            if perm.is_deny:
                if context is None or ConditionEngine.evaluate(perm.conditions, context):
                    if context is None:
                        cache.set(cls.get_cache_key(user.id, resource_type, action), False, cls.CACHE_TIMEOUT)
                    return False

        # Check allow rules
        for perm in matching_perms:
            if not perm.is_deny:
                if not perm.conditions or context is None:
                    # Unconditional allow, or no context to evaluate
                    if context is None:
                        cache.set(cls.get_cache_key(user.id, resource_type, action), True, cls.CACHE_TIMEOUT)
                    return True
                if ConditionEngine.evaluate(perm.conditions, context):
                    return True

        if context is None:
            cache.set(cls.get_cache_key(user.id, resource_type, action), False, cls.CACHE_TIMEOUT)
        return False

    @classmethod
    def get_user_permissions(cls, user: User) -> List[Permission]:
        """Get all permissions for a user (allow only, for UI display)."""
        if user.is_superuser:
            return list(Permission.objects.filter(is_deny=False))

        role_ids = RoleResolutionService.resolve_user_roles(user)
        if not role_ids:
            return []

        permission_ids = (
            RolePermission.objects.filter(role_id__in=role_ids)
            .values_list('permission_id', flat=True)
            .distinct()
        )
        return list(
            Permission.objects.filter(id__in=permission_ids, is_deny=False)
        )

    @classmethod
    def get_effective_permissions(cls, user: User) -> Dict[str, dict]:
        """
        Compute the full effective permission set for a user.
        Returns: {"resource:action": {"granted": bool, "conditions": {...}, "source": "role_name"}}
        """
        cache_key = f"user:{user.id}:effective_perms"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        result = {}

        if user.is_superuser:
            for perm in Permission.objects.filter(is_deny=False):
                key = f"{perm.resource_type}:{perm.action}"
                result[key] = {
                    'granted': True,
                    'conditions': {},
                    'source': 'superuser',
                    'permission_id': str(perm.id),
                }
            cache.set(cache_key, result, cls.CACHE_TIMEOUT)
            return result

        role_ids = RoleResolutionService.resolve_user_roles(user)

        # Admin shortcut
        if user.is_tenant_admin:
            for perm in Permission.objects.filter(is_deny=False):
                key = f"{perm.resource_type}:{perm.action}"
                result[key] = {
                    'granted': True,
                    'conditions': {},
                    'source': 'tenant_admin',
                    'permission_id': str(perm.id),
                }
            cache.set(cache_key, result, cls.CACHE_TIMEOUT)
            return result

        if not role_ids:
            cache.set(cache_key, result, cls.CACHE_TIMEOUT)
            return result

        # Collect all role-permission mappings
        role_perms = (
            RolePermission.objects.filter(role_id__in=role_ids)
            .select_related('permission', 'role')
        )

        # Build result: deny overrides allow
        deny_set = set()
        for rp in role_perms:
            perm = rp.permission
            key = f"{perm.resource_type}:{perm.action}"
            if perm.is_deny:
                deny_set.add(key)
                result[key] = {
                    'granted': False,
                    'conditions': perm.conditions,
                    'source': f'deny:{rp.role.name}',
                    'permission_id': str(perm.id),
                }

        for rp in role_perms:
            perm = rp.permission
            key = f"{perm.resource_type}:{perm.action}"
            if not perm.is_deny and key not in deny_set:
                if key not in result:  # First match wins
                    result[key] = {
                        'granted': True,
                        'conditions': perm.conditions,
                        'source': rp.role.name,
                        'permission_id': str(perm.id),
                    }

        cache.set(cache_key, result, cls.CACHE_TIMEOUT)
        return result

    @classmethod
    def invalidate_cache(cls, user_id: UUID, resource_type: str = None, action: str = None):
        if resource_type and action:
            cache.delete(cls.get_cache_key(user_id, resource_type, action))
        cache.delete(f"user:{user_id}:effective_perms")
