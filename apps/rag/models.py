"""
RAG (Retrieval-Augmented Generation) models.
Includes: VectorChunk (for tracking)
"""
import uuid
from django.db import models
from apps.documents.models import Document
from apps.core.models import Tenant, User


class VectorChunk(models.Model):
    """
    Tracks vector chunks stored in Qdrant.
    Used for cleanup and reference.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='vector_chunks'
    )
    chunk_index = models.IntegerField()
    vector_id = models.CharField(
        max_length=255,
        unique=True,
        help_text='ID in Qdrant vector database'
    )
    text_preview = models.TextField(
        max_length=500,
        blank=True,
        help_text='First 500 chars of chunk text'
    )
    token_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'vector_chunks'
        ordering = ['document', 'chunk_index']
        unique_together = [['document', 'chunk_index']]
        indexes = [
            models.Index(fields=['document']),
            models.Index(fields=['vector_id']),
        ]

    def __str__(self):
        return f"{self.document.title} - Chunk {self.chunk_index}"


class ChatFolder(models.Model):
    """
    User-defined folders to group chat sessions together.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='chat_folders',
        null=True, blank=True
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='chat_folders'
    )
    name = models.CharField(max_length=255, help_text="Name of the folder")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'chat_folders'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['tenant', 'user']),
        ]

    def __str__(self):
        return f"Folder: {self.name} ({self.user.email})"


class ChatSession(models.Model):
    """
    Groups chat messages into a persistent conversational session.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='chat_sessions',
        null=True, blank=True
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='chat_sessions'
    )
    folder = models.ForeignKey(
        ChatFolder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sessions',
        help_text="Optional folder grouping for this chat"
    )
    title = models.CharField(
        max_length=255, 
        default="New Chat",
        help_text="User-defined or auto-generated title for the chat"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'chat_sessions'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['tenant', 'user']),
        ]

    def __str__(self):
        return f"Chat: {self.title} ({self.user.email})"


class ChatMessage(models.Model):
    """
    Individual message within a conversational session.
    """
    ROLE_CHOICES = [
        ('user', 'User'),
        ('assistant', 'Assistant'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        ChatSession,
        on_delete=models.CASCADE,
        related_name='messages'
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField()
    sources = models.JSONField(
        null=True, 
        blank=True,
        help_text="List of source dictionaries used for assistant responses"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'chat_messages'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['session', 'created_at']),
        ]

    def __str__(self):
        return f"{self.role.capitalize()}: {self.content[:50]}"
