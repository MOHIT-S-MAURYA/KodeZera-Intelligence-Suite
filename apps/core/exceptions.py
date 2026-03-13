"""
Custom exception classes and handlers.
"""
import logging

from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import Throttled, PermissionDenied

logger = logging.getLogger(__name__)


class TenantInactiveError(Exception):
    """Raised when tenant is inactive."""
    pass


class InsufficientPermissionsError(Exception):
    """Raised when user lacks required permissions."""
    pass


class DocumentAccessDeniedError(Exception):
    """Raised when user cannot access a document."""
    pass


class VectorSearchError(Exception):
    """Raised when vector search fails."""
    pass


class LLMServiceError(Exception):
    """Raised when LLM service fails."""
    pass


class DocumentProcessingError(Exception):
    """Raised when document processing fails."""
    pass


def _problem(
    *,
    code: str,
    title: str,
    detail: str,
    http_status: int,
    instance: str,
    request_id: str,
    extensions: dict | None = None,
):
    payload = {
        'type': f'https://kodezera.local/errors/{code}',
        'title': title,
        'status': http_status,
        'detail': detail,
        'instance': instance,
    }
    if request_id:
        payload['request_id'] = request_id
    if extensions:
        payload['extensions'] = extensions
    return payload


def custom_exception_handler(exc, context):
    """
    Custom exception handler for DRF.
    Never exposes internal errors to users.
    """
    request = context.get('request')
    path = getattr(request, 'path', '') if request else ''
    request_id = ''
    if request is not None:
        request_id = request.META.get('request_id', '')

    # Call DRF's default exception handler first
    response = exception_handler(exc, context)

    if response is not None:
        detail = response.data.get('detail') if isinstance(response.data, dict) else None
        extensions = None
        detail_text = detail
        if isinstance(detail, dict):
            detail_text = detail.get('message') or detail.get('error') or 'Request could not be processed.'
            extensions = {k: v for k, v in detail.items() if k not in ('message',)}

        if isinstance(exc, Throttled):
            response.data = _problem(
                code='rate-limit-exceeded',
                title='Rate Limit Exceeded',
                detail=str(detail_text or 'Too many requests. Please try again later.'),
                http_status=response.status_code,
                instance=path,
                request_id=request_id,
                extensions={'retry_after_seconds': getattr(exc, 'wait', None)},
            )
            return response

        response.data = _problem(
            code='request-error',
            title='Request Error',
            detail=str(detail_text or 'The request could not be processed.'),
            http_status=response.status_code,
            instance=path,
            request_id=request_id,
            extensions=extensions,
        )
        return response

    # Handle custom exceptions
    if isinstance(exc, TenantInactiveError):
        return Response(
            _problem(
                code='tenant-inactive',
                title='Tenant Inactive',
                detail='Your organization account is inactive. Please contact support.',
                http_status=status.HTTP_403_FORBIDDEN,
                instance=path,
                request_id=request_id,
            ),
            status=status.HTTP_403_FORBIDDEN
        )

    if isinstance(exc, InsufficientPermissionsError):
        return Response(
            _problem(
                code='insufficient-permissions',
                title='Insufficient Permissions',
                detail='You do not have permission to perform this action.',
                http_status=status.HTTP_403_FORBIDDEN,
                instance=path,
                request_id=request_id,
            ),
            status=status.HTTP_403_FORBIDDEN
        )

    if isinstance(exc, DocumentAccessDeniedError):
        return Response(
            _problem(
                code='document-access-denied',
                title='Document Access Denied',
                detail='You do not have access to this document.',
                http_status=status.HTTP_403_FORBIDDEN,
                instance=path,
                request_id=request_id,
            ),
            status=status.HTTP_403_FORBIDDEN
        )

    if isinstance(exc, VectorSearchError):
        return Response(
            _problem(
                code='vector-search-unavailable',
                title='Search Service Unavailable',
                detail='Search service is temporarily unavailable. Please try again later.',
                http_status=status.HTTP_503_SERVICE_UNAVAILABLE,
                instance=path,
                request_id=request_id,
            ),
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )

    if isinstance(exc, LLMServiceError):
        return Response(
            _problem(
                code='llm-service-unavailable',
                title='AI Service Unavailable',
                detail='AI service is temporarily unavailable. Please try again later.',
                http_status=status.HTTP_503_SERVICE_UNAVAILABLE,
                instance=path,
                request_id=request_id,
            ),
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )

    if isinstance(exc, DocumentProcessingError):
        return Response(
            _problem(
                code='document-processing-failed',
                title='Document Processing Failed',
                detail='Document processing failed. Please try uploading again.',
                http_status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                instance=path,
                request_id=request_id,
            ),
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    if isinstance(exc, PermissionDenied):
        return Response(
            _problem(
                code='permission-denied',
                title='Permission Denied',
                detail='You do not have permission to perform this action.',
                http_status=status.HTTP_403_FORBIDDEN,
                instance=path,
                request_id=request_id,
            ),
            status=status.HTTP_403_FORBIDDEN,
        )

    # For all other exceptions, return a generic error
    # Log the actual error for debugging
    logger.error(f"Unhandled exception: {exc}", exc_info=True)

    return Response(
        _problem(
            code='internal-error',
            title='Internal Server Error',
            detail='An unexpected error occurred. Please try again later.',
            http_status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            instance=path,
            request_id=request_id,
        ),
        status=status.HTTP_500_INTERNAL_SERVER_ERROR
    )
