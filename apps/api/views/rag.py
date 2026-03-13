"""
RAG query views.
"""
from rest_framework.decorators import api_view, renderer_classes, throttle_classes
from rest_framework.renderers import BaseRenderer
from apps.rag.services.rag_query import RAGQueryService
from apps.api.serializers import RAGQuerySerializer
from apps.core.services.quota import QuotaService, QuotaExceeded
from apps.core.throttle import TenantQueryThrottle, UserQueryThrottle
from rest_framework.exceptions import PermissionDenied
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
@throttle_classes([TenantQueryThrottle, UserQueryThrottle])
def rag_query_view(request):
    """
    RAG query endpoint.
    Returns Server-Sent Events (SSE) stream for real-time text generation.

    Enforces:
    - DRF throttling (TenantQueryThrottle + UserQueryThrottle)
    - Per-tenant query quota (plan-aware QuotaService; platform owners exempt)
    """
    # ── Tenant quota enforcement ──────────────────────────────────────────────
    # Middleware performs this too, but keep an explicit check here so both
    # /api/* and /api/v1/* paths stay protected even if middleware routing
    # changes.
    tenant_id = getattr(request.user, 'tenant_id', None)
    if tenant_id:
        try:
            QuotaService.check_queries(str(tenant_id))
        except QuotaExceeded as exc:
            raise PermissionDenied(detail=exc.to_dict())

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
