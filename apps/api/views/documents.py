"""
Document management views.
"""
import os
import mimetypes
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
from django.http import FileResponse, Http404
from django_ratelimit.decorators import ratelimit
from django.utils.decorators import method_decorator
from apps.documents.models import Document, DocumentAccess
from apps.documents.services.access import DocumentAccessService
from apps.api.serializers import (
    DocumentSerializer, DocumentUploadSerializer, DocumentAccessSerializer
)
from apps.api.permissions import HasPermission
from apps.documents.tasks import process_document_task, delete_document_embeddings_task
from apps.core.exceptions import DocumentAccessDeniedError
from apps.api.views.dashboard import invalidate_dashboard_cache


class DocumentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for document management.

    Permission strategy:
      - list / retrieve: any authenticated tenant member (access-level filtering
        is already applied in get_queryset via DocumentAccessService — only
        documents the user is entitled to see are returned).
      - create / update / partial_update / destroy: still require the
        role-based ('document', <action>) RBAC permission.
    """

    serializer_class = DocumentSerializer
    parser_classes = [MultiPartParser, FormParser]

    # Default: authenticated users can read; write actions check RBAC below.
    permission_classes = [IsAuthenticated]

    # Mapping of action → (resource_type, action) for write operations.
    _WRITE_PERMISSIONS = {
        'create':         ('document', 'create'),
        'upload':         ('document', 'create'),
        'update':         ('document', 'update'),
        'partial_update': ('document', 'update'),
        'destroy':        ('document', 'delete'),
    }

    def get_permissions(self):
        """Return permission instances appropriate for the current action."""
        required = self._WRITE_PERMISSIONS.get(self.action)
        if required:
            perm = HasPermission()
            perm.required_permission = required
            # Attach required_permission to the view so HasPermission can read it.
            self.required_permission = required
            return [perm]
        # list / retrieve / any other read action: just authentication.
        return [IsAuthenticated()]

    def get_queryset(self):
        """Return only documents accessible by the user."""
        return DocumentAccessService.get_accessible_documents(self.request.user)

    @method_decorator(ratelimit(key='user', rate=settings.DOCUMENT_UPLOAD_RATE_LIMIT, method='POST'))
    def create(self, request, *args, **kwargs):
        """Standard REST create endpoint - handles multipart document upload."""
        serializer = DocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        file = serializer.validated_data['file']
        title = serializer.validated_data.get('title', file.name)
        department_id = serializer.validated_data.get('department')
        classification_level = serializer.validated_data.get('classification_level', 0)
        visibility_type = serializer.validated_data.get('visibility_type', 'restricted')
        if file.size > settings.MAX_UPLOAD_SIZE:
            return Response({'error': f'File too large'}, status=status.HTTP_400_BAD_REQUEST)
        file_path = self._save_file(file, request.user.tenant.id if request.user.tenant else 'platform')
        document = Document.objects.create(
            tenant=request.user.tenant,
            title=title, file_path=file_path, file_size=file.size,
            file_type=os.path.splitext(file.name)[1], uploaded_by=request.user,
            department_id=department_id, classification_level=classification_level,
            visibility_type=visibility_type, status='pending'
        )
        process_document_task.delay(str(document.id))
        invalidate_dashboard_cache(request.user.id)
        return Response(DocumentSerializer(document).data, status=status.HTTP_201_CREATED)

    @method_decorator(ratelimit(key='user', rate=settings.DOCUMENT_UPLOAD_RATE_LIMIT, method='POST'))
    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload(self, request):
        """Legacy upload action - delegates to create() for backward compatibility."""
        return self.create(request)
    
    def _save_file(self, file, tenant_id):
        """Save uploaded file to storage."""
        # Create tenant directory
        tenant_dir = os.path.join(settings.MEDIA_ROOT, str(tenant_id))
        os.makedirs(tenant_dir, exist_ok=True)
        
        # Generate unique filename
        import uuid
        filename = f"{uuid.uuid4()}{os.path.splitext(file.name)[1]}"
        file_path = os.path.join(tenant_dir, filename)
        
        # Save file
        with open(file_path, 'wb+') as destination:
            for chunk in file.chunks():
                destination.write(chunk)
        
        return file_path
    
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """
        Serve the original file as a download.
        GET /api/v1/documents/{id}/download/
        Access is already enforced by get_queryset (only accessible documents
        are visible to the user), so a 404 here means either the document
        doesn't exist or the user doesn't have permission.
        """
        document = self.get_object()  # raises 404 if not accessible

        if not document.file_path or not os.path.exists(document.file_path):
            raise Http404('File not found on server.')

        # Determine MIME type from extension, fall back to octet-stream
        mime_type, _ = mimetypes.guess_type(document.file_path)
        if not mime_type:
            mime_type = 'application/octet-stream'

        # Build a safe filename: use document title + original extension
        ext = os.path.splitext(document.file_path)[1]
        safe_title = "".join(c if c.isalnum() or c in ' ._-' else '_' for c in document.title)
        download_filename = f"{safe_title}{ext}"

        file_handle = open(document.file_path, 'rb')
        response = FileResponse(file_handle, content_type=mime_type)
        response['Content-Disposition'] = f'attachment; filename="{download_filename}"'
        response['Content-Length'] = os.path.getsize(document.file_path)
        return response

    def destroy(self, request, *args, **kwargs):
        """Delete document and its embeddings."""
        document = self.get_object()
        
        # Check if user can delete (must be uploader or have delete permission)
        if document.uploaded_by != request.user:
            from apps.rbac.services.authorization import PermissionService
            if not PermissionService.has_permission(request.user, 'document', 'delete'):
                raise DocumentAccessDeniedError()
        
        # Delete file
        if os.path.exists(document.file_path):
            os.remove(document.file_path)
        
        # Trigger async embedding deletion
        delete_document_embeddings_task.delay(str(document.id))
        invalidate_dashboard_cache(request.user.id)

        # Delete document
        document.delete()
        
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentAccessViewSet(viewsets.ModelViewSet):
    """ViewSet for managing document access."""
    
    serializer_class = DocumentAccessSerializer
    permission_classes = [HasPermission]
    required_permission = ('document', 'manage')
    
    def get_queryset(self):
        """Return access grants for accessible documents."""
        accessible_docs = DocumentAccessService.get_accessible_documents(self.request.user)
        return DocumentAccess.objects.filter(document__in=accessible_docs)
    
    def perform_create(self, serializer):
        """Create access grant."""
        serializer.save(granted_by=self.request.user)
        
        # Invalidate cache for affected users
        document_id = serializer.validated_data['document'].id
        DocumentAccessService.invalidate_document_cache(document_id)
    
    def perform_destroy(self, instance):
        """Delete access grant."""
        document_id = instance.document.id
        instance.delete()
        
        # Invalidate cache
        DocumentAccessService.invalidate_document_cache(document_id)
