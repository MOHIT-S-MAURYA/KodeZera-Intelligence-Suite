"""
Chat serializers.
"""
from rest_framework import serializers
from apps.rag.models import ChatSession, ChatMessage, ChatFolder


class ChatFolderSerializer(serializers.ModelSerializer):
    """Serializer for ChatFolder."""
    class Meta:
        model = ChatFolder
        fields = ['id', 'name', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_name(self, value):
        """Validate that folder name is not empty and not a duplicate."""
        if not value or not value.strip():
            raise serializers.ValidationError("Folder name cannot be empty.")
        
        request = self.context.get('request')
        if request and request.user:
            # Check for duplicate folder names for this user
            queryset = ChatFolder.objects.filter(
                user=request.user,
                tenant=request.user.tenant,
                name__iexact=value.strip()
            )
            # Exclude the current folder if updating
            if self.instance:
                queryset = queryset.exclude(id=self.instance.id)
            
            if queryset.exists():
                raise serializers.ValidationError("A folder with this name already exists.")
        
        return value.strip()



class ChatMessageSerializer(serializers.ModelSerializer):
    """Serializer for ChatMessage."""
    class Meta:
        model = ChatMessage
        fields = ['id', 'session', 'role', 'content', 'sources', 'created_at']
        read_only_fields = ['id', 'created_at']


class ChatSessionSerializer(serializers.ModelSerializer):
    """Serializer for ChatSession."""
    # Only include latest message snippet if expanding
    latest_message = serializers.SerializerMethodField()
    
    class Meta:
        model = ChatSession
        fields = ['id', 'title', 'folder', 'created_at', 'updated_at', 'latest_message']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_latest_message(self, obj):
        latest = obj.messages.order_by('-created_at').first()
        if latest:
            return {
                'role': latest.role,
                'content': latest.content[:100] + '...' if len(latest.content) > 100 else latest.content,
                'created_at': latest.created_at
            }
        return None


class ChatSessionCreateSerializer(serializers.Serializer):
    """Serializer for creating a new ChatSession."""
    title = serializers.CharField(max_length=255, required=False, default="New Chat")


class ChatSessionRenameSerializer(serializers.Serializer):
    """Serializer for renaming a ChatSession."""
    title = serializers.CharField(max_length=255, required=True)
    def validate_title(self, value):
        """Validate that session title is not empty and not a duplicate."""
        if not value or not value.strip():
            raise serializers.ValidationError("Chat name cannot be empty.")
        
        request = self.context.get('request')
        if request and request.user:
            # Check for duplicate session titles for this user
            queryset = ChatSession.objects.filter(
                user=request.user,
                tenant=request.user.tenant,
                title__iexact=value.strip()
            )
            # Exclude the current session if updating
            if self.instance:
                queryset = queryset.exclude(id=self.instance.id)
            
            if queryset.exists():
                raise serializers.ValidationError("A chat with this name already exists.")
        
        return value.strip()


class ChatSessionUpdateFolderSerializer(serializers.Serializer):
    """Serializer for moving a ChatSession to a different folder."""
    folder_id = serializers.UUIDField(required=False, allow_null=True)


class BulkSessionDeleteSerializer(serializers.Serializer):
    """Serializer for bulk deleting chat sessions."""
    session_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False
    )


class BulkSessionFolderSerializer(serializers.Serializer):
    """Serializer for bulk moving chat sessions to a folder."""
    session_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False
    )
    folder_id = serializers.UUIDField(required=False, allow_null=True)
