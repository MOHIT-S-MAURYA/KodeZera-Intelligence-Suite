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


class ChatSessionUpdateFolderSerializer(serializers.Serializer):
    """Serializer for moving a ChatSession to a different folder."""
    folder_id = serializers.UUIDField(required=False, allow_null=True)
