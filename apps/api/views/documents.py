"""
Document management views.
"""
import os
import mimetypes

from django.conf import settings
from django.http import FileResponse, Http404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.api.permissions import HasPermission
from apps.api.serializers import (
    DocumentSerializer, DocumentUploadSerializer, DocumentAccessSerializer,
)
from apps.api.serializers.documents import (
    DocumentUpdateSerializer,
    DocumentVersionSerializer, DocumentVersionUploadSerializer,
    DocumentFolderSerializer, DocumentTagSerializer, DocumentTagAssignmentSerializer,
)
from apps.api.views.dashboard import invalidate_dashboard_cache
from apps.core.exceptions import DocumentAccessDeniedError
from apps.core.services.notifications import NotificationService
from apps.documents.models import (
    Document, DocumentAccess, DocumentVersion,
    DocumentFolder, DocumentTag, DocumentTagAssignment,
)
from apps.documents.services.access import DocumentAccessService
from apps.documents.services.storage import StorageService
from apps.documents.tasks import process_document_task, delete_document_embeddings_task


# ── File-type allow-list ─────────────────────────────────────────────────

ALLOWED_FILE_TYPES = getattr(settings, 'ALLOWED_FILE_TYPES', {
    '.pdf':  'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc':  'application/msword',
    '.txt':  'text/plain',
    '.csv':  'text/csv',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.md':   'text/markdown',
})


def _validate_file(file) -> str | None:
    """Return an error string if the file is disallowed, else None."""
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in ALLOWED_FILE_TYPES:
        return f'File type {ext} is not allowed.'
    if file.size > getattr(settings, 'MAX_UPLOAD_SIZE', 52428800):
        return 'File too large.'
    return None


# ── DocumentViewSet ──────────────────────────────────────────────────────

class DocumentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for document CRUD.

    Read actions use IsAuthenticated; write actions use RBAC.
    Soft-delete is the default delete behaviour.
    """

    serializer_class = DocumentSerializer
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated]

    _WRITE_PERMISSIONS = {
        'create':         ('document', 'create'),
        'upload':         ('document', 'create'),
        'update':         ('document', 'update'),
        'partial_update': ('document', 'update'),
        'destroy':        ('document', 'delete'),
        'bulk_upload':    ('document', 'create'),
        'upload_version': ('document', 'update'),
        'restore':        ('document', 'update'),
        'reprocess':      ('document', 'update'),
        'permanent_delete': ('document', 'delete'),
    }

    def get_permissions(self):
        required = self._WRITE_PERMISSIONS.get(self.action)
        if required:
            perm = HasPermission()
            perm.required_permission = required
            self.required_permission = required
            return [perm]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action in ('update', 'partial_update'):
            return DocumentUpdateSerializer
        return DocumentSerializer

    def get_queryset(self):
        """Return only accessible, non-deleted documents."""
        qs = DocumentAccessService.get_accessible_documents(self.request.user)

        # Query-param filters
        folder = self.request.query_params.get('folder')
        tag = self.request.query_params.get('tag')
        doc_status = self.request.query_params.get('status')
        visibility = self.request.query_params.get('visibility_type')
        search = self.request.query_params.get('search')

        if folder:
            qs = qs.filter(folder_id=folder)
        if tag:
            qs = qs.filter(tag_assignments__tag__name=tag)
        if doc_status:
            qs = qs.filter(status=doc_status)
        if visibility:
            qs = qs.filter(visibility_type=visibility)
        if search:
            qs = qs.filter(title__icontains=search)

        return qs.select_related('uploaded_by', 'department', 'folder', 'current_version')

    # ── Create (upload) ──────────────────────────────────────────────

    @method_decorator(ratelimit(key='user', rate=settings.DOCUMENT_UPLOAD_RATE_LIMIT, method='POST'))
    def create(self, request, *args, **kwargs):
        serializer = DocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        file = serializer.validated_data['file']
        err = _validate_file(file)
        if err:
            return Response({'error': err}, status=status.HTTP_400_BAD_REQUEST)

        title = serializer.validated_data.get('title') or file.name
        description = serializer.validated_data.get('description', '')
        department_id = serializer.validated_data.get('department')
        folder_id = serializer.validated_data.get('folder')
        classification_level = serializer.validated_data.get('classification_level', 0)
        visibility_type = serializer.validated_data.get('visibility_type', 'restricted')

        tenant_id = request.user.tenant.id if request.user.tenant else 'platform'

        # Storage
        content_hash = StorageService.compute_hash(file)
        ext = os.path.splitext(file.name)[1].lower()
        mime, _ = mimetypes.guess_type(file.name)
        file_key = StorageService.generate_file_key(tenant_id, file.name, content_hash)
        StorageService.save(file_key, file)

        # Also keep legacy file_path for backward compat
        file_path = StorageService._resolve(file_key)

        document = Document.objects.create(
            tenant=request.user.tenant,
            title=title,
            description=description,
            file_path=file_path,
            file_key=file_key,
            file_size=file.size,
            file_type=ext,
            original_filename=file.name,
            content_hash=content_hash,
            mime_type=mime or '',
            uploaded_by=request.user,
            department_id=department_id,
            folder_id=folder_id,
            classification_level=classification_level,
            visibility_type=visibility_type,
            status='pending',
        )

        # Create v1
        version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            file_key=file_key,
            file_size=file.size,
            content_hash=content_hash,
            original_filename=file.name,
            mime_type=mime or '',
            uploaded_by=request.user,
        )
        document.current_version = version
        document.save(update_fields=['current_version'])

        process_document_task.delay(str(document.id))
        invalidate_dashboard_cache(request.user.id)

        # Notifications
        if document.department_id:
            NotificationService.notify_department(
                tenant_id=request.user.tenant_id,
                department_id=document.department_id,
                title='New Document Uploaded',
                message=f'"{document.title}" has been uploaded to your department.',
                category='document',
                created_by=request.user,
            )
        else:
            NotificationService.notify_tenant(
                tenant_id=request.user.tenant_id,
                title='New Document Uploaded',
                message=f'"{document.title}" has been uploaded.',
                category='document',
                created_by=request.user,
            )

        return Response(DocumentSerializer(document).data, status=status.HTTP_201_CREATED)

    @method_decorator(ratelimit(key='user', rate=settings.DOCUMENT_UPLOAD_RATE_LIMIT, method='POST'))
    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload(self, request):
        """Legacy upload action — delegates to create()."""
        return self.create(request)

    @method_decorator(ratelimit(key='user', rate=settings.DOCUMENT_UPLOAD_RATE_LIMIT, method='POST'))
    @action(detail=False, methods=['post'], url_path='bulk-upload', parser_classes=[MultiPartParser, FormParser])
    def bulk_upload(self, request):
        """Upload multiple files at once. Files are sent as file_0, file_1, …"""
        results = []
        idx = 0
        while f'file_{idx}' in request.FILES:
            f = request.FILES[f'file_{idx}']
            err = _validate_file(f)
            if err:
                results.append({'filename': f.name, 'error': err})
                idx += 1
                continue

            tenant_id = request.user.tenant.id if request.user.tenant else 'platform'
            content_hash = StorageService.compute_hash(f)
            ext = os.path.splitext(f.name)[1].lower()
            mime, _ = mimetypes.guess_type(f.name)
            file_key = StorageService.generate_file_key(tenant_id, f.name, content_hash)
            StorageService.save(file_key, f)

            doc = Document.objects.create(
                tenant=request.user.tenant,
                title=f.name,
                file_path=StorageService._resolve(file_key),
                file_key=file_key,
                file_size=f.size,
                file_type=ext,
                original_filename=f.name,
                content_hash=content_hash,
                mime_type=mime or '',
                uploaded_by=request.user,
                visibility_type=request.data.get('visibility_type', 'restricted'),
                classification_level=int(request.data.get('classification_level', 0)),
                status='pending',
            )
            ver = DocumentVersion.objects.create(
                document=doc, version_number=1, file_key=file_key,
                file_size=f.size, content_hash=content_hash,
                original_filename=f.name, mime_type=mime or '',
                uploaded_by=request.user,
            )
            doc.current_version = ver
            doc.save(update_fields=['current_version'])

            process_document_task.delay(str(doc.id))
            results.append(DocumentSerializer(doc).data)
            idx += 1

        invalidate_dashboard_cache(request.user.id)
        return Response(results, status=status.HTTP_201_CREATED)

    # ── Download ─────────────────────────────────────────────────────

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        document = self.get_object()

        file_handle = None
        if document.file_key:
            file_handle = StorageService.open(document.file_key)
        if file_handle is None and document.file_path and os.path.exists(document.file_path):
            file_handle = open(document.file_path, 'rb')
        if file_handle is None:
            raise Http404('File not found on server.')

        mime = document.mime_type or 'application/octet-stream'
        ext = os.path.splitext(document.original_filename or document.file_path)[1]
        safe_title = "".join(c if c.isalnum() or c in ' ._-' else '_' for c in document.title)
        download_filename = f"{safe_title}{ext}"

        response = FileResponse(file_handle, content_type=mime)
        response['Content-Disposition'] = f'attachment; filename="{download_filename}"'
        return response

    # ── Soft delete / restore / trash / permanent delete ─────────────

    def destroy(self, request, *args, **kwargs):
        """Soft-delete a document (move to trash)."""
        document = self.get_object()
        if document.uploaded_by != request.user:
            from apps.rbac.services.authorization import PermissionService
            if not PermissionService.has_permission(request.user, 'document', 'delete'):
                raise DocumentAccessDeniedError()

        document.is_deleted = True
        document.deleted_at = timezone.now()
        document.save(update_fields=['is_deleted', 'deleted_at'])
        invalidate_dashboard_cache(request.user.id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'])
    def trash(self, request):
        """List soft-deleted documents for the user."""
        qs = DocumentAccessService.get_accessible_documents(request.user, include_deleted=True)
        qs = qs.filter(is_deleted=True)
        serializer = DocumentSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore a soft-deleted document."""
        document = self.get_object()
        document.is_deleted = False
        document.deleted_at = None
        document.save(update_fields=['is_deleted', 'deleted_at'])
        return Response(DocumentSerializer(document).data)

    @action(detail=True, methods=['delete'], url_path='permanent-delete')
    def permanent_delete(self, request, pk=None):
        """Permanently delete document, file and embeddings."""
        document = self.get_object()

        # Delete file from storage
        if document.file_key:
            StorageService.delete(document.file_key)
        elif document.file_path and os.path.exists(document.file_path):
            os.remove(document.file_path)

        # Delete version files
        for ver in document.versions.all():
            StorageService.delete(ver.file_key)

        delete_document_embeddings_task.delay(str(document.id))
        invalidate_dashboard_cache(request.user.id)
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ── Reprocess ────────────────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def reprocess(self, request, pk=None):
        """Re-run the processing pipeline for a document."""
        document = self.get_object()
        document.status = 'pending'
        document.processing_progress = 0
        document.processing_error = ''
        document.save(update_fields=['status', 'processing_progress', 'processing_error'])
        process_document_task.delay(str(document.id))
        return Response(DocumentSerializer(document).data)

    # ── Processing progress ──────────────────────────────────────────

    @action(detail=True, methods=['get'])
    def progress(self, request, pk=None):
        """Return real-time processing progress (from cache or DB)."""
        from django.core.cache import cache
        cached = cache.get(f"doc:{pk}:progress")
        if cached is not None:
            return Response({'progress': cached})
        document = self.get_object()
        return Response({'progress': document.processing_progress})

    # ── Versions ─────────────────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='versions')
    def list_versions(self, request, pk=None):
        document = self.get_object()
        versions = document.versions.select_related('uploaded_by').all()
        return Response(DocumentVersionSerializer(versions, many=True).data)

    @action(detail=True, methods=['post'], url_path='versions',
            parser_classes=[MultiPartParser, FormParser])
    def upload_version(self, request, pk=None):
        """Upload a new version of an existing document."""
        document = self.get_object()
        serializer = DocumentVersionUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        file = serializer.validated_data['file']
        err = _validate_file(file)
        if err:
            return Response({'error': err}, status=status.HTTP_400_BAD_REQUEST)

        tenant_id = request.user.tenant.id if request.user.tenant else 'platform'
        content_hash = StorageService.compute_hash(file)
        ext = os.path.splitext(file.name)[1].lower()
        mime, _ = mimetypes.guess_type(file.name)
        file_key = StorageService.generate_file_key(tenant_id, file.name, content_hash)
        StorageService.save(file_key, file)

        last_version = document.versions.order_by('-version_number').first()
        next_ver = (last_version.version_number + 1) if last_version else 1

        version = DocumentVersion.objects.create(
            document=document,
            version_number=next_ver,
            file_key=file_key,
            file_size=file.size,
            content_hash=content_hash,
            original_filename=file.name,
            mime_type=mime or '',
            change_note=serializer.validated_data.get('change_note', ''),
            uploaded_by=request.user,
        )

        # Update document to point to new version
        document.current_version = version
        document.file_key = file_key
        document.file_path = StorageService._resolve(file_key)
        document.file_size = file.size
        document.file_type = ext
        document.content_hash = content_hash
        document.original_filename = file.name
        document.mime_type = mime or ''
        document.status = 'pending'
        document.processing_progress = 0
        document.save()

        process_document_task.delay(str(document.id))
        return Response(DocumentVersionSerializer(version).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path=r'versions/(?P<version_number>\d+)/download')
    def download_version(self, request, pk=None, version_number=None):
        document = self.get_object()
        try:
            version = document.versions.get(version_number=version_number)
        except DocumentVersion.DoesNotExist:
            raise Http404('Version not found.')

        file_handle = StorageService.open(version.file_key)
        if file_handle is None:
            raise Http404('Version file not found on server.')

        mime = version.mime_type or 'application/octet-stream'
        ext = os.path.splitext(version.original_filename)[1]
        safe_title = "".join(c if c.isalnum() or c in ' ._-' else '_' for c in document.title)
        filename = f"{safe_title}_v{version.version_number}{ext}"

        response = FileResponse(file_handle, content_type=mime)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=['post'], url_path=r'versions/(?P<version_number>\d+)/restore')
    def restore_version(self, request, pk=None, version_number=None):
        """Restore a previous version as the current one."""
        document = self.get_object()
        try:
            version = document.versions.get(version_number=version_number)
        except DocumentVersion.DoesNotExist:
            raise Http404('Version not found.')

        document.current_version = version
        document.file_key = version.file_key
        document.file_size = version.file_size
        document.content_hash = version.content_hash
        document.original_filename = version.original_filename
        document.mime_type = version.mime_type
        document.status = 'pending'
        document.processing_progress = 0
        document.save()

        process_document_task.delay(str(document.id))
        return Response(DocumentSerializer(document).data)

    # ── Access grants (nested under document) ────────────────────────

    @action(detail=True, methods=['get'], url_path='access')
    def list_access(self, request, pk=None):
        document = self.get_object()
        grants = document.access_grants.select_related('role', 'org_unit', 'user', 'granted_by').all()
        return Response(DocumentAccessSerializer(grants, many=True).data)

    @action(detail=True, methods=['post'], url_path='access')
    def create_access(self, request, pk=None):
        document = self.get_object()
        # Require manage permission
        perm = DocumentAccessService.get_permission_level(request.user, document.id)
        if perm != 'manage':
            raise DocumentAccessDeniedError()

        serializer = DocumentAccessSerializer(data={**request.data, 'document': str(document.id)})
        serializer.is_valid(raise_exception=True)
        serializer.save(granted_by=request.user)
        DocumentAccessService.invalidate_document_cache(document.id)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'access/(?P<grant_id>[^/.]+)')
    def revoke_access(self, request, pk=None, grant_id=None):
        document = self.get_object()
        perm = DocumentAccessService.get_permission_level(request.user, document.id)
        if perm != 'manage':
            raise DocumentAccessDeniedError()

        try:
            grant = document.access_grants.get(pk=grant_id)
        except DocumentAccess.DoesNotExist:
            raise Http404('Grant not found.')
        grant.delete()
        DocumentAccessService.invalidate_document_cache(document.id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='access/effective')
    def effective_access(self, request, pk=None):
        """Return the current user's effective permission level for this document."""
        document = self.get_object()
        level = DocumentAccessService.get_permission_level(request.user, document.id)
        return Response({'permission_level': level})

    # ── Tags (nested under document) ─────────────────────────────────

    @action(detail=True, methods=['get', 'post'], url_path='tags')
    def document_tags(self, request, pk=None):
        document = self.get_object()
        if request.method == 'GET':
            assignments = document.tag_assignments.select_related('tag').all()
            return Response(DocumentTagAssignmentSerializer(assignments, many=True).data)
        # POST — assign tag
        serializer = DocumentTagAssignmentSerializer(
            data={**request.data, 'document': str(document.id)},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(assigned_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'tags/(?P<tag_id>[^/.]+)')
    def remove_tag(self, request, pk=None, tag_id=None):
        document = self.get_object()
        try:
            assignment = document.tag_assignments.get(tag_id=tag_id)
        except DocumentTagAssignment.DoesNotExist:
            raise Http404('Tag assignment not found.')
        assignment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── DocumentAccessViewSet (top-level) ────────────────────────────────────

class DocumentAccessViewSet(viewsets.ModelViewSet):
    """ViewSet for managing document access (top-level route)."""

    serializer_class = DocumentAccessSerializer
    permission_classes = [HasPermission]
    required_permission = ('document', 'manage')

    def get_queryset(self):
        accessible_docs = DocumentAccessService.get_accessible_documents(self.request.user)
        return DocumentAccess.objects.filter(document__in=accessible_docs).select_related(
            'role', 'org_unit', 'user', 'granted_by',
        )

    def perform_create(self, serializer):
        serializer.save(granted_by=self.request.user)
        document_id = serializer.validated_data['document'].id
        DocumentAccessService.invalidate_document_cache(document_id)

    def perform_destroy(self, instance):
        document_id = instance.document.id
        instance.delete()
        DocumentAccessService.invalidate_document_cache(document_id)


# ── DocumentFolderViewSet ────────────────────────────────────────────────

class DocumentFolderViewSet(viewsets.ModelViewSet):
    """CRUD for per-tenant document folders."""
    serializer_class = DocumentFolderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DocumentFolder.objects.filter(
            tenant=self.request.user.tenant,
        ).select_related('owner')

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant, owner=self.request.user)


# ── DocumentTagViewSet ───────────────────────────────────────────────────

class DocumentTagViewSet(viewsets.ModelViewSet):
    """CRUD for per-tenant document tags."""
    serializer_class = DocumentTagSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DocumentTag.objects.filter(tenant=self.request.user.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)
