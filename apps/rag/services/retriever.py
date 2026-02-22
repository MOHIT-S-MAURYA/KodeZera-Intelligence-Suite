"""
RAG Retriever - Handles document retrieval and context building based on queries.
"""
from typing import List, Dict, Any
import uuid
from apps.rag.services.embeddings import EmbeddingService
from apps.rag.services.vector_store import VectorStoreService
from apps.documents.models import Document
import logging

logger = logging.getLogger(__name__)


class RAGRetriever:
    """
    Retriever for RAG system.
    Handles query embedding, retrieval of relevant chunks, and context expansion.
    """

    def __init__(self):
        self.vector_store = VectorStoreService()
        self.embedding_service = EmbeddingService()

    def retrieve(
        self, 
        query: str, 
        tenant_id: uuid.UUID, 
        accessible_doc_ids: List[uuid.UUID], 
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Retrieve relevant document chunks for a query.

        Args:
            query: User's query string
            tenant_id: UUID of the tenant
            accessible_doc_ids: List of document UUIDs the user can access
            top_k: Number of chunks to retrieve

        Returns:
            list of dicts with chunk information and relevance scores
        """
        if not accessible_doc_ids:
            return []

        # Generate query embedding
        try:
            query_embedding = self.embedding_service.generate_embedding(query)
        except Exception as e:
            logger.error(f"Error generating query embedding in retriever: {e}")
            return []

        # Search vector store
        results = self.vector_store.search_vectors(
            query_embedding=query_embedding,
            tenant_id=tenant_id,
            document_ids=accessible_doc_ids,
            top_k=top_k
        )

        # Enrich results with confidence and relevance
        enriched_results = []
        for result in results:
            score = result.get('score', 0)
            result['confidence'] = self._calculate_confidence(score)
            enriched_results.append(result)

        return enriched_results

    def retrieve_with_context(
        self, 
        query: str, 
        tenant_id: uuid.UUID, 
        accessible_doc_ids: List[uuid.UUID], 
        top_k: int = 5, 
        context_window: int = 1
    ) -> List[Dict[str, Any]]:
        """
        Retrieve chunks and expand them with their surrounding contextual chunks.

        Args:
            query: User's query string
            tenant_id: UUID of the tenant
            accessible_doc_ids: List of manageable document UUIDs
            top_k: Number of primary chunks to retrieve
            context_window: Number of chunks before and after to include

        Returns:
            list of dicts with chunk information and expanded full_text
        """
        primary_results = self.retrieve(query, tenant_id, accessible_doc_ids, top_k)

        if not primary_results:
            return []

        enriched_with_context = []
        for result in primary_results:
            doc_id_str = result.get('document_id')
            chunk_idx = result.get('chunk_index')
            
            if doc_id_str is None or chunk_idx is None:
                result['full_text'] = result.get('text', '')
                enriched_with_context.append(result)
                continue

            # Calculate indices for surrounding chunks
            indices_to_fetch = []
            for i in range(chunk_idx - context_window, chunk_idx + context_window + 1):
                if i != chunk_idx and i >= 0:
                    indices_to_fetch.append(i)

            # Fetch surrounding chunks
            surrounding_chunks = self.vector_store.get_chunks_by_index(
                document_id=doc_id_str,
                chunk_indices=indices_to_fetch
            )
            
            # Map fetched chunks by their index
            chunk_map = {c['chunk_index']: c['text'] for c in surrounding_chunks}
            chunk_map[chunk_idx] = result.get('text', '')

            # Reconstruct the contiguous text
            full_text_parts = []
            for i in range(chunk_idx - context_window, chunk_idx + context_window + 1):
                part = chunk_map.get(i)
                if part:
                    full_text_parts.append(part)

            result['full_text'] = ' '.join(full_text_parts)
            enriched_with_context.append(result)

        # Attach document metadata (title) natively before returning
        return self._attach_document_metadata(enriched_with_context)

    def _calculate_confidence(self, score: float) -> str:
        """
        Calculate confidence level based on cosine similarity score from Qdrant.
        Qdrant Cosine similarity ranges from -1 to 1. Closer to 1 is better.
        """
        if score > 0.85:
            return 'high'
        elif score > 0.75:
            return 'medium'
        else:
            return 'low'

    def _attach_document_metadata(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Fetch Document objects to append titles and file types to the chunks.
        """
        doc_ids = list(set([str(c['document_id']) for c in chunks if c.get('document_id')]))
        if not doc_ids:
            return chunks

        documents = Document.objects.filter(id__in=doc_ids).values('id', 'title', 'file_type')
        doc_map = {str(doc['id']): doc for doc in documents}

        for chunk in chunks:
            doc_id = str(chunk.get('document_id'))
            if doc_id in doc_map:
                doc = doc_map[doc_id]
                chunk['document_title'] = doc['title']
                chunk['file_type'] = doc['file_type']
            else:
                chunk['document_title'] = "Unknown Document"
                
        return chunks
