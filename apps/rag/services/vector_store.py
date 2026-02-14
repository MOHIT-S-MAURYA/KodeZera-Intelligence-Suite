"""
Qdrant vector database service.
"""
import uuid
from typing import List, Dict, Any
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class VectorStoreService:
    """Service for interacting with Qdrant vector database."""
    
    def __init__(self):
        """Initialize Qdrant client."""
        self.client = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY if settings.QDRANT_API_KEY else None
        )
        self.collection_name = settings.QDRANT_COLLECTION_NAME
        self._ensure_collection()
    
    def _ensure_collection(self):
        """Ensure collection exists, create if not."""
        try:
            collections = self.client.get_collections().collections
            collection_names = [c.name for c in collections]
            
            if self.collection_name not in collection_names:
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(
                        size=1536,  # OpenAI embedding dimension
                        distance=Distance.COSINE
                    )
                )
                logger.info(f"Created Qdrant collection: {self.collection_name}")
        except Exception as e:
            logger.error(f"Error ensuring collection: {e}")
    
    def store_embeddings(
        self,
        document_id: uuid.UUID,
        tenant_id: uuid.UUID,
        department_id: uuid.UUID,
        classification_level: int,
        chunks: List[Dict[str, Any]]
    ) -> List[str]:
        """
        Store document embeddings in Qdrant with metadata.
        
        Args:
            document_id: UUID of document
            tenant_id: UUID of tenant
            department_id: UUID of department (can be None)
            classification_level: Classification level (0-5)
            chunks: List of dicts with 'text', 'embedding', 'chunk_index'
            
        Returns:
            List of vector IDs created
        """
        points = []
        vector_ids = []
        
        for chunk in chunks:
            vector_id = str(uuid.uuid4())
            vector_ids.append(vector_id)
            
            point = PointStruct(
                id=vector_id,
                vector=chunk['embedding'],
                payload={
                    'tenant_id': str(tenant_id),
                    'document_id': str(document_id),
                    'department_id': str(department_id) if department_id else None,
                    'classification_level': classification_level,
                    'chunk_index': chunk['chunk_index'],
                    'text': chunk['text'][:1000],  # Store preview
                }
            )
            points.append(point)
        
        try:
            self.client.upsert(
                collection_name=self.collection_name,
                points=points
            )
            logger.info(f"Stored {len(points)} vectors for document {document_id}")
            return vector_ids
        except Exception as e:
            logger.error(f"Error storing embeddings: {e}")
            raise
    
    def search_vectors(
        self,
        query_embedding: List[float],
        tenant_id: uuid.UUID,
        document_ids: List[uuid.UUID],
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Search vectors with mandatory filtering by tenant and documents.
        
        Args:
            query_embedding: Query vector
            tenant_id: UUID of tenant (MANDATORY)
            document_ids: List of accessible document UUIDs (MANDATORY)
            top_k: Number of results to return
            
        Returns:
            List of search results with text and metadata
        """
        if not document_ids:
            return []
        
        # Build filter - MANDATORY tenant and document filtering
        search_filter = Filter(
            must=[
                FieldCondition(
                    key="tenant_id",
                    match=MatchValue(value=str(tenant_id))
                ),
                FieldCondition(
                    key="document_id",
                    match=MatchValue(any=[str(doc_id) for doc_id in document_ids])
                )
            ]
        )
        
        try:
            results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_embedding,
                query_filter=search_filter,
                limit=top_k
            )
            
            return [
                {
                    'text': hit.payload.get('text', ''),
                    'document_id': hit.payload.get('document_id'),
                    'chunk_index': hit.payload.get('chunk_index'),
                    'score': hit.score,
                }
                for hit in results
            ]
        except Exception as e:
            logger.error(f"Error searching vectors: {e}")
            from apps.core.exceptions import VectorSearchError
            raise VectorSearchError(f"Vector search failed: {str(e)}")
    
    def delete_document_vectors(self, document_id: uuid.UUID):
        """
        Delete all vectors for a document.
        
        Args:
            document_id: UUID of document
        """
        try:
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="document_id",
                            match=MatchValue(value=str(document_id))
                        )
                    ]
                )
            )
            logger.info(f"Deleted vectors for document {document_id}")
        except Exception as e:
            logger.error(f"Error deleting vectors: {e}")
