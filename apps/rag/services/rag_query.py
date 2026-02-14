"""
RAG query service - complete pipeline.
"""
from typing import Dict, List
import openai
from django.conf import settings
from apps.core.models import User, AuditLog
from apps.documents.models import Document
from apps.documents.services.access import DocumentAccessService
from apps.rag.services.embeddings import EmbeddingService
from apps.rag.services.vector_store import VectorStoreService
from apps.core.exceptions import LLMServiceError
import logging

logger = logging.getLogger(__name__)

# Configure OpenAI
openai.api_key = settings.OPENAI_API_KEY


class RAGQueryService:
    """Complete RAG pipeline service."""
    
    def __init__(self):
        """Initialize services."""
        self.embedding_service = EmbeddingService()
        self.vector_store = VectorStoreService()
    
    def query(self, user: User, question: str) -> Dict:
        """
        Complete RAG query pipeline.
        
        Steps:
        1. Authenticate user (already done by DRF)
        2. Verify tenant active (done by middleware)
        3. Resolve accessible documents
        4. Generate query embedding
        5. Search vectors with filters
        6. Build context from chunks
        7. Query LLM
        8. Format response with sources
        9. Log audit entry
        
        Args:
            user: Authenticated user
            question: User's question
            
        Returns:
            Dict with 'answer' and 'sources'
        """
        # Step 3: Resolve accessible documents
        accessible_doc_ids = DocumentAccessService.get_accessible_document_ids(user)
        
        if not accessible_doc_ids:
            return {
                'answer': 'You do not have access to any documents. Please contact your administrator.',
                'sources': []
            }
        
        # Step 4: Generate query embedding
        try:
            query_embedding = self.embedding_service.generate_embedding(question)
        except Exception as e:
            logger.error(f"Error generating query embedding: {e}")
            raise LLMServiceError("Failed to process query")
        
        # Step 5: Search vectors with mandatory filters
        search_results = self.vector_store.search_vectors(
            query_embedding=query_embedding,
            tenant_id=user.tenant.id,
            document_ids=list(accessible_doc_ids),
            top_k=settings.RAG_TOP_K
        )
        
        if not search_results:
            return {
                'answer': 'I could not find relevant information in your accessible documents to answer this question.',
                'sources': []
            }
        
        # Step 6: Build context from chunks
        context_chunks = [result['text'] for result in search_results]
        context = '\n\n'.join(context_chunks)
        
        # Limit context size
        context = self._limit_context(context, settings.RAG_CONTEXT_MAX_TOKENS)
        
        # Step 7: Query LLM
        try:
            answer = self._query_llm(question, context)
        except Exception as e:
            logger.error(f"Error querying LLM: {e}")
            raise LLMServiceError("Failed to generate answer")
        
        # Step 8: Format response with sources
        sources = self._format_sources(search_results)
        
        # Step 9: Log audit entry
        try:
            AuditLog.objects.create(
                tenant=user.tenant,
                user=user,
                action='query',
                resource_type='rag',
                metadata={
                    'question': question[:500],
                    'num_sources': len(sources),
                }
            )
        except Exception:
            # Don't fail query if audit logging fails
            pass
        
        return {
            'answer': answer,
            'sources': sources
        }
    
    def _query_llm(self, question: str, context: str) -> str:
        """
        Query LLM with context.
        
        Args:
            question: User's question
            context: Retrieved context
            
        Returns:
            Generated answer
        """
        system_prompt = """You are a helpful AI assistant for the Kodezera Intelligence Suite.
Answer questions based ONLY on the provided context from the user's accessible documents.
If the context doesn't contain enough information to answer the question, say so clearly.
Be concise and accurate. Cite specific information from the context when possible."""
        
        user_prompt = f"""Context from documents:
{context}

Question: {question}

Answer:"""
        
        response = openai.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            max_tokens=500
        )
        
        return response.choices[0].message.content
    
    def _limit_context(self, context: str, max_tokens: int) -> str:
        """Limit context to max tokens."""
        import tiktoken
        tokenizer = tiktoken.get_encoding("cl100k_base")
        tokens = tokenizer.encode(context)
        
        if len(tokens) <= max_tokens:
            return context
        
        # Truncate to max tokens
        truncated_tokens = tokens[:max_tokens]
        return tokenizer.decode(truncated_tokens)
    
    def _format_sources(self, search_results: List[Dict]) -> List[Dict]:
        """
        Format source documents from search results.
        
        Args:
            search_results: List of search results
            
        Returns:
            List of source documents with metadata
        """
        # Get unique document IDs
        doc_ids = list(set([result['document_id'] for result in search_results]))
        
        # Fetch document metadata
        documents = Document.objects.filter(id__in=doc_ids).values(
            'id', 'title', 'file_type', 'created_at'
        )
        
        doc_map = {str(doc['id']): doc for doc in documents}
        
        sources = []
        for doc_id in doc_ids:
            if doc_id in doc_map:
                doc = doc_map[doc_id]
                sources.append({
                    'document_id': doc_id,
                    'title': doc['title'],
                    'file_type': doc['file_type'],
                })
        
        return sources
