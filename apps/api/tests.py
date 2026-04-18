import json
import uuid
from unittest.mock import patch

from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Tenant, User
from apps.rag.models import ChatSession
from apps.documents.services.access import DocumentAccessService
from apps.rag.services.llm_runner import LLMRunner
from apps.rag.services.rag_pipeline import RAGPipeline
from apps.rag.services.retriever import RAGRetriever


class RAGActionDecisionApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.url = '/api/v1/rag/action-decision/'
        self.tenant = Tenant.objects.create(
            name='API Tenant', slug='api-tenant')
        self.user = User.objects.create_user(
            email='api-user@example.com',
            username='api_user',
            password='StrongPass123!',
            tenant=self.tenant,
        )
        self.session = ChatSession.objects.create(
            user=self.user,
            tenant=self.tenant,
            title='Action Flow Test Session',
        )

        self.pipeline = RAGPipeline()
        self.pending_action = self.pipeline._create_pending_action(
            user=self.user,
            session=self.session,
            query_text='action: revoke endpoint access',
            action_type='delete',
            summary='Revoke endpoint access for target account',
            sources=[],
        )

    def test_action_decision_requires_authentication(self):
        response = self.client.post(
            self.url,
            {
                'action_id': self.pending_action['action_id'],
                'decision': 'approve',
                'approval_token': self.pending_action['approval_token'],
                'session_id': str(self.session.id),
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_action_decision_rejects_invalid_token(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            self.url,
            {
                'action_id': self.pending_action['action_id'],
                'decision': 'approve',
                'approval_token': 'invalid-token',
                'session_id': str(self.session.id),
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Invalid approval token', str(response.data))

    def test_action_decision_success_returns_resumed_payload(self):
        self.client.force_authenticate(user=self.user)

        with patch.object(RAGPipeline, '_log_action_audit', return_value=None):
            response = self.client.post(
                self.url,
                {
                    'action_id': self.pending_action['action_id'],
                    'decision': 'approve',
                    'approval_token': self.pending_action['approval_token'],
                    'reason': 'Approved by tenant admin',
                    'session_id': str(self.session.id),
                },
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'resumed')
        self.assertEqual(response.data['action_id'],
                         self.pending_action['action_id'])
        self.assertEqual(response.data['decision'], 'approve')
        self.assertTrue(response.data['resolved'])

    def test_action_decision_replay_is_denied(self):
        self.client.force_authenticate(user=self.user)

        payload = {
            'action_id': self.pending_action['action_id'],
            'decision': 'reject',
            'approval_token': self.pending_action['approval_token'],
            'reason': 'Replay test',
            'session_id': str(self.session.id),
        }

        with patch.object(RAGPipeline, '_log_action_audit', return_value=None):
            first = self.client.post(self.url, payload, format='json')
            second = self.client.post(self.url, payload, format='json')

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('already been resolved', str(second.data))


class RAGQueryStreamContractApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.url = '/api/v1/rag/query/'
        self.tenant = Tenant.objects.create(
            name='Stream Contract Tenant', slug='stream-contract-tenant')
        self.user = User.objects.create_user(
            email='stream-user@example.com',
            username='stream_user',
            password='StrongPass123!',
            tenant=self.tenant,
        )
        self.client.force_authenticate(user=self.user)

    def _collect_stream_events(self, response):
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        events = []
        for chunk in response.streaming_content:
            text = chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk
            for line in text.splitlines():
                if not line.startswith('data: '):
                    continue
                events.append(json.loads(line.replace('data: ', '')))
        return events

    def test_query_stream_success_emits_ordered_terminal_events(self):
        retrieved_chunks = [
            {
                'document_id': uuid.uuid4(),
                'document_title': 'Security Handbook',
                'file_type': 'pdf',
                'confidence': 'high',
                'score': 0.92,
                'text': 'Administrators must enable MFA for privileged access.',
            }
        ]

        with (
            patch.object(DocumentAccessService, 'get_accessible_document_ids', return_value={
                         uuid.uuid4()}),
            patch.object(RAGRetriever, 'retrieve_with_context',
                         return_value=retrieved_chunks),
            patch.object(LLMRunner, 'generate_response_stream',
                         return_value=iter(['MFA is required', ' for admins.'])),
            patch.object(RAGPipeline, '_log_query_audit', return_value=None),
            patch.object(RAGPipeline, '_record_metrics', return_value=None),
            patch.object(RAGPipeline, '_record_query_metering',
                         return_value=None),
        ):
            response = self.client.post(
                self.url,
                {'question': 'What does the security handbook say about MFA?'},
                format='json',
            )
            events = self._collect_stream_events(response)
        event_names = [event.get('event') for event in events]

        self.assertEqual(
            event_names, ['start', 'metadata', 'chunk', 'chunk', 'done'])
        self.assertEqual(events[-1]['data']['status'], 'completed')

    def test_query_stream_generation_failure_emits_error_then_done(self):
        retrieved_chunks = [
            {
                'document_id': uuid.uuid4(),
                'document_title': 'Operations Guide',
                'file_type': 'docx',
                'confidence': 'medium',
                'score': 0.65,
                'text': 'Escalation procedures for incident response.',
            }
        ]

        with (
            patch.object(DocumentAccessService, 'get_accessible_document_ids', return_value={
                         uuid.uuid4()}),
            patch.object(RAGRetriever, 'retrieve_with_context',
                         return_value=retrieved_chunks),
            patch.object(LLMRunner, 'generate_response_stream',
                         side_effect=Exception('LLM stream failed')),
            patch.object(RAGPipeline, '_log_query_audit', return_value=None),
            patch.object(RAGPipeline, '_record_metrics', return_value=None),
            patch.object(RAGPipeline, '_record_query_metering',
                         return_value=None),
        ):
            response = self.client.post(
                self.url,
                {'question': 'Summarize escalation procedures.'},
                format='json',
            )
            events = self._collect_stream_events(response)
        event_names = [event.get('event') for event in events]

        self.assertEqual(event_names, ['start', 'metadata', 'error', 'done'])
        self.assertEqual(events[2]['data']['code'], 'stream_generation_failed')
        self.assertEqual(events[3]['data']['status'], 'failed')
        self.assertEqual(events[3]['data']['reason'],
                         'stream_generation_failed')

    def test_query_stream_action_request_emits_awaiting_action_terminal_state(self):
        with (
            patch.object(DocumentAccessService, 'get_accessible_document_ids', return_value={
                         uuid.uuid4()}),
            patch.object(RAGRetriever, 'retrieve_with_context',
                         return_value=[]),
            patch.object(RAGPipeline, '_log_query_audit', return_value=None),
            patch.object(RAGPipeline, '_record_metrics', return_value=None),
            patch.object(RAGPipeline, '_record_query_metering',
                         return_value=None),
        ):
            response = self.client.post(
                self.url,
                {'question': 'action: disable the stale contractor account'},
                format='json',
            )
            events = self._collect_stream_events(response)
        event_names = [event.get('event') for event in events]

        self.assertEqual(
            event_names, ['start', 'metadata', 'action_required', 'chunk', 'done'])
        self.assertTrue(events[2]['data'].get('approval_token'))
        self.assertEqual(events[4]['data']['status'], 'awaiting_action')
        self.assertEqual(events[4]['data']['reason'], 'awaiting_action')

    def test_query_stream_retrieval_failure_emits_error_then_done(self):
        with (
            patch.object(DocumentAccessService, 'get_accessible_document_ids', return_value={
                         uuid.uuid4()}),
            patch.object(RAGRetriever, 'retrieve_with_context',
                         side_effect=Exception('retrieval unavailable')),
            patch.object(RAGPipeline, '_record_metrics', return_value=None),
            patch.object(RAGPipeline, '_record_query_metering',
                         return_value=None),
        ):
            response = self.client.post(
                self.url,
                {'question': 'What changed in the latest policy update?'},
                format='json',
            )
            events = self._collect_stream_events(response)

        event_names = [event.get('event') for event in events]

        self.assertEqual(event_names, ['start', 'error', 'done'])
        self.assertEqual(events[1]['data']['code'], 'retrieval_error')
        self.assertEqual(events[2]['data']['status'], 'failed')
        self.assertEqual(events[2]['data']['reason'], 'retrieval_error')
