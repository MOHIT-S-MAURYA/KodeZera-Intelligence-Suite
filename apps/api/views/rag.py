"""
RAG query views.
"""
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.conf import settings
from django_ratelimit.decorators import ratelimit
from apps.rag.services.rag_query import RAGQueryService
from apps.api.serializers import RAGQuerySerializer, RAGResponseSerializer


@api_view(['POST'])
@ratelimit(key='user', rate=settings.RAG_QUERY_RATE_LIMIT, method='POST')
def rag_query_view(request):
    """
    RAG query endpoint.
    Rate limited to prevent abuse.
    """
    serializer = RAGQuerySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    
    question = serializer.validated_data['question']
    
    # Execute RAG pipeline
    rag_service = RAGQueryService()
    result = rag_service.query(user=request.user, question=question)
    
    # Serialize response
    response_serializer = RAGResponseSerializer(result)
    
    return Response(response_serializer.data)
