"""
Celery tasks for document processing.
"""
import hashlib
import mimetypes
import os

from celery import shared_task
from django.conf import settings
from django.core.cache import cache

from apps.documents.models import Document
from apps.rag.models import VectorChunk
from apps.rag.services.document_processing import DocumentProcessingService
from apps.rag.services.embeddings import EmbeddingService
from apps.rag.services.vector_store import VectorStoreService
from apps.core.exceptions import DocumentProcessingError
import logging

logger = logging.getLogger(__name__)


def _set_progress(document: Document, progress: int):
    """Update processing_progress on the document and broadcast via cache."""
    document.processing_progress = progress
    Document.objects.filter(pk=document.pk).update(processing_progress=progress)
    cache.set(f"doc:{document.pk}:progress", progress, timeout=600)


@shared_task(bind=True, max_retries=3)
def process_document_task(self, document_id: str):
    """
    Async task to process a document.

    Steps:
    1. Extract text            (0 → 20 %)
    2. Chunk text              (20 → 30 %)
    3. Generate embeddings     (30 → 70 %)
    4. Store in Qdrant         (70 → 90 %)
    5. Metadata extraction     (90 → 95 %)
    6. Finalise                (95 → 100 %)
    """
    try:
        document = Document.objects.get(id=document_id)
        document.status = 'processing'
        document.save(update_fields=['status'])
        _set_progress(document, 0)

        logger.info(f"Processing document {document_id}")

        # Resolve the actual file path (prefer file_key, fall back to file_path)
        file_path = document.file_path
        if document.file_key:
            from apps.documents.services.storage import StorageService
            resolved = StorageService._resolve(document.file_key)
            if os.path.isfile(resolved):
                file_path = resolved

        # Initialise services
        doc_processor = DocumentProcessingService()
        embedding_service = EmbeddingService()
        vector_store = VectorStoreService()

        # Step 1-2: Extract and chunk text (0 → 30 %)
        _set_progress(document, 5)
        chunks = doc_processor.process_document(file_path)
        _set_progress(document, 30)

        if not chunks:
            raise DocumentProcessingError("No text extracted from document")

        # Step 3: Generate embeddings (30 → 70 %)
        texts = [chunk['text'] for chunk in chunks]
        embeddings = embedding_service.generate_embeddings_batch(texts)
        _set_progress(document, 70)

        for i, chunk in enumerate(chunks):
            chunk['embedding'] = embeddings[i]

        # Step 4: Store in Qdrant (70 → 90 %)
        try:
            VectorChunk.objects.filter(document=document).delete()
            vector_store.delete_document_vectors(document.id)
        except Exception as clean_err:
            logger.warning(f"Could not clean up old vectors for {document_id}: {clean_err}")

        vector_ids = vector_store.store_embeddings(
            document_id=document.id,
            tenant_id=document.tenant.id,
            department_id=document.department.id if document.department else None,
            classification_level=document.classification_level,
            chunks=chunks,
        )

        if len(vector_ids) != len(chunks):
            raise DocumentProcessingError(
                f"Vector indexing incomplete: stored {len(vector_ids)} of {len(chunks)} chunks"
            )

        _set_progress(document, 90)

        # Create VectorChunk tracking records
        vector_chunks = []
        for i, (chunk, vector_id) in enumerate(zip(chunks, vector_ids)):
            vector_chunks.append(
                VectorChunk(
                    document=document,
                    chunk_index=i,
                    vector_id=vector_id,
                    text_preview=chunk['text'][:500],
                    token_count=chunk['token_count'],
                )
            )
        VectorChunk.objects.bulk_create(vector_chunks)

        # Step 5: Lightweight metadata extraction (90 → 95 %)
        _extract_metadata(document, file_path)
        _set_progress(document, 95)

        # Step 6: Finalise
        document.status = 'completed'
        document.chunk_count = len(vector_ids)
        document.processing_error = ''
        document.processing_progress = 100
        document.save()
        cache.set(f"doc:{document.pk}:progress", 100, timeout=60)

        from apps.documents.services.access import DocumentAccessService
        DocumentAccessService.invalidate_document_cache(document.id)

        logger.info(f"Successfully processed document {document_id} with {len(vector_ids)} chunks")

    except Exception as e:
        logger.error(f"Error processing document {document_id}: {e}")
        try:
            document = Document.objects.get(id=document_id)
            document.status = 'failed'
            document.processing_error = str(e)[:500]
            document.save(update_fields=['status', 'processing_error'])
            from apps.documents.services.access import DocumentAccessService
            DocumentAccessService.invalidate_document_cache(document.id)
        except Exception:
            pass
        raise self.retry(exc=e, countdown=60 * (self.request.retries + 1))


def _extract_metadata(document: Document, file_path: str):
    """Best-effort metadata extraction (page count, MIME type, content hash)."""
    try:
        # MIME type
        if not document.mime_type:
            mime, _ = mimetypes.guess_type(file_path)
            if mime:
                document.mime_type = mime

        # Content hash (if not already set)
        if not document.content_hash and os.path.isfile(file_path):
            sha = hashlib.sha256()
            with open(file_path, 'rb') as f:
                for block in iter(lambda: f.read(8192), b''):
                    sha.update(block)
            document.content_hash = sha.hexdigest()

        # Page count for PDFs
        if document.file_type == '.pdf' and os.path.isfile(file_path):
            try:
                import PyPDF2
                with open(file_path, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    document.page_count = len(reader.pages)
            except Exception:
                pass
    except Exception as meta_err:
        logger.warning(f"Metadata extraction failed for {document.id}: {meta_err}")


@shared_task
def delete_document_embeddings_task(document_id: str):
    """
    Async task to delete document embeddings from Qdrant.
    
    Args:
        document_id: UUID of document as string
    """
    try:
        logger.info(f"Deleting embeddings for document {document_id}")
        
        vector_store = VectorStoreService()
        vector_store.delete_document_vectors(document_id)
        
        # Delete VectorChunk records
        VectorChunk.objects.filter(document_id=document_id).delete()
        
        logger.info(f"Successfully deleted embeddings for document {document_id}")
        
    except Exception as e:
        logger.error(f"Error deleting embeddings for document {document_id}: {e}")
