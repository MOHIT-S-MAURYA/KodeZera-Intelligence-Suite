import json
import uuid
from unittest.mock import patch

from django.core import signing
from django.core.cache import cache
from django.test import SimpleTestCase, TestCase

from apps.core.models import Tenant, User
from apps.documents.services.access import DocumentAccessService
from apps.rag.models import ChatSession
from apps.rag.services.citation_verifier import CitationVerifier
from apps.rag.services.rag_pipeline import RAGPipeline
from apps.rag.services.retriever import RAGRetriever


class CitationVerifierTests(SimpleTestCase):
    def setUp(self):
        self.verifier = CitationVerifier()

    def test_verify_passes_with_valid_citations_and_grounding(self):
        answer = "The policy requires MFA for admins [1]."
        sources = [{"document_id": "doc-1", "title": "Security Policy"}]
        chunks = [
            {"text": "Security policy states admins must use MFA for access."}]

        result = self.verifier.verify(
            answer=answer, sources=sources, retrieved_chunks=chunks)

        self.assertTrue(result["has_citations"])
        self.assertEqual(result["invalid_citation_indices"], [])
        self.assertTrue(result["passed"])

    def test_verify_fails_on_out_of_range_citation(self):
        answer = "See the handbook guidance [3]."
        sources = [{"document_id": "doc-1", "title": "Handbook"}]
        chunks = [{"text": "The employee handbook covers leave guidance."}]

        result = self.verifier.verify(
            answer=answer, sources=sources, retrieved_chunks=chunks)

        self.assertEqual(result["invalid_citation_indices"], [3])
        self.assertFalse(result["passed"])


class RetrieverRerankTests(SimpleTestCase):
    def test_rerank_promotes_lexically_relevant_chunk(self):
        # We bypass __init__ to unit test pure ranking logic without services.
        retriever = RAGRetriever.__new__(RAGRetriever)

        query = "mfa policy requirements"
        results = [
            {"document_id": "doc-a", "score": 0.91,
                "text": "quarterly finance report"},
            {"document_id": "doc-b", "score": 0.80,
                "text": "MFA policy requirements for administrators"},
        ]

        reranked = retriever._rerank_results(query, results)
        self.assertEqual(reranked[0]["document_id"], "doc-b")


class HitlActionFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.tenant = Tenant.objects.create(
            name='Acme Test Tenant', slug='acme-test-tenant')
        self.user = User.objects.create_user(
            email='hitl@example.com',
            username='hitl_user',
            password='StrongPass123!',
            tenant=self.tenant,
        )
        self.pipeline = RAGPipeline()
        # Avoid external retrieval dependencies; test stream/action contract only.
        self.pipeline.retriever.retrieve_with_context = lambda **kwargs: []
        # Disable async side-effects for deterministic SQLite test runs.
        self.pipeline._log_query_audit = lambda *args, **kwargs: None
        self.pipeline._record_metrics = lambda *args, **kwargs: None
        self.pipeline._record_query_metering = lambda *args, **kwargs: None
        self.pipeline._log_action_audit = lambda *args, **kwargs: None

    def _stream_events(self, query_text: str):
        with patch.object(DocumentAccessService, 'get_accessible_document_ids', return_value={uuid.uuid4()}):
            stream = self.pipeline.execute_query_stream(self.user, query_text)
            events = []
            for item in stream:
                if not item.startswith('data: '):
                    continue
                payload = json.loads(item.replace('data: ', '').strip())
                events.append(payload)
            return events

    def test_stream_emits_action_required_for_explicit_action_prompt(self):
        events = self._stream_events(
            'action: revoke payroll export permission')
        event_names = [event.get('event') for event in events]

        self.assertIn('start', event_names)
        self.assertIn('metadata', event_names)
        self.assertIn('action_required', event_names)
        self.assertIn('done', event_names)

        action_event = next(event for event in events if event.get(
            'event') == 'action_required')
        done_event = next(
            event for event in events if event.get('event') == 'done')

        action_id = action_event['data']['action_id']
        self.assertTrue(action_id)
        self.assertTrue(action_event['data'].get('approval_token'))
        self.assertEqual(done_event['data']['status'], 'awaiting_action')
        self.assertIsNotNone(
            cache.get(self.pipeline._pending_action_cache_key(action_id)))

    def test_action_decision_approve_and_replay_protection(self):
        events = self._stream_events(
            'execute: remove role from contractor account')
        action_event = next(event for event in events if event.get(
            'event') == 'action_required')

        action_id = action_event['data']['action_id']
        approval_token = action_event['data']['approval_token']
        session_id = action_event['data']['payload']['session_id']

        # First resolution succeeds.
        result = self.pipeline.handle_action_decision(
            user=self.user,
            action_id=action_id,
            decision='approve',
            approval_token=approval_token,
            reason='Approved for security remediation',
            session_id=session_id,
        )

        self.assertEqual(result['status'], 'resumed')
        self.assertEqual(result['decision'], 'approve')
        self.assertEqual(result['outcome'], 'approved')
        self.assertTrue(result['resolved'])

        session = ChatSession.objects.get(id=session_id)
        assistant_messages = session.messages.filter(role='assistant')
        self.assertTrue(
            any('Action approved:' in msg.content for msg in assistant_messages),
            'Expected approval confirmation assistant message to be created.',
        )

        # Replay with same token/action is denied.
        with self.assertRaisesRegex(ValueError, 'already been resolved'):
            self.pipeline.handle_action_decision(
                user=self.user,
                action_id=action_id,
                decision='approve',
                approval_token=approval_token,
                reason='Replay should fail',
                session_id=session_id,
            )

    def test_action_decision_reject_requires_valid_token(self):
        events = self._stream_events(
            '/action revoke temporary endpoint access')
        action_event = next(event for event in events if event.get(
            'event') == 'action_required')

        action_id = action_event['data']['action_id']
        session_id = action_event['data']['payload']['session_id']

        with self.assertRaises(signing.BadSignature):
            self.pipeline.handle_action_decision(
                user=self.user,
                action_id=action_id,
                decision='reject',
                approval_token='invalid-token',
                reason='Invalid token should fail',
                session_id=session_id,
            )
