"""
Document access resolution service.
"""
from typing import Set, List
from uuid import UUID
from django.core.cache import cache
from django.db.models import Q, QuerySet
from apps.core.models import User
from apps.documents.models import Document, DocumentAccess
from apps.rbac.services.authorization import RoleResolutionService


class DocumentAccessService:
    """Service for resolving document access permissions."""
    
    CACHE_TIMEOUT = 900  # 15 minutes
    
    @classmethod
    def get_cache_key(cls, user_id: UUID) -> str:
        """Generate cache key for user's accessible documents."""
        return f"user:{user_id}:accessible_docs"
    
    @classmethod
    def get_accessible_document_ids(cls, user: User) -> Set[UUID]:
        """
        Get all document IDs accessible by a user.
        
        Resolution logic:
        1. Get user's roles (including inherited)
        2. Get user's department chain (including parents)
        3. Query DocumentAccess for matches
        4. Include public documents
        5. Include documents uploaded by user
        
        Args:
            user: User instance
            
        Returns:
            Set of document UUIDs
        """
        # Superusers and tenant admins see all tenant documents
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
        
        document_ids = set()
        
        # 1. Get user's roles
        role_ids = RoleResolutionService.resolve_user_roles(user)
        
        # 2. Get user's department chain
        dept_ids = set()
        if user.department:
            dept_ids.add(user.department.id)
            for ancestor in user.department.get_ancestors():
                dept_ids.add(ancestor.id)
        
        # 3. Query DocumentAccess
        access_filters = Q()
        
        if role_ids:
            access_filters |= Q(access_type='role', access_id__in=role_ids)
        
        if dept_ids:
            access_filters |= Q(access_type='department', access_id__in=dept_ids)
        
        access_filters |= Q(access_type='user', access_id=user.id)
        
        if access_filters:
            granted_doc_ids = DocumentAccess.objects.filter(
                access_filters,
                document__tenant=user.tenant
            ).values_list('document_id', flat=True)
            document_ids.update(granted_doc_ids)
        
        # 4. Include public documents in tenant
        public_doc_ids = Document.objects.filter(
            tenant=user.tenant,
            visibility_type='public',
            status='completed'
        ).values_list('id', flat=True)
        document_ids.update(public_doc_ids)
        
        # 5. Include documents uploaded by user
        uploaded_doc_ids = Document.objects.filter(
            tenant=user.tenant,
            uploaded_by=user,
            status='completed'
        ).values_list('id', flat=True)
        document_ids.update(uploaded_doc_ids)
        
        # Cache the result
        cache.set(cache_key, list(document_ids), cls.CACHE_TIMEOUT)
        
        return document_ids
    
    @classmethod
    def get_accessible_documents(cls, user: User) -> QuerySet:
        """
        Get QuerySet of documents accessible by user.
        
        Args:
            user: User instance
            
        Returns:
            QuerySet of Document objects
        """
        document_ids = cls.get_accessible_document_ids(user)
        return Document.objects.filter(id__in=document_ids)
    
    @classmethod
    def can_access_document(cls, user: User, document_id: UUID) -> bool:
        """
        Check if user can access a specific document.
        
        Args:
            user: User instance
            document_id: UUID of document
            
        Returns:
            Boolean indicating access permission
        """
        accessible_ids = cls.get_accessible_document_ids(user)
        return document_id in accessible_ids
    
    @classmethod
    def invalidate_cache(cls, user_id: UUID):
        """Invalidate document access cache for a user."""
        cache_key = cls.get_cache_key(user_id)
        cache.delete(cache_key)
    
    @classmethod
    def invalidate_document_cache(cls, document_id: UUID):
        """Invalidate cache for all users who might access a document."""
        # Get all users who have access grants for this document
        access_grants = DocumentAccess.objects.filter(document_id=document_id)
        
        user_ids = set()
        for grant in access_grants:
            if grant.access_type == 'user':
                user_ids.add(grant.access_id)
            elif grant.access_type == 'role':
                from apps.rbac.models import UserRole
                role_user_ids = UserRole.objects.filter(
                    role_id=grant.access_id
                ).values_list('user_id', flat=True)
                user_ids.update(role_user_ids)
            elif grant.access_type == 'department':
                from apps.core.models import User
                dept_user_ids = User.objects.filter(
                    department_id=grant.access_id
                ).values_list('id', flat=True)
                user_ids.update(dept_user_ids)
        
        # Invalidate cache for all affected users
        for user_id in user_ids:
            cls.invalidate_cache(user_id)
