"""
Chat Session Views.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.rag.models import ChatSession, ChatMessage, ChatFolder
from apps.api.serializers.chat import (
    ChatSessionSerializer, 
    ChatMessageSerializer,
    ChatSessionCreateSerializer,
    ChatSessionRenameSerializer,
    ChatFolderSerializer,
    ChatSessionUpdateFolderSerializer,
    BulkSessionDeleteSerializer,
    BulkSessionFolderSerializer
)
import logging

logger = logging.getLogger(__name__)


class ChatFolderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing user ChatFolders.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ChatFolderSerializer

    def get_queryset(self):
        """Only return chat folders belonging to the current user and tenant."""
        return ChatFolder.objects.filter(
            user=self.request.user,
            tenant=self.request.user.tenant
        ).order_by('-updated_at')

    def perform_create(self, serializer):
        """Create a new chat folder."""
        serializer.save(
            user=self.request.user,
            tenant=self.request.user.tenant
        )


class ChatSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing user ChatSessions.
    Provides list, create, retrieve, update (rename), and destroy operations.
    """
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Only return chat sessions belonging to the current user and tenant."""
        return (
            ChatSession.objects
            .filter(user=self.request.user, tenant=self.request.user.tenant)
            .select_related('folder')
            .prefetch_related(
                # Fetch the single latest message per session without N+1
                # by prefetching all messages; serializer picks the last one.
                'messages',
            )
            .order_by('-updated_at')
        )

    def get_serializer_class(self):
        if self.action == 'create':
            return ChatSessionCreateSerializer
        elif self.action == 'rename_session':
            return ChatSessionRenameSerializer
        elif self.action == 'update_folder':
            return ChatSessionUpdateFolderSerializer
        elif self.action == 'bulk_delete':
            return BulkSessionDeleteSerializer
        elif self.action == 'bulk_folder':
            return BulkSessionFolderSerializer
        return ChatSessionSerializer

    def create(self, request, *args, **kwargs):
        """Create a new chat session."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        session = ChatSession.objects.create(
            user=request.user,
            tenant=request.user.tenant,
            title=serializer.validated_data.get('title', 'New Chat')
        )
        
        return Response(
            ChatSessionSerializer(session).data, 
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['patch'], url_path='rename')
    def rename_session(self, request, pk=None):
        """Rename a specific chat session."""
        session = self.get_object()
        serializer = self.get_serializer(
            instance=session,
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        
        session.title = serializer.validated_data['title']
        session.save()
        
        return Response(ChatSessionSerializer(session).data)

    @action(detail=True, methods=['patch'], url_path='folder')
    def update_folder(self, request, pk=None):
        """Move a chat session to a specific folder or remove it from all folders."""
        session = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        folder_id = serializer.validated_data.get('folder_id')
        if folder_id:
            try:
                folder = ChatFolder.objects.get(
                    id=folder_id,
                    user=request.user,
                    tenant=request.user.tenant
                )
                session.folder = folder
            except ChatFolder.DoesNotExist:
                return Response(
                    {"error": "Folder not found"}, 
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            session.folder = None
            
        session.save()
        return Response(ChatSessionSerializer(session).data)

    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        """Delete multiple chat sessions."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session_ids = serializer.validated_data['session_ids']
        
        deleted_count, _ = ChatSession.objects.filter(
            id__in=session_ids,
            user=request.user,
            tenant=request.user.tenant
        ).delete()
        
        return Response({'deleted': deleted_count}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='bulk-folder')
    def bulk_folder(self, request):
        """Move multiple chat sessions to a folder."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session_ids = serializer.validated_data['session_ids']
        folder_id = serializer.validated_data.get('folder_id')
        
        sessions = ChatSession.objects.filter(
            id__in=session_ids,
            user=request.user,
            tenant=request.user.tenant
        )

        if folder_id:
            try:
                folder = ChatFolder.objects.get(
                    id=folder_id,
                    user=request.user,
                    tenant=request.user.tenant
                )
                sessions.update(folder=folder)
            except ChatFolder.DoesNotExist:
                return Response(
                    {"error": "Folder not found"}, 
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            sessions.update(folder=None)
            
        return Response({'updated': sessions.count()}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def messages(self, request, pk=None):
        """Retrieve all messages for a specific chat session."""
        session = self.get_object()
        messages = session.messages.order_by('created_at')
        serializer = ChatMessageSerializer(messages, many=True)
        return Response(serializer.data)
