"""
RAG query views.
"""
from rest_framework import status
from rest_framework.decorators import api_view, renderer_classes
from rest_framework.response import Response
from rest_framework.renderers import BaseRenderer
from django.conf import settings
from django_ratelimit.decorators import ratelimit
from apps.rag.services.rag_query import RAGQueryService
from apps.api.serializers import RAGQuerySerializer, RAGResponseSerializer
from apps.core.quota import check_tenant_query_quota
from apps.core.throttle import TenantQueryThrottle, UserQueryThrottle
from django.http import StreamingHttpResponse
import logging

logger = logging.getLogger(__name__)


class ServerSentEventRenderer(BaseRenderer):
    """
    Custom DRF renderer that accepts the text/event-stream media type,
    allowing DRF content negotiation to pass through for SSE endpoints.
    """
    media_type = 'text/event-stream'
    format = 'sse'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        # The StreamingHttpResponse bypasses DRF rendering, so this is
        # never actually called, but its presence prevents the 406 error.
        return data


@api_view(['POST'])
@renderer_classes([ServerSentEventRenderer])
@ratelimit(key='user', rate=settings.RAG_QUERY_RATE_LIMIT, method='POST')
def rag_query_view(request):
    """
    RAG query endpoint.
    Returns Server-Sent Events (SSE) stream for real-time text generation.

    Enforces:
    - Per-user rate limit  (django-ratelimit, from settings.RAG_QUERY_RATE_LIMIT)
    - Per-tenant daily quota (TENANT_DAILY_QUERY_LIMIT; platform owners exempt)
    """
    # ── Tenant quota enforcement ──────────────────────────────────────────────
    # Raises PermissionDenied with structured error if quota exceeded.
    check_tenant_query_quota(request.user)

    serializer = RAGQuerySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    question = serializer.validated_data['question']
    session_id = serializer.validated_data.get('session_id')

    logger.info(
        "RAG query | user=%s tenant=%s session=%s",
        request.user.id, getattr(request.user, 'tenant_id', 'platform'), session_id,
    )

    rag_service = RAGQueryService()

    stream_generator = rag_service.query_stream(
        user=request.user,
        question=question,
        session_id=session_id
    )

    return StreamingHttpResponse(
        stream_generator,
        content_type='text/event-stream'
    )
