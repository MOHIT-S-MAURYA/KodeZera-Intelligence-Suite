"""
RAG query views.
"""
from rest_framework import serializers, status
from rest_framework.decorators import api_view, renderer_classes, throttle_classes
from rest_framework.renderers import BaseRenderer
from rest_framework.response import Response
from apps.rag.services.rag_query import RAGQueryService
from apps.api.serializers import RAGQuerySerializer
from apps.core.services.quota import QuotaService, QuotaExceeded
from apps.core.throttle import TenantQueryThrottle, UserQueryThrottle
from rest_framework.exceptions import PermissionDenied
from django.http import StreamingHttpResponse
from django.core import signing
import logging

logger = logging.getLogger(__name__)


class RAGActionDecisionSerializer(serializers.Serializer):
    """Validate HITL action approval/rejection submissions."""

    action_id = serializers.CharField(max_length=128)
    decision = serializers.ChoiceField(choices=['approve', 'reject'])
    approval_token = serializers.CharField(max_length=2048)
    reason = serializers.CharField(
        required=False, allow_blank=True, max_length=500)
    session_id = serializers.UUIDField(required=False, allow_null=True)


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
        request.user.id, getattr(
            request.user, 'tenant_id', 'platform'), session_id,
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


@api_view(['POST'])
def rag_action_decision_view(request):
    """
    Receive human-in-the-loop action decisions from the chat UI.

    This endpoint validates and records user intent so action workflows can
    resume in a deterministic and auditable way.
    """
    serializer = RAGActionDecisionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    payload = serializer.validated_data

    rag_service = RAGQueryService()
    try:
        result = rag_service.action_decision(
            user=request.user,
            action_id=payload['action_id'],
            decision=payload['decision'],
            approval_token=payload['approval_token'],
            reason=payload.get('reason', ''),
            session_id=(str(payload['session_id'])
                        if payload.get('session_id') else None),
        )
    except signing.SignatureExpired:
        raise PermissionDenied(detail='Approval token expired.')
    except signing.BadSignature:
        raise PermissionDenied(detail='Invalid approval token.')
    except ValueError as exc:
        raise PermissionDenied(detail=str(exc))

    logger.info(
        "RAG action decision | user=%s tenant=%s action=%s decision=%s session=%s resolved=%s",
        request.user.id,
        getattr(request.user, 'tenant_id', 'platform'),
        payload['action_id'],
        payload['decision'],
        payload.get('session_id'),
        result.get('resolved'),
    )

    return Response(
        result,
        status=status.HTTP_200_OK,
    )
