"""
RAG (Retrieval-Augmented Generation) models.
Includes: VectorChunk (for tracking)
"""
import uuid
from django.db import models
from apps.documents.models import Document


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
