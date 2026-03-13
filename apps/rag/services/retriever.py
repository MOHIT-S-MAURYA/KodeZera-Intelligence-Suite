"""
RAG Retriever - Handles document retrieval and context building based on queries.
"""
from typing import List, Dict, Any
import uuid
import re
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
        top_k: int = 5,
        chat_history: List[Dict[str, str]] | None = None,
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

        rewritten_query = self._rewrite_query(query, chat_history or [])

        # Generate query embedding
        try:
            query_embedding = self.embedding_service.generate_embedding(rewritten_query)
        except Exception as e:
            logger.error(f"Error generating query embedding in retriever: {e}")
            return []

        # Search vector store
        # Over-fetch candidates, then re-rank with lexical overlap for better precision.
        candidate_k = max(top_k * 3, top_k)
        results = self.vector_store.search_vectors(
            query_embedding=query_embedding,
            tenant_id=tenant_id,
            document_ids=accessible_doc_ids,
            top_k=candidate_k
        )

        # Hybrid fusion: semantic score + lexical overlap score.
        reranked = self._rerank_results(rewritten_query, results)

        # Enrich results with confidence and relevance
        enriched_results = []
        for result in reranked[:top_k]:
            score = result.get('combined_score', result.get('score', 0))
            result['confidence'] = self._calculate_confidence(score)
            result['query_used'] = rewritten_query
            result['rewritten_query'] = rewritten_query != query
            enriched_results.append(result)

        return enriched_results

    def retrieve_with_context(
        self, 
        query: str, 
        tenant_id: uuid.UUID, 
        accessible_doc_ids: List[uuid.UUID], 
        top_k: int = 5, 
        context_window: int = 1,
        chat_history: List[Dict[str, str]] | None = None,
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
        primary_results = self.retrieve(
            query,
            tenant_id,
            accessible_doc_ids,
            top_k,
            chat_history=chat_history,
        )

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

    def _rewrite_query(self, query: str, chat_history: List[Dict[str, str]]) -> str:
        """
        Lightweight follow-up rewrite using recent user context.

        If query looks referential (e.g., "what about this?") we prepend the
        most recent prior user message to increase retrieval specificity.
        """
        q = (query or '').strip()
        if not q or not chat_history:
            return q

        referential_terms = {
            'this', 'that', 'it', 'they', 'them', 'those', 'these',
            'above', 'previous', 'earlier', 'same',
        }
        tokens = {t.lower() for t in re.findall(r"[A-Za-z0-9']+", q)}
        is_short = len(tokens) <= 8
        is_referential = bool(tokens & referential_terms)
        if not (is_short or is_referential):
            return q

        prev_user_msgs = [m.get('content', '').strip() for m in chat_history if m.get('role') == 'user']
        if len(prev_user_msgs) < 2:
            return q

        previous = prev_user_msgs[-2]
        if not previous:
            return q
        return f"{previous} | follow-up: {q}"

    def _tokenize(self, text: str) -> set[str]:
        return {t.lower() for t in re.findall(r"[A-Za-z0-9']+", text or '') if len(t) > 2}

    def _rerank_results(self, query: str, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Re-rank vector hits by fusing semantic score with lexical overlap."""
        if not results:
            return []

        q_terms = self._tokenize(query)
        if not q_terms:
            return results

        reranked = []
        for r in results:
            semantic = float(r.get('score', 0.0))
            # Qdrant cosine score can be in [-1, 1] depending on config/client version.
            semantic_norm = max(min((semantic + 1.0) / 2.0, 1.0), 0.0)

            text = r.get('full_text') or r.get('text', '')
            t_terms = self._tokenize(text)
            overlap = (len(q_terms & t_terms) / len(q_terms)) if q_terms else 0.0

            combined = (0.8 * semantic_norm) + (0.2 * overlap)
            nr = dict(r)
            nr['semantic_score'] = round(semantic_norm, 4)
            nr['lexical_score'] = round(overlap, 4)
            nr['combined_score'] = round(combined, 4)
            reranked.append(nr)

        reranked.sort(key=lambda x: x.get('combined_score', 0.0), reverse=True)
        return reranked

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
