"""
RAG Pipeline Service - Orchestrates Retrieval and Generation.
"""
import json
import threading
import time
import uuid
from typing import Dict, Any, List, Generator, Optional
from django.core import signing
from django.core.cache import cache

from django.conf import settings
from apps.core.models import User, AuditLog
from apps.documents.services.access import DocumentAccessService
from apps.rag.services.retriever import RAGRetriever
from apps.rag.services.llm_runner import LLMRunner
from apps.rag.services.citation_verifier import CitationVerifier
from apps.rag.models import ChatSession, ChatMessage
from apps.core.exceptions import LLMServiceError
import logging

logger = logging.getLogger(__name__)

# Keep only this many recent messages in the context window sent to the LLM.
# Unlimited history → O(N) DB + token cost per query for long sessions.
MAX_HISTORY_MESSAGES = 20
PENDING_ACTION_CACHE_PREFIX = 'rag:pending_action:'
ACTION_TOKEN_SALT = 'rag_action_approval'


class RAGPipeline:
    """
    Complete RAG pipeline orchestrator.
    Ties together document retrieval and language model generation.
    """

    def __init__(self, llm_provider: str = None, llm_model: str = None):
        """Initialize the pipeline services."""
        self.retriever = RAGRetriever()
        self.citation_verifier = CitationVerifier()
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

        ChatMessage.objects.create(
            session=session, role='user', content=query_text)

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
            ChatMessage.objects.create(
                session=session, role='assistant', content=answer)
            return {'answer': answer, 'sources': [], 'metadata': {'session_id': str(session.id)}}

        accessible_doc_ids = DocumentAccessService.get_accessible_document_ids(
            user)
        if not accessible_doc_ids:
            answer = 'You do not have access to any documents. Please contact your administrator.'
            ChatMessage.objects.create(
                session=session, role='assistant', content=answer)
            latency_ms = int((time.monotonic() - _start) * 1000)
            self._record_query_metering(user, is_failed=False)
            self._record_metrics(user, session, query_text,
                                 answer, latency_ms, [], is_failed=False)
            return {
                'answer': answer,
                'sources': [],
                'metadata': {'session_id': str(session.id)}
            }

        # 2. Retrieve relevant context chunks (with surrounding context)
        try:
            top_k = getattr(settings, 'RAG_TOP_K', 5)
            # Support surrounding chunks
            context_window = getattr(settings, 'RAG_CONTEXT_WINDOW', 1)

            # Fetch context chunks
            retrieved_chunks = self.retriever.retrieve_with_context(
                query=query_text,
                tenant_id=user.tenant.id,
                accessible_doc_ids=list(accessible_doc_ids),
                top_k=top_k,
                context_window=context_window,
                chat_history=history,
            )
        except Exception as e:
            logger.error(f"Error during retrieval phase: {e}")
            latency_ms = int((time.monotonic() - _start) * 1000)
            self._record_query_metering(user, is_failed=True)
            self._record_metrics(user, session, query_text,
                                 '', latency_ms, [], is_failed=True)
            raise LLMServiceError("Failed to retrieve relevant context.")

        # 3. Generate response using LLM
        is_failed = False
        if not retrieved_chunks:
            answer = 'I could not find relevant information in your accessible documents to answer this question.'
            sources = []

            # Save assistant fallback message
            ChatMessage.objects.create(
                session=session, role='assistant', content=answer)
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
                latency_ms = int((time.monotonic() - _start) * 1000)
                self._record_query_metering(user, is_failed=True)
                self._record_metrics(
                    user, session, query_text, '', latency_ms, retrieved_chunks, is_failed=True)
                raise LLMServiceError(
                    "Failed to generate answer from context.")

            # Format sources for frontend
            sources = self._format_sources_for_output(retrieved_chunks)

            # Save assistant message with sources
            ChatMessage.objects.create(
                session=session,
                role='assistant',
                content=answer,
                sources=sources
            )

        citation_verification = self.citation_verifier.verify(
            answer=answer,
            sources=sources,
            retrieved_chunks=retrieved_chunks,
        )

        # 4. Log audit entry for compliance
        self._log_query_audit(user, query_text, len(sources))

        # 5. Record analytics metrics (non-blocking)
        _latency_ms = int((time.monotonic() - _start) * 1000)
        self._record_query_metering(user, is_failed=is_failed)
        self._record_metrics(user, session, query_text,
                             answer, _latency_ms, retrieved_chunks, is_failed)

        return {
            'answer': answer,
            'sources': sources,
            'metadata': {
                'num_chunks': len(retrieved_chunks),
                'average_confidence': self._calculate_average_confidence(retrieved_chunks) if retrieved_chunks else 'low',
                'session_id': str(session.id),
                'query_used': (retrieved_chunks[0].get('query_used') if retrieved_chunks else query_text),
                'rewritten_query': bool(retrieved_chunks and retrieved_chunks[0].get('rewritten_query')),
                'citation_verification': citation_verification,
            }
        }

    def _stream_event(self, event: str, data: Optional[Dict[str, Any]] = None) -> str:
        """Serialize a canonical SSE event payload for the chat stream."""
        payload = {
            'event': event,
            'data': data or {},
        }
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def _action_token_ttl_seconds(self) -> int:
        """Return the approval-token validity duration."""
        return int(getattr(settings, 'RAG_ACTION_TOKEN_TTL_SECONDS', 900))

    def _pending_action_cache_key(self, action_id: str) -> str:
        return f"{PENDING_ACTION_CACHE_PREFIX}{action_id}"

    def _infer_action_type(self, summary: str) -> str:
        summary_l = (summary or '').lower()
        if any(k in summary_l for k in ['delete', 'remove', 'revoke']):
            return 'delete'
        if any(k in summary_l for k in ['grant', 'assign', 'allow']):
            return 'grant'
        if any(k in summary_l for k in ['update', 'change', 'rename', 'edit']):
            return 'update'
        if any(k in summary_l for k in ['create', 'add']):
            return 'create'
        return 'custom'

    def _detect_action_request(self, query_text: str) -> Optional[Dict[str, str]]:
        """
        Detect explicit HITL action intents from user prompts.

        We intentionally use explicit prefixes to avoid accidental blocking of
        regular Q&A prompts that merely contain action verbs.
        """
        prompt = (query_text or '').strip()
        lower = prompt.lower()

        prefixes = ['action:', '/action', 'execute:']
        matched = next((p for p in prefixes if lower.startswith(p)), None)
        if not matched:
            return None

        summary = prompt[len(matched):].strip()
        if not summary:
            summary = 'Requested operation requires human approval.'

        return {
            'action_type': self._infer_action_type(summary),
            'summary': summary,
        }

    def _create_pending_action(
        self,
        *,
        user: User,
        session: ChatSession,
        query_text: str,
        action_type: str,
        summary: str,
        sources: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Create a pending HITL action and issue a signed approval token."""
        action_id = str(uuid.uuid4())
        ttl_seconds = self._action_token_ttl_seconds()

        payload = {
            'action_id': action_id,
            'user_id': str(user.id),
            'tenant_id': str(getattr(user, 'tenant_id', '') or ''),
            'session_id': str(session.id),
            'query_text': query_text,
            'action_type': action_type,
            'summary': summary,
            'sources': sources or [],
            'status': 'pending',
            'created_at': int(time.time()),
        }

        cache.set(self._pending_action_cache_key(
            action_id), payload, timeout=ttl_seconds)

        token = signing.dumps(
            {
                'action_id': action_id,
                'user_id': str(user.id),
                'tenant_id': str(getattr(user, 'tenant_id', '') or ''),
                'session_id': str(session.id),
            },
            salt=ACTION_TOKEN_SALT,
        )

        return {
            'action_id': action_id,
            'approval_token': token,
            'expires_in_seconds': ttl_seconds,
            'summary': summary,
            'action_type': action_type,
        }

    def _validate_action_token(
        self,
        *,
        user: User,
        action_id: str,
        approval_token: str,
        session_id: Optional[str] = None,
    ) -> Dict[str, str]:
        """Validate approval token authenticity and ownership binding."""
        max_age = self._action_token_ttl_seconds()
        token_payload = signing.loads(
            approval_token, salt=ACTION_TOKEN_SALT, max_age=max_age)

        token_action_id = str(token_payload.get('action_id', ''))
        token_user_id = str(token_payload.get('user_id', ''))
        token_tenant_id = str(token_payload.get('tenant_id', ''))
        token_session_id = str(token_payload.get('session_id', ''))

        if token_action_id != str(action_id):
            raise ValueError('Approval token does not match action id.')
        if token_user_id != str(user.id):
            raise ValueError('Approval token does not belong to this user.')
        if token_tenant_id != str(getattr(user, 'tenant_id', '') or ''):
            raise ValueError('Approval token tenant mismatch.')
        if session_id and token_session_id != str(session_id):
            raise ValueError('Approval token session mismatch.')

        return {
            'action_id': token_action_id,
            'user_id': token_user_id,
            'tenant_id': token_tenant_id,
            'session_id': token_session_id,
        }

    def _log_action_audit(
        self,
        *,
        user: User,
        action_id: str,
        decision: str,
        reason: str,
        session_id: str,
    ) -> None:
        """Persist audit trail for HITL decisions."""

        def _write():
            try:
                AuditLog.objects.create(
                    tenant=user.tenant,
                    user=user,
                    action='update',
                    resource_type='rag_action',
                    metadata={
                        'action_id': action_id,
                        'decision': decision,
                        'reason': reason,
                        'session_id': session_id,
                    },
                )
            except Exception as exc:
                logger.warning("Failed to write RAG action audit log: %s", exc)

        threading.Thread(target=_write, daemon=True).start()

    def handle_action_decision(
        self,
        *,
        user: User,
        action_id: str,
        decision: str,
        approval_token: str,
        reason: str = '',
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Validate and resolve a pending HITL action decision."""
        if decision not in {'approve', 'reject'}:
            raise ValueError('Decision must be approve or reject.')

        token_payload = self._validate_action_token(
            user=user,
            action_id=action_id,
            approval_token=approval_token,
            session_id=session_id,
        )

        cache_key = self._pending_action_cache_key(action_id)
        pending = cache.get(cache_key)
        if not pending:
            raise ValueError('Action request is expired or not found.')

        if str(pending.get('status')) != 'pending':
            raise ValueError('Action request has already been resolved.')

        if str(pending.get('user_id', '')) != str(user.id):
            raise ValueError('Action request does not belong to this user.')

        effective_session_id = str(session_id or token_payload['session_id'])
        if str(pending.get('session_id', '')) != effective_session_id:
            raise ValueError('Action request session does not match.')

        session = ChatSession.objects.filter(
            id=effective_session_id,
            user=user,
            tenant=user.tenant,
        ).first()
        if not session:
            raise ValueError('Associated chat session does not exist.')

        summary = str(pending.get('summary', 'Requested operation'))
        safe_reason = (reason or '').strip()
        reason_suffix = f" Reason: {safe_reason}." if safe_reason else ''
        if decision == 'approve':
            assistant_content = f"Action approved: {summary}. Execution has been accepted.{reason_suffix}"
            outcome = 'approved'
        else:
            assistant_content = f"Action rejected: {summary}.{reason_suffix}"
            outcome = 'rejected'

        ChatMessage.objects.create(
            session=session,
            role='assistant',
            content=assistant_content,
            sources=pending.get('sources') or [],
        )

        pending['status'] = 'resolved'
        pending['decision'] = decision
        pending['decision_reason'] = safe_reason
        pending['resolved_at'] = int(time.time())
        cache.set(cache_key, pending, timeout=self._action_token_ttl_seconds())

        self._log_action_audit(
            user=user,
            action_id=action_id,
            decision=decision,
            reason=safe_reason,
            session_id=effective_session_id,
        )

        return {
            'status': 'resumed',
            'action_id': action_id,
            'decision': decision,
            'outcome': outcome,
            'session_id': effective_session_id,
            'assistant_message': assistant_content,
            'resolved': True,
        }

    def execute_query_stream(self, user: User, query_text: str, session_id: str = None) -> Generator[str, None, None]:
        """
        Stream the full RAG pipeline for a user query.
        Yields Server-Sent Events (SSE) data chunks.
        """
        logger.info(f"Stream RAG pipeline for user {user.id}")
        _start = time.monotonic()
        request_id = str(uuid.uuid4())

        # 0. Handle Chat Session
        session = self._get_or_create_session(user, session_id)

        # Canonical stream opening event (always first).
        yield self._stream_event('start', {
            'request_id': request_id,
            'session_id': str(session.id),
        })

        ChatMessage.objects.create(
            session=session, role='user', content=query_text)
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
            ChatMessage.objects.create(
                session=session, role='assistant', content=msg)
            yield self._stream_event('metadata', {
                'sources': [],
                'metadata': {
                    'num_chunks': 0,
                    'average_confidence': 'low',
                    'session_id': str(session.id),
                    'query_used': query_text,
                    'rewritten_query': False,
                },
            })
            yield self._stream_event('chunk', {'chunk': msg})
            yield self._stream_event('done', {
                'status': 'completed',
                'metadata': {'session_id': str(session.id)},
            })
            return

        accessible_doc_ids = DocumentAccessService.get_accessible_document_ids(
            user)
        if not accessible_doc_ids:
            answer = 'You do not have access to any documents. Please contact your administrator.'
            ChatMessage.objects.create(
                session=session, role='assistant', content=answer)
            latency_ms = int((time.monotonic() - _start) * 1000)
            self._record_query_metering(user, is_failed=False)
            self._record_metrics(user, session, query_text,
                                 answer, latency_ms, [], is_failed=False)
            metadata = {
                'num_chunks': 0,
                'average_confidence': 'low',
                'session_id': str(session.id),
                'query_used': query_text,
                'rewritten_query': False,
            }
            yield self._stream_event('metadata', {
                'sources': [],
                'metadata': metadata,
            })
            yield self._stream_event('chunk', {'chunk': answer})
            yield self._stream_event('done', {
                'status': 'completed',
                'metadata': metadata,
            })
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
                context_window=context_window,
                chat_history=history,
            )
        except Exception as e:
            logger.error(f"Error during retrieval stream phase: {e}")
            latency_ms = int((time.monotonic() - _start) * 1000)
            self._record_query_metering(user, is_failed=True)
            self._record_metrics(user, session, query_text,
                                 '', latency_ms, [], is_failed=True)
            yield self._stream_event('error', {
                'code': 'retrieval_error',
                'message': 'Failed to retrieve context.',
            })
            yield self._stream_event('done', {
                'status': 'failed',
                'reason': 'retrieval_error',
                'metadata': {'session_id': str(session.id)},
            })
            return

        sources = self._format_sources_for_output(
            retrieved_chunks) if retrieved_chunks else []
        metadata = {
            'num_chunks': len(retrieved_chunks) if retrieved_chunks else 0,
            'average_confidence': self._calculate_average_confidence(retrieved_chunks) if retrieved_chunks else 'low',
            'session_id': str(session.id),
            'query_used': (retrieved_chunks[0].get('query_used') if retrieved_chunks else query_text),
            'rewritten_query': bool(retrieved_chunks and retrieved_chunks[0].get('rewritten_query')),
        }

        # Emit metadata once retrieval finishes.
        yield self._stream_event('metadata', {
            'sources': sources,
            'metadata': metadata,
        })

        # Pause stream for explicit action requests until user approves/rejects.
        action_request = self._detect_action_request(query_text)
        if action_request:
            pending_action = self._create_pending_action(
                user=user,
                session=session,
                query_text=query_text,
                action_type=action_request['action_type'],
                summary=action_request['summary'],
                sources=sources,
            )
            hold_message = (
                f"Action request detected: {pending_action['summary']}. "
                "Please approve or reject to continue."
            )
            ChatMessage.objects.create(
                session=session,
                role='assistant',
                content=hold_message,
                sources=sources,
            )

            self._log_query_audit(user, query_text, len(sources))
            latency_ms = int((time.monotonic() - _start) * 1000)
            self._record_query_metering(user, is_failed=False)
            self._record_metrics(user, session, query_text, hold_message,
                                 latency_ms, retrieved_chunks, is_failed=False)

            yield self._stream_event('action_required', {
                'action_id': pending_action['action_id'],
                'action_type': pending_action['action_type'],
                'summary': pending_action['summary'],
                'approval_token': pending_action['approval_token'],
                'expires_in_seconds': pending_action['expires_in_seconds'],
                'payload': {
                    'session_id': str(session.id),
                },
            })
            yield self._stream_event('chunk', {
                'chunk': hold_message,
            })
            yield self._stream_event('done', {
                'status': 'awaiting_action',
                'reason': 'awaiting_action',
                'metadata': {
                    **metadata,
                    'action_id': pending_action['action_id'],
                    'action_type': pending_action['action_type'],
                },
            })
            return

        if not retrieved_chunks:
            answer = 'I could not find relevant information in your accessible documents to answer this question.'
            ChatMessage.objects.create(
                session=session, role='assistant', content=answer)
            yield self._stream_event('chunk', {'chunk': answer})
            latency_ms = int((time.monotonic() - _start) * 1000)
            self._record_query_metering(user, is_failed=False)
            self._record_metrics(user, session, query_text,
                                 answer, latency_ms, [], is_failed=False)
            yield self._stream_event('done', {
                'status': 'completed',
                'metadata': metadata,
            })
            return

        # 3. Stream LLM Response
        full_answer = ""
        emitted_chunks = 0
        try:
            stream = self.llm_runner.generate_response_stream(
                query=query_text,
                context=retrieved_chunks,
                chat_history=history
            )
            for chunk in stream:
                emitted_chunks += 1
                if emitted_chunks % 25 == 0:
                    yield self._stream_event('heartbeat', {
                        'ts': str(int(time.time() * 1000)),
                    })
                full_answer += chunk
                yield self._stream_event('chunk', {'chunk': chunk})
        except Exception as e:
            logger.error(f"Error streaming LLM response: {e}")
            latency_ms = int((time.monotonic() - _start) * 1000)
            self._record_query_metering(user, is_failed=True)
            self._record_metrics(user, session, query_text, full_answer,
                                 latency_ms, retrieved_chunks, is_failed=True)
            yield self._stream_event('error', {
                'code': 'stream_generation_failed',
                'message': 'Stream generation failed.',
            })
            yield self._stream_event('done', {
                'status': 'failed',
                'reason': 'stream_generation_failed',
                'metadata': metadata,
            })
            return

        # Save assistant message with sources
        ChatMessage.objects.create(
            session=session,
            role='assistant',
            content=full_answer,
            sources=sources
        )

        # Stream path computes citation checks at the end because answer text
        # is only complete after token aggregation.
        metadata['citation_verification'] = self.citation_verifier.verify(
            answer=full_answer,
            sources=sources,
            retrieved_chunks=retrieved_chunks,
        )
        self._log_query_audit(user, query_text, len(sources))
        latency_ms = int((time.monotonic() - _start) * 1000)
        self._record_query_metering(user, is_failed=False)
        self._record_metrics(user, session, query_text, full_answer,
                             latency_ms, retrieved_chunks, is_failed=False)

        # End of stream (always emitted on successful completion).
        yield self._stream_event('done', {
            'status': 'completed',
            'metadata': metadata,
        })

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
                logger.warning(
                    f"Session {session_id} not found for user {user.id}. Creating new.")

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
                    sources_map[doc_id_str]['confidence'] = chunk.get(
                        'confidence', 'low')

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

    def _record_metrics(
        self,
        user: User,
        session,
        query_text: str,
        answer_text: str,
        latency_ms: int,
        chunks: list,
        is_failed: bool,
    ) -> None:
        """Fire-and-forget analytics metric collection."""
        def _write():
            try:
                from apps.analytics.services.collector import record_query
                from apps.analytics.services.query_analytics import record_query_analytics
                from apps.core.models import AIProviderConfig

                config = AIProviderConfig.get_config()
                model_used = f"{config.llm_provider}/{config.llm_model}" if config else ''
                tokens_in = self._estimate_tokens(query_text)
                tokens_out = self._estimate_tokens(answer_text)

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
                    scores = [c.get('score', 0) for c in chunks if isinstance(
                        c, dict) and 'score' in c]
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

    def _record_query_metering(self, user: User, is_failed: bool) -> None:
        """Update per-tenant quota counters for each query request."""
        tenant_id = getattr(user, 'tenant_id', None)
        if not tenant_id:
            return

        try:
            from apps.core.services.metering import MeteringService
            MeteringService.record_query(str(tenant_id))
            if is_failed:
                MeteringService.record_failed_query(str(tenant_id))
        except Exception as exc:
            logger.debug(
                "_record_query_metering failed (non-critical): %s", exc)

    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count for analytics when providers don't return usage."""
        if not text:
            return 0
        words = len(text.split())
        return max(1, int(words * 1.3))
