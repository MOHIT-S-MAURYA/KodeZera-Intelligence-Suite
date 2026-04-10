"""
Document access resolution service.
Uses closure tables for O(1) org-unit subtree queries and proper FK-based grants.
Supports classification enforcement and time-bound access.
"""
from typing import Set, List
from uuid import UUID
from django.core.cache import cache
from django.db.models import Q, QuerySet
from django.utils import timezone
from apps.core.models import User, OrgUnit, UserOrgUnit, OrgUnitClosure
from apps.documents.models import Document, DocumentAccess
from apps.rbac.services.authorization import RoleResolutionService


class DocumentAccessService:
    """Service for resolving document access permissions."""

    CACHE_TIMEOUT = 900  # 15 minutes

    @classmethod
    def get_cache_key(cls, user_id: UUID) -> str:
        return f"user:{user_id}:accessible_docs"

    @classmethod
    def get_accessible_document_ids(cls, user: User) -> Set[UUID]:
        """
        Get all document IDs accessible by a user.

        Resolution rules:
        1. Public documents (visibility_type='public', completed)
        2. Documents uploaded by the user
        3. Role-based grants (via role FK)
        4. Org-unit-based grants (via org_unit FK, with optional descendant cascading)
        5. User-direct grants (via user FK)
        6. Legacy grants (via access_id for backward compat)

        Classification enforcement: user.clearance_level >= doc.classification_level
        Time-bound: expired grants are excluded.
        """
        if user.is_superuser:
            return set(Document.objects.values_list('id', flat=True))

        if user.is_tenant_admin:
            return set(
                Document.objects.filter(tenant=user.tenant)
                .values_list('id', flat=True)
            )

        cache_key = cls.get_cache_key(user.id)
        cached_docs = cache.get(cache_key)
        if cached_docs is not None:
            return set(cached_docs)

        now = timezone.now()
        document_ids = set()

        # User context
        role_ids = RoleResolutionService.resolve_user_roles(user)
        user_org_unit_ids = cls._get_user_org_unit_ids(user)
        clearance = getattr(user, 'clearance_level', 0)

        # Build non-expired access filter
        active_grant_filter = Q(expires_at__isnull=True) | Q(expires_at__gt=now)

        # ── Rule 3: Role-based grants (proper FK) ────────────────────────
        if role_ids:
            role_grants = DocumentAccess.objects.filter(
                active_grant_filter,
                document__tenant=user.tenant,
                access_type='role',
                role_id__in=role_ids,
            ).values_list('document_id', flat=True)
            document_ids.update(role_grants)

        # ── Rule 4: Org-unit grants (with descendant cascading) ──────────
        if user_org_unit_ids:
            # Direct org_unit grants where user is a member
            direct_org_grants = DocumentAccess.objects.filter(
                active_grant_filter,
                document__tenant=user.tenant,
                access_type='org_unit',
                org_unit_id__in=user_org_unit_ids,
            ).values_list('document_id', flat=True)
            document_ids.update(direct_org_grants)

            # Ancestor org_unit grants with include_descendants=True
            all_ancestor_ids = set()
            for org_id in user_org_unit_ids:
                ancestor_ids = set(
                    OrgUnitClosure.objects.filter(
                        descendant_id=org_id, depth__gt=0,
                    ).values_list('ancestor_id', flat=True)
                )
                all_ancestor_ids.update(ancestor_ids)

            if all_ancestor_ids:
                ancestor_grants = DocumentAccess.objects.filter(
                    active_grant_filter,
                    document__tenant=user.tenant,
                    access_type='org_unit',
                    org_unit_id__in=all_ancestor_ids,
                    include_descendants=True,
                ).values_list('document_id', flat=True)
                document_ids.update(ancestor_grants)

        # ── Rule 5: User-direct grants (proper FK) ──────────────────────
        user_grants = DocumentAccess.objects.filter(
            active_grant_filter,
            document__tenant=user.tenant,
            access_type='user',
            user=user,
        ).values_list('document_id', flat=True)
        document_ids.update(user_grants)

        # ── Rule 6: Legacy access_id grants (backward compat) ───────────
        legacy_filters = Q()
        if role_ids:
            legacy_filters |= Q(access_type='role', access_id__in=role_ids, role__isnull=True)

        dept_ids = set()
        if user.department_id:
            dept_ids.add(user.department_id)
            for ancestor in user.department.get_ancestors():
                dept_ids.add(ancestor.id)
        if dept_ids:
            legacy_filters |= Q(access_type='department', access_id__in=dept_ids, org_unit__isnull=True)

        legacy_filters |= Q(access_type='user', access_id=user.id, user__isnull=True)

        if legacy_filters:
            legacy_grants = DocumentAccess.objects.filter(
                legacy_filters,
                document__tenant=user.tenant,
            ).values_list('document_id', flat=True)
            document_ids.update(legacy_grants)

        # ── Rule 1: Public documents ─────────────────────────────────────
        public_doc_ids = Document.objects.filter(
            tenant=user.tenant,
            visibility_type='public',
            status='completed',
        ).values_list('id', flat=True)
        document_ids.update(public_doc_ids)

        # ── Rule 2: Own uploads ──────────────────────────────────────────
        own_doc_ids = Document.objects.filter(
            tenant=user.tenant,
            uploaded_by=user,
            status='completed',
        ).values_list('id', flat=True)
        document_ids.update(own_doc_ids)

        # ── Classification enforcement ───────────────────────────────────
        if clearance < 5:  # 5 = max clearance, skip filtering
            too_classified = set(
                Document.objects.filter(
                    id__in=document_ids,
                    classification_level__gt=clearance,
                ).values_list('id', flat=True)
            )
            document_ids -= too_classified

        cache.set(cache_key, list(document_ids), cls.CACHE_TIMEOUT)
        return document_ids

    @classmethod
    def count_accessible_documents(cls, user: User) -> int:
        """Count documents accessible to user without loading IDs."""
        if user.is_superuser:
            return Document.objects.count()
        if user.is_tenant_admin:
            return Document.objects.filter(tenant=user.tenant).count()

        id_cache_key = cls.get_cache_key(user.id)
        cached_ids = cache.get(id_cache_key)
        if cached_ids is not None:
            return len(cached_ids)

        return len(cls.get_accessible_document_ids(user))

    @classmethod
    def get_accessible_documents(cls, user: User, include_deleted: bool = False) -> QuerySet:
        """Get QuerySet of documents accessible by user (excludes soft-deleted by default)."""
        document_ids = cls.get_accessible_document_ids(user)
        qs = Document.objects.filter(id__in=document_ids)
        if not include_deleted:
            qs = qs.filter(is_deleted=False)
        return qs

    @classmethod
    def can_access_document(cls, user: User, document_id: UUID) -> bool:
        """Check if user can access a specific document."""
        accessible_ids = cls.get_accessible_document_ids(user)
        return document_id in accessible_ids

    @classmethod
    def get_permission_level(cls, user: User, document_id: UUID) -> str:
        """
        Return the highest permission_level the user holds for a document.
        Order: manage > write > read > '' (no access).

        Owners (uploader), superusers and tenant admins always get 'manage'.
        """
        LEVELS = {'manage': 3, 'write': 2, 'read': 1}

        if user.is_superuser or user.is_tenant_admin:
            return 'manage'

        try:
            doc = Document.objects.get(pk=document_id)
        except Document.DoesNotExist:
            return ''

        if doc.uploaded_by_id == user.id:
            return 'manage'

        if not cls.can_access_document(user, document_id):
            return ''

        now = timezone.now()
        active = Q(expires_at__isnull=True) | Q(expires_at__gt=now)

        role_ids = RoleResolutionService.resolve_user_roles(user)
        org_unit_ids = cls._get_user_org_unit_ids(user)

        grants = DocumentAccess.objects.filter(
            active,
            document_id=document_id,
        ).filter(
            Q(user=user)
            | Q(role_id__in=role_ids)
            | Q(org_unit_id__in=org_unit_ids)
        ).values_list('permission_level', flat=True)

        best = 0
        for lvl in grants:
            best = max(best, LEVELS.get(lvl, 0))
            if best == 3:
                break

        return {3: 'manage', 2: 'write', 1: 'read'}.get(best, 'read')

    @classmethod
    def invalidate_cache(cls, user_id: UUID):
        cache.delete(cls.get_cache_key(user_id))

    @classmethod
    def invalidate_tenant_cache(cls, tenant_id: UUID):
        """Invalidate accessible-doc caches for every user in a tenant."""
        user_ids = User.objects.filter(tenant_id=tenant_id).values_list('id', flat=True)
        for user_id in user_ids:
            cls.invalidate_cache(user_id)

    @classmethod
    def invalidate_document_cache(cls, document_id: UUID):
        """Invalidate cache for all users who might access a document."""
        access_grants = DocumentAccess.objects.filter(document_id=document_id)
        user_ids = set()

        document = Document.objects.filter(id=document_id).only(
            'tenant_id', 'uploaded_by_id', 'visibility_type',
        ).first()
        if document and document.uploaded_by_id:
            user_ids.add(document.uploaded_by_id)

        # Public documents are visible tenant-wide, so a change can affect every user.
        if document and document.visibility_type == 'public':
            cls.invalidate_tenant_cache(document.tenant_id)
            return

        for grant in access_grants:
            if grant.user_id:
                user_ids.add(grant.user_id)
            elif grant.role_id:
                from apps.rbac.models import UserRole
                role_user_ids = UserRole.objects.filter(
                    role_id=grant.role_id, is_active=True,
                ).values_list('user_id', flat=True)
                user_ids.update(role_user_ids)
            elif grant.org_unit_id:
                from apps.core.models import UserOrgUnit
                if grant.include_descendants:
                    unit_ids = set(
                        OrgUnitClosure.objects.filter(ancestor_id=grant.org_unit_id)
                        .values_list('descendant_id', flat=True)
                    )
                else:
                    unit_ids = {grant.org_unit_id}
                member_ids = UserOrgUnit.objects.filter(
                    org_unit_id__in=unit_ids, is_active=True,
                ).values_list('user_id', flat=True)
                user_ids.update(member_ids)
            elif grant.access_id:
                # Legacy grants
                if grant.access_type == 'user':
                    user_ids.add(grant.access_id)

        for user_id in user_ids:
            cls.invalidate_cache(user_id)

    # ── Helpers ───────────────────────────────────────────────────────────

    @classmethod
    def _get_user_org_unit_ids(cls, user: User) -> Set[UUID]:
        """Get all active org unit IDs a user belongs to."""
        return set(
            UserOrgUnit.objects.filter(
                user=user, is_active=True,
            ).filter(
                Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()),
            ).values_list('org_unit_id', flat=True)
        )
