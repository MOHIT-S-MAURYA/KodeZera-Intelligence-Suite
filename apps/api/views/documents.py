"""
Document management views.
"""
import os
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.conf import settings
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


class DocumentViewSet(viewsets.ModelViewSet):
    """ViewSet for document management."""
    
    serializer_class = DocumentSerializer
    permission_classes = [HasPermission]
    required_permission = ('document', 'read')
    
    def get_queryset(self):
        """Return only documents accessible by the user."""
        return DocumentAccessService.get_accessible_documents(self.request.user)
    
    @method_decorator(ratelimit(key='user', rate=settings.DOCUMENT_UPLOAD_RATE_LIMIT, method='POST'))
    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload(self, request):
        """
        Upload a document.
        Triggers async processing.
        """
        serializer = DocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        file = serializer.validated_data['file']
        title = serializer.validated_data.get('title', file.name)
        department_id = serializer.validated_data.get('department')
        classification_level = serializer.validated_data.get('classification_level', 0)
        visibility_type = serializer.validated_data.get('visibility_type', 'restricted')
        
        # Validate file size
        if file.size > settings.MAX_UPLOAD_SIZE:
            return Response(
                {'error': f'File size exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE} bytes'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Save file
        file_path = self._save_file(file, request.user.tenant.id)
        
        # Create document record
        document = Document.objects.create(
            tenant=request.user.tenant,
            title=title,
            file_path=file_path,
            file_size=file.size,
            file_type=os.path.splitext(file.name)[1],
            uploaded_by=request.user,
            department_id=department_id,
            classification_level=classification_level,
            visibility_type=visibility_type,
            status='pending'
        )
        
        # Trigger async processing
        process_document_task.delay(str(document.id))
        
        return Response(
            DocumentSerializer(document).data,
            status=status.HTTP_201_CREATED
        )
    
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
