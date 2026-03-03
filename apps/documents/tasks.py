"""
Celery tasks for document processing.
"""
from celery import shared_task
from django.conf import settings
from apps.documents.models import Document
from apps.rag.models import VectorChunk
from apps.rag.services.document_processing import DocumentProcessingService
from apps.rag.services.embeddings import EmbeddingService
from apps.rag.services.vector_store import VectorStoreService
from apps.core.exceptions import DocumentProcessingError
import logging

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def process_document_task(self, document_id: str):
    """
    Async task to process a document.
    
    Steps:
    1. Extract text
    2. Chunk text
    3. Generate embeddings
    4. Store in Qdrant
    5. Update document status
    
    Args:
        document_id: UUID of document as string
    """
    try:
        # Get document
        document = Document.objects.get(id=document_id)
        document.status = 'processing'
        document.save()
        
        logger.info(f"Processing document {document_id}")
        
        # Initialize services
        doc_processor = DocumentProcessingService()
        embedding_service = EmbeddingService()
        vector_store = VectorStoreService()
        
        # Step 1-2: Extract and chunk text
        chunks = doc_processor.process_document(document.file_path)
        
        if not chunks:
            raise DocumentProcessingError("No text extracted from document")
        
        # Step 3: Generate embeddings
        texts = [chunk['text'] for chunk in chunks]
        embeddings = embedding_service.generate_embeddings_batch(texts)
        
        # Combine chunks with embeddings
        for i, chunk in enumerate(chunks):
            chunk['embedding'] = embeddings[i]
        
        # Step 4: Store in Qdrant
        # First, clean up any old vectors for this document (safe re-processing)
        try:
            from apps.rag.models import VectorChunk
            VectorChunk.objects.filter(document=document).delete()
            vector_store.delete_document_vectors(document.id)
        except Exception as clean_err:
            logger.warning(f"Could not clean up old vectors for {document_id}: {clean_err}")

        vector_ids = vector_store.store_embeddings(
            document_id=document.id,
            tenant_id=document.tenant.id,
            department_id=document.department.id if document.department else None,
            classification_level=document.classification_level,
            chunks=chunks
        )
        
        # Create VectorChunk records for tracking
        vector_chunks = []
        for i, (chunk, vector_id) in enumerate(zip(chunks, vector_ids)):
            vector_chunks.append(
                VectorChunk(
                    document=document,
                    chunk_index=i,
                    vector_id=vector_id,
                    text_preview=chunk['text'][:500],
                    token_count=chunk['token_count']
                )
            )
        
        VectorChunk.objects.bulk_create(vector_chunks)
        
        # Step 5: Update document status
        document.status = 'completed'
        document.chunk_count = len(chunks)
        document.processing_error = ''
        document.save()
        
        logger.info(f"Successfully processed document {document_id} with {len(chunks)} chunks")
        
    except Exception as e:
        logger.error(f"Error processing document {document_id}: {e}")
        
        # Update document status to failed
        try:
            document = Document.objects.get(id=document_id)
            document.status = 'failed'
            document.processing_error = str(e)[:500]
            document.save()
        except Exception:
            pass
        
        # Retry task
        raise self.retry(exc=e, countdown=60 * (self.request.retries + 1))


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
