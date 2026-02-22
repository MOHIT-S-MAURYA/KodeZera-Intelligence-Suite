"""
RAG query service - Wrapper for the new modular RAG pipeline.
"""
from typing import Dict, Any
from apps.core.models import User
from apps.rag.services.rag_pipeline import RAGPipeline
import logging

logger = logging.getLogger(__name__)


class RAGQueryService:
    """Wrapper service for backward compatibility."""
    
    def __init__(self):
        """Initialize the modular RAG pipeline."""
        self.pipeline = RAGPipeline()
    
    def query(self, user: User, question: str, session_id: str = None) -> Dict[str, Any]:
        """
        Execute RAG query using the modular pipeline.
        
        Args:
            user: Authenticated user
            question: User's question
            session_id: Optional UUID of the chat session
            
        Returns:
            Dict with 'answer', 'sources', and 'metadata'
        """
        logger.info(f"RAGQueryService invoking RAGPipeline for user {user.id}")
        return self.pipeline.execute_query(user, question, session_id)

    def query_stream(self, user: User, question: str, session_id: str = None):
        """
        Execute RAG query using the modular pipeline, returning a token generator.
        """
        logger.info(f"RAGQueryService stream invoking RAGPipeline for user {user.id}")
        return self.pipeline.execute_query_stream(user, question, session_id)

