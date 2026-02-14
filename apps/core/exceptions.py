"""
Custom exception classes and handlers.
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


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


def custom_exception_handler(exc, context):
    """
    Custom exception handler for DRF.
    Never exposes internal errors to users.
    """
    # Call DRF's default exception handler first
    response = exception_handler(exc, context)
    
    if response is not None:
        return response
    
    # Handle custom exceptions
    if isinstance(exc, TenantInactiveError):
        return Response(
            {'error': 'Your organization account is inactive. Please contact support.'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    if isinstance(exc, InsufficientPermissionsError):
        return Response(
            {'error': 'You do not have permission to perform this action.'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    if isinstance(exc, DocumentAccessDeniedError):
        return Response(
            {'error': 'You do not have access to this document.'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    if isinstance(exc, VectorSearchError):
        return Response(
            {'error': 'Search service is temporarily unavailable. Please try again later.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    
    if isinstance(exc, LLMServiceError):
        return Response(
            {'error': 'AI service is temporarily unavailable. Please try again later.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    
    if isinstance(exc, DocumentProcessingError):
        return Response(
            {'error': 'Document processing failed. Please try uploading again.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
    # For all other exceptions, return a generic error
    # Log the actual error for debugging
    import logging
    logger = logging.getLogger(__name__)
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    return Response(
        {'error': 'An unexpected error occurred. Please try again later.'},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR
    )
