"""
Qdrant vector database service.
Automatically falls back to an in-memory Qdrant instance if the server is unavailable.
"""
import uuid
import random
from typing import List, Dict, Any
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue, MatchAny
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

# Embed dimension used across the whole app
VECTOR_DIMENSION = 1536  # OpenAI text-embedding-3-small / text-embedding-ada-002


def _create_client() -> QdrantClient:
    """
    Try to connect to the configured Qdrant server.
    If it is unreachable (e.g. in local dev without Docker), fall back
    to an in-memory Qdrant instance so the rest of the app remains functional.
    """
    qdrant_url = getattr(settings, 'QDRANT_URL', 'http://localhost:6333')
    qdrant_key = getattr(settings, 'QDRANT_API_KEY', '') or None  # empty string → None

    # First try the real server
    try:
        client = QdrantClient(url=qdrant_url, api_key=qdrant_key, timeout=3)
        client.get_collections()  # health-check
        logger.info(f"Connected to Qdrant server at {qdrant_url}")
        return client
    except Exception as e:
        logger.warning(
            f"Qdrant server at {qdrant_url} is unreachable ({e}). "
            "Falling back to in-memory Qdrant (data will NOT persist across restarts)."
        )

    # Fall back to in-memory mode
    client = QdrantClient(location=":memory:")
    logger.info("Using in-memory Qdrant (dev mode).")
    return client


class VectorStoreService:
    """Service for interacting with Qdrant vector database."""

    def __init__(self):
        """Initialize Qdrant client with automatic fallback to in-memory."""
        self.client = _create_client()
        self.collection_name = getattr(settings, 'QDRANT_COLLECTION_NAME', 'kodezera_documents')
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
                        size=VECTOR_DIMENSION,
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
                    match=MatchAny(any=[str(doc_id) for doc_id in document_ids])
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

    def get_chunks_by_index(
        self,
        document_id: str,
        chunk_indices: List[int]
    ) -> List[Dict[str, Any]]:
        """
        Fetch specific chunks for a document by their indices to build context windows.

        Args:
            document_id: UUID of document
            chunk_indices: List of integer indices to fetch

        Returns:
            List of chunk contents
        """
        if not chunk_indices:
            return []

        search_filter = Filter(
            must=[
                FieldCondition(
                    key="document_id",
                    match=MatchValue(value=str(document_id))
                ),
                FieldCondition(
                    key="chunk_index",
                    match=MatchAny(any=chunk_indices)
                )
            ]
        )

        try:
            # We use scroll since we know exactly which metadata we want, no vector search needed
            records, _ = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=search_filter,
                limit=len(chunk_indices),
                with_payload=True,
                with_vectors=False
            )

            return [
                {
                    'text': record.payload.get('text', ''),
                    'document_id': record.payload.get('document_id'),
                    'chunk_index': record.payload.get('chunk_index'),
                }
                for record in records
            ]
        except Exception as e:
            logger.error(f"Error fetching specific chunks: {e}")
            return []
