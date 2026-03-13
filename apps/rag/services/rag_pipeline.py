"""
RAG Pipeline Service - Orchestrates Retrieval and Generation.
"""
import json
import threading
import time
import uuid
from typing import Dict, Any, List, Generator

from django.conf import settings
from apps.core.models import User, AuditLog
from apps.documents.services.access import DocumentAccessService
from apps.rag.services.retriever import RAGRetriever
from apps.rag.services.llm_runner import LLMRunner
from apps.rag.models import ChatSession, ChatMessage
from apps.core.exceptions import LLMServiceError
import logging

logger = logging.getLogger(__name__)

# Keep only this many recent messages in the context window sent to the LLM.
# Unlimited history → O(N) DB + token cost per query for long sessions.
MAX_HISTORY_MESSAGES = 20


class RAGPipeline:
    """
    Complete RAG pipeline orchestrator.
    Ties together document retrieval and language model generation.
    """
    
    def __init__(self, llm_provider: str = None, llm_model: str = None):
        """Initialize the pipeline services."""
        self.retriever = RAGRetriever()
        # Passing None for provider/model allows LLMRunner to read from DB config
        self.llm_runner = LLMRunner(provider=llm_provider, model=llm_model)
        
    def execute_query(self, user: User, query_text: str, session_id: str = None) -> Dict[str, Any]:
        """
        Execute the full RAG pipeline for a user query.
        
        Args:
            user: Authenticated user object
            query_text: User's question
            session_id: Optional UUID of the chat session to keep context
            
        Returns:
            Dict containing the 'answer', 'sources', and 'metadata'
        """
        logger.info(f"Executing RAG pipeline for user {user.id}")
        _start = time.monotonic()
        
        # 0. Handle Chat Session
        session = self._get_or_create_session(user, session_id)
        
        ChatMessage.objects.create(session=session, role='user', content=query_text)

        # Limit history to the last MAX_HISTORY_MESSAGES to avoid O(N) token / DB cost.
        history = list(
            session.messages
            .order_by('-created_at')[:MAX_HISTORY_MESSAGES]
            .values('role', 'content')
        )
        history.reverse()  # chronological order for the LLM
        
        # 1. Resolve accessible documents for RBAC
        # Platform owners have no tenant - they use the system admin panel, not the RAG chat.
        if not user.tenant:
            answer = ('You are logged in as a Platform Owner. The AI Chat is intended for tenant users. '
                      'Please log in as a Tenant Admin or regular user to query documents.')
            ChatMessage.objects.create(session=session, role='assistant', content=answer)
            return {'answer': answer, 'sources': [], 'metadata': {'session_id': str(session.id)}}

        accessible_doc_ids = DocumentAccessService.get_accessible_document_ids(user)
        if not accessible_doc_ids:
            answer = 'You do not have access to any documents. Please contact your administrator.'
            ChatMessage.objects.create(session=session, role='assistant', content=answer)
            return {
                'answer': answer,
                'sources': [],
                'metadata': {'session_id': str(session.id)}
            }
            
        # 2. Retrieve relevant context chunks (with surrounding context)
        try:
            top_k = getattr(settings, 'RAG_TOP_K', 5)
            context_window = getattr(settings, 'RAG_CONTEXT_WINDOW', 1) # Support surrounding chunks
            
            # Fetch context chunks
            retrieved_chunks = self.retriever.retrieve_with_context(
                query=query_text,
                tenant_id=user.tenant.id,
                accessible_doc_ids=list(accessible_doc_ids),
                top_k=top_k,
                context_window=context_window
            )
        except Exception as e:
            logger.error(f"Error during retrieval phase: {e}")
            raise LLMServiceError("Failed to retrieve relevant context.")
            
        # 3. Generate response using LLM
        is_failed = False
        if not retrieved_chunks:
            answer = 'I could not find relevant information in your accessible documents to answer this question.'
            sources = []
            
            # Save assistant fallback message
            ChatMessage.objects.create(session=session, role='assistant', content=answer)
        else:
            try:
                answer = self.llm_runner.generate_response(
                    query=query_text,
                    context=retrieved_chunks,
                    chat_history=history
                )
            except Exception as e:
                logger.error(f"Error generating LLM response: {e}")
                is_failed = True
                raise LLMServiceError("Failed to generate answer from context.")
            
            # Format sources for frontend
            sources = self._format_sources_for_output(retrieved_chunks)
            
            # Save assistant message with sources
            ChatMessage.objects.create(
                session=session, 
                role='assistant', 
                content=answer,
                sources=sources
            )
            
        # 4. Log audit entry for compliance
        self._log_query_audit(user, query_text, len(sources))

        # 5. Record analytics metrics (non-blocking)
        _latency_ms = int((time.monotonic() - _start) * 1000)
        self._record_metrics(user, session, query_text, _latency_ms, retrieved_chunks, is_failed)
        
        return {
            'answer': answer,
            'sources': sources,
            'metadata': {
                'num_chunks': len(retrieved_chunks),
                'average_confidence': self._calculate_average_confidence(retrieved_chunks) if retrieved_chunks else 'low',
                'session_id': str(session.id)
            }
        }

    def execute_query_stream(self, user: User, query_text: str, session_id: str = None) -> Generator[str, None, None]:
        """
        Stream the full RAG pipeline for a user query.
        Yields Server-Sent Events (SSE) data chunks.
        """
        logger.info(f"Stream RAG pipeline for user {user.id}")
        
        # 0. Handle Chat Session
        session = self._get_or_create_session(user, session_id)
        
        ChatMessage.objects.create(session=session, role='user', content=query_text)
        # Limit history to the last MAX_HISTORY_MESSAGES to avoid O(N) token / DB cost.
        history = list(
            session.messages
            .order_by('-created_at')[:MAX_HISTORY_MESSAGES]
            .values('role', 'content')
        )
        history.reverse()  # chronological order for the LLM
        
        # 1. Resolve accessible documents
        # Platform owners have no tenant - they use the system admin panel, not the RAG chat.
        if not user.tenant:
            msg = ('You are logged in as a Platform Owner. The AI Chat is intended for tenant users. '
                   'Please log in as a Tenant Admin or regular user to query documents.')
            ChatMessage.objects.create(session=session, role='assistant', content=msg)
            yield f"data: {json.dumps({'chunk': msg, 'done': True})}\n\n"
            return

        accessible_doc_ids = DocumentAccessService.get_accessible_document_ids(user)
        if not accessible_doc_ids:
            answer = 'You do not have access to any documents. Please contact your administrator.'
            ChatMessage.objects.create(session=session, role='assistant', content=answer)
            yield f"data: {json.dumps({'answer': answer, 'sources': [], 'metadata': {'session_id': str(session.id)}, 'done': True})}\n\n"
            return
            
        # 2. Retrieve context
        try:
            top_k = getattr(settings, 'RAG_TOP_K', 5)
            context_window = getattr(settings, 'RAG_CONTEXT_WINDOW', 1)
            retrieved_chunks = self.retriever.retrieve_with_context(
                query=query_text,
                tenant_id=user.tenant.id,
                accessible_doc_ids=list(accessible_doc_ids),
                top_k=top_k,
                context_window=context_window
            )
        except Exception as e:
            logger.error(f"Error during retrieval stream phase: {e}")
            yield f"data: {json.dumps({'error': 'Failed to retrieve context.'})}\n\n"
            return

        sources = self._format_sources_for_output(retrieved_chunks) if retrieved_chunks else []
        metadata = {
            'num_chunks': len(retrieved_chunks) if retrieved_chunks else 0,
            'average_confidence': self._calculate_average_confidence(retrieved_chunks) if retrieved_chunks else 'low',
            'session_id': str(session.id)
        }
        
        # Yield initial metadata
        yield f"data: {json.dumps({'sources': sources, 'metadata': metadata, 'done': False})}\n\n"

        if not retrieved_chunks:
            answer = 'I could not find relevant information in your accessible documents to answer this question.'
            ChatMessage.objects.create(session=session, role='assistant', content=answer)
            yield f"data: {json.dumps({'chunk': answer})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            return

        # 3. Stream LLM Response
        full_answer = ""
        try:
            stream = self.llm_runner.generate_response_stream(
                query=query_text,
                context=retrieved_chunks,
                chat_history=history
            )
            for chunk in stream:
                full_answer += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            logger.error(f"Error streaming LLM response: {e}")
            yield f"data: {json.dumps({'error': 'Stream generation failed.'})}\n\n"
            return

        # Save assistant message with sources
        ChatMessage.objects.create(
            session=session, 
            role='assistant', 
            content=full_answer,
            sources=sources
        )
        self._log_query_audit(user, query_text, len(sources))
        
        # End of stream
        yield f"data: {json.dumps({'done': True})}\n\n"
        
    def _get_or_create_session(self, user: User, session_id: str = None) -> ChatSession:
        """Fetch existing session or create a new one."""
        if session_id:
            try:
                session = ChatSession.objects.get(
                    id=session_id, 
                    user=user, 
                    tenant=user.tenant
                )
                return session
            except ChatSession.DoesNotExist:
                logger.warning(f"Session {session_id} not found for user {user.id}. Creating new.")
                
        return ChatSession.objects.create(
            user=user,
            tenant=user.tenant,
            title="New Chat"
        )
        
    def _format_sources_for_output(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Deduplicate and format source citations across all retrieved chunks.
        """
        sources_map = {}
        for chunk in chunks:
            doc_id = chunk.get('document_id')
            if not doc_id:
                continue
                
            doc_id_str = str(doc_id)
            if doc_id_str not in sources_map:
                sources_map[doc_id_str] = {
                    'document_id': doc_id_str,
                    'title': chunk.get('document_title', 'Unknown'),
                    'file_type': chunk.get('file_type', 'unknown'),
                    'confidence': chunk.get('confidence', 'low'),
                    'relevance_score': chunk.get('score', 0)
                }
            else:
                # Update confidence to highest found for the document
                existing_score = sources_map[doc_id_str]['relevance_score']
                new_score = chunk.get('score', 0)
                if new_score > existing_score:
                    sources_map[doc_id_str]['relevance_score'] = new_score
                    sources_map[doc_id_str]['confidence'] = chunk.get('confidence', 'low')
                    
        # Return as list and format relevance scores to 2 decimal places
        formatted_sources = list(sources_map.values())
        for src in formatted_sources:
            src['relevance_score'] = round(src['relevance_score'], 2)
            
        return formatted_sources
        
    def _calculate_average_confidence(self, chunks: List[Dict[str, Any]]) -> str:
        """Calculate average confidence across retrieved chunks."""
        if not chunks:
            return 'low'

        confidence_map = {'high': 3, 'medium': 2, 'low': 1}
        total = sum(confidence_map.get(chunk.get('confidence', 'medium'), 2)
                    for chunk in chunks)
        avg = total / len(chunks)

        if avg >= 2.5:
            return 'high'
        elif avg >= 1.5:
            return 'medium'
        else:
            return 'low'
            
    def _log_query_audit(self, user: User, query: str, num_sources: int) -> None:
        """Fire-and-forget audit log write — never blocks the response path."""
        def _write():
            try:
                AuditLog.objects.create(
                    tenant=user.tenant,
                    user=user,
                    action='query',
                    resource_type='rag',
                    metadata={
                        'question': query[:500],
                        'num_sources': num_sources,
                    }
                )
            except Exception as exc:
                logger.warning("Failed to write RAG audit log: %s", exc)

        threading.Thread(target=_write, daemon=True).start()

    def _record_metrics(self, user: User, session, query_text: str, latency_ms: int, chunks: list, is_failed: bool) -> None:
        """Fire-and-forget analytics metric collection."""
        def _write():
            try:
                from apps.analytics.services.collector import record_query
                from apps.analytics.services.query_analytics import record_query_analytics
                from apps.core.models import AIProviderConfig

                config = AIProviderConfig.get_config()
                model_used = f"{config.llm_provider}/{config.llm_model}" if config else ''
                tokens_in  = 0
                tokens_out = 0

                record_query(
                    tenant_id=str(user.tenant.id),
                    user_id=str(user.id),
                    latency_ms=latency_ms,
                    tokens_in=tokens_in,
                    tokens_out=tokens_out,
                    failed=is_failed,
                )

                avg_rel = None
                if chunks:
                    scores = [c.get('score', 0) for c in chunks if isinstance(c, dict) and 'score' in c]
                    if scores:
                        avg_rel = sum(scores) / len(scores)

                record_query_analytics(
                    tenant=user.tenant,
                    user=user,
                    query_text=query_text,
                    session_id=session.id if session else None,
                    latency_ms=latency_ms,
                    chunks_retrieved=len(chunks),
                    avg_relevance=avg_rel,
                    model_used=model_used,
                    tokens_in=tokens_in,
                    tokens_out=tokens_out,
                    is_failed=is_failed,
                )
            except Exception as exc:
                logger.debug("_record_metrics failed (non-critical): %s", exc)

        threading.Thread(target=_write, daemon=True).start()
