"""
Qdrant vector database service.

Connection priority:
    1. Remote Qdrant server   (QDRANT_URL / QDRANT_API_KEY in settings)
    2. Local persistent path  (QDRANT_LOCAL_PATH in settings) — no server, data persists
    3. In-memory              — last resort dev fallback (data lost on restart)

A module-level singleton (_QDRANT_CLIENT) is used so the entire Python process
shares one QdrantClient. This is critical for local-path mode: qdrant-client
uses exclusive file locking — two clients pointing at the same directory crash.

Vector dimension is read from settings.VECTOR_DIMENSION so it automatically
adapts to whatever embedding provider is configured:
  SentenceTransformers all-MiniLM-L6-v2 → 384  (default)
  OpenAI text-embedding-3-small           → 1536
"""
import os
import uuid
import threading
from typing import List, Dict, Any

import requests
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue, MatchAny,
)
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

# Module-level singleton — shared by all VectorStoreService instances in this process.
_QDRANT_CLIENT: QdrantClient | None = None
_CLIENT_LOCK = threading.Lock()


def _get_vector_dimension() -> int:
    """Read the configured vector dimension from settings."""
    return getattr(settings, 'VECTOR_DIMENSION', 384)


def _create_client() -> QdrantClient:
    """
    Return the process-wide singleton QdrantClient.

        Priority:
            1. Remote Qdrant server   (QDRANT_URL set)
            2. Local persistent path  (QDRANT_LOCAL_PATH set and non-empty)
            3. In-memory              (fallback — warns the user)

        Why remote-first: in multi-process dev (Django + Celery), local-path mode
        uses an exclusive lock and can split processes across different backends
        (one local, one in-memory). Remote-first keeps all processes consistent.
    """
    global _QDRANT_CLIENT

    # Double-checked locking for thread safety
    if _QDRANT_CLIENT is not None:
        return _QDRANT_CLIENT

    with _CLIENT_LOCK:
        if _QDRANT_CLIENT is not None:
            return _QDRANT_CLIENT

        local_path: str = getattr(settings, 'QDRANT_LOCAL_PATH', '').strip()
        qdrant_url: str = getattr(settings, 'QDRANT_URL', 'http://localhost:6333')
        qdrant_key = (getattr(settings, 'QDRANT_API_KEY', '') or '').strip() or None

        # ── 1. Remote Qdrant server ───────────────────────────────────────────
        try:
            client = QdrantClient(url=qdrant_url, api_key=qdrant_key, timeout=5)
            client.get_collections()          # quick health-check
            logger.info(f"Qdrant: connected to remote server at {qdrant_url}")
            _QDRANT_CLIENT = client
            return client
        except Exception as e:
            logger.warning(
                f"Qdrant server at {qdrant_url} is unreachable ({type(e).__name__}: {e}). "
                "Trying local-path mode next."
            )

        # ── 2. Local persistent path ──────────────────────────────────────────
        if local_path:
            try:
                os.makedirs(local_path, exist_ok=True)
                client = QdrantClient(path=local_path)
                logger.info(f"Qdrant: using local persistent store at '{local_path}'")
                _QDRANT_CLIENT = client
                return client
            except (RuntimeError, Exception) as e:
                # AlreadyLocked / RuntimeError — another process (e.g. Celery)
                # already holds the exclusive file lock on qdrant_data/.
                logger.warning(
                    f"Qdrant: local path '{local_path}' is locked by another process "
                    f"({type(e).__name__}). Falling back to in-memory."
                )

        # ── 3. In-memory fallback ─────────────────────────────────────────────
        client = QdrantClient(location=":memory:")
        logger.info("Qdrant: using in-memory store (dev fallback).")
        _QDRANT_CLIENT = client
        return client


def reset_client():
    """Reset the singleton client (e.g. after Celery releases the lock)."""
    global _QDRANT_CLIENT
    with _CLIENT_LOCK:
        _QDRANT_CLIENT = None


class VectorStoreService:
    """
    Service for interacting with Qdrant vector database.

    All instances in the same Python process share the same underlying
    QdrantClient singleton (_QDRANT_CLIENT), which is required for local-path
    mode where file-level locking is used by the qdrant-client library.
    """

    def __init__(self):
        self.client = _create_client()
        self.collection_name = getattr(settings, 'QDRANT_COLLECTION_NAME', 'kodezera_documents')
        self._dim = _get_vector_dimension()
        self._ensure_collection()

    # ── Collection management ─────────────────────────────────────────────────

    def _ensure_collection(self):
        """Create the collection if it does not already exist."""
        try:
            existing = {c.name for c in self.client.get_collections().collections}
            if self.collection_name not in existing:
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(
                        size=self._dim,
                        distance=Distance.COSINE,
                    ),
                )
                logger.info(
                    f"Qdrant: created collection '{self.collection_name}' "
                    f"(dim={self._dim}, COSINE)"
                )
            else:
                logger.debug(f"Qdrant: collection '{self.collection_name}' already exists.")
        except Exception as e:
            logger.error(f"Qdrant: error ensuring collection: {e}")

    def recreate_collection(self):
        """
        Drop and recreate the collection.
        Use when the vector dimension changes (e.g. switching embedding model).
        This will delete ALL stored vectors — be careful!
        """
        try:
            existing = {c.name for c in self.client.get_collections().collections}
            if self.collection_name in existing:
                self.client.delete_collection(self.collection_name)
                logger.info(f"Qdrant: dropped collection '{self.collection_name}'.")
            self._ensure_collection()
        except Exception as e:
            logger.error(f"Qdrant: error recreating collection: {e}")
            raise

    # ── Write ─────────────────────────────────────────────────────────────────

    def store_embeddings(
        self,
        document_id: uuid.UUID,
        tenant_id: uuid.UUID,
        department_id: uuid.UUID,
        classification_level: int,
        chunks: List[Dict[str, Any]],
    ) -> List[str]:
        """
        Store document embedding chunks in Qdrant.

        Each *chunk* dict must contain:
            - 'text'        : str — source text (stored as payload preview)
            - 'embedding'   : List[float] — must be length VECTOR_DIMENSION
            - 'chunk_index' : int

        Returns:
            List of vector IDs (one per chunk).
        """
        if not chunks:
            return []

        points: List[PointStruct] = []
        vector_ids: List[str] = []

        for chunk in chunks:
            embedding = chunk['embedding']

            # Guard: skip chunks whose embedding dimension doesn't match the collection.
            if len(embedding) != self._dim:
                logger.error(
                    f"Chunk {chunk.get('chunk_index')} has dim={len(embedding)}, "
                    f"collection expects dim={self._dim}. Skipping."
                )
                continue

            vector_id = str(uuid.uuid4())
            vector_ids.append(vector_id)
            points.append(
                PointStruct(
                    id=vector_id,
                    vector=embedding,
                    payload={
                        'tenant_id': str(tenant_id),
                        'document_id': str(document_id),
                        'department_id': str(department_id) if department_id else None,
                        'classification_level': classification_level,
                        'chunk_index': chunk['chunk_index'],
                        'text': chunk['text'][:1000],
                    },
                )
            )

        if not points:
            return []

        try:
            self.client.upsert(collection_name=self.collection_name, points=points)
            logger.info(f"Qdrant: stored {len(points)} vectors for document {document_id}")
        except Exception as e:
            logger.error(f"Qdrant: error storing embeddings for {document_id}: {e}")
            raise

        return vector_ids

    # ── Read ──────────────────────────────────────────────────────────────────

    def search_vectors(
        self,
        query_embedding: List[float],
        tenant_id: uuid.UUID,
        document_ids: List[uuid.UUID],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Semantic similarity search with mandatory tenant + document-level filters.

        Returns:
            List of {text, document_id, chunk_index, score} dicts.
        """
        if not document_ids:
            return []

        search_filter = Filter(
            must=[
                FieldCondition(key="tenant_id", match=MatchValue(value=str(tenant_id))),
                FieldCondition(
                    key="document_id",
                    match=MatchAny(any=[str(d) for d in document_ids]),
                ),
            ]
        )

        document_ids_str = [str(d) for d in document_ids]

        try:
            # qdrant-client API changed across versions:
            # - older clients expose `search(...)`
            # - newer clients expose `query_points(...)`
            if hasattr(self.client, "search"):
                results = self.client.search(
                    collection_name=self.collection_name,
                    query_vector=query_embedding,
                    query_filter=search_filter,
                    limit=top_k,
                    with_payload=True,
                )
            elif hasattr(self.client, "query_points"):
                try:
                    query_result = self.client.query_points(
                        collection_name=self.collection_name,
                        query=query_embedding,
                        query_filter=search_filter,
                        limit=top_k,
                        with_payload=True,
                    )
                    results = getattr(query_result, "points", None) or getattr(query_result, "result", [])
                except Exception as query_exc:
                    # Older Qdrant servers (e.g. 1.7.x) may not expose /points/query.
                    # Fall back to legacy REST /points/search endpoint.
                    logger.warning(
                        "Qdrant query_points failed (%s). Falling back to legacy HTTP /points/search.",
                        query_exc,
                    )
                    results = self._legacy_http_search(
                        query_embedding=query_embedding,
                        tenant_id=tenant_id,
                        document_ids=document_ids_str,
                        top_k=top_k,
                    )
            else:
                results = self._legacy_http_search(
                    query_embedding=query_embedding,
                    tenant_id=tenant_id,
                    document_ids=document_ids_str,
                    top_k=top_k,
                )

            def _hit_payload(hit: Any) -> Dict[str, Any]:
                payload = getattr(hit, 'payload', None)
                if payload is None and isinstance(hit, dict):
                    payload = hit.get('payload', {})
                return payload or {}

            def _hit_score(hit: Any) -> float:
                score = getattr(hit, 'score', None)
                if score is None and isinstance(hit, dict):
                    score = hit.get('score', 0)
                return float(score or 0)

            normalized_results: List[Dict[str, Any]] = []
            for hit in results:
                payload = _hit_payload(hit)
                normalized_results.append(
                    {
                        'text': payload.get('text', ''),
                        'document_id': payload.get('document_id'),
                        'chunk_index': payload.get('chunk_index'),
                        'score': _hit_score(hit),
                    }
                )
            return normalized_results
        except Exception as e:
            logger.error(f"Qdrant: vector search error: {e}")
            from apps.core.exceptions import VectorSearchError
            raise VectorSearchError(f"Vector search failed: {e}")

    def _legacy_http_search(
        self,
        query_embedding: List[float],
        tenant_id: uuid.UUID,
        document_ids: List[str],
        top_k: int,
    ) -> List[Dict[str, Any]]:
        """Fallback search for older Qdrant servers via /points/search REST API."""
        qdrant_url: str = getattr(settings, 'QDRANT_URL', 'http://localhost:6333')
        qdrant_key = (getattr(settings, 'QDRANT_API_KEY', '') or '').strip()

        url = f"{qdrant_url.rstrip('/')}/collections/{self.collection_name}/points/search"
        headers = {'Content-Type': 'application/json'}
        if qdrant_key:
            headers['api-key'] = qdrant_key

        payload = {
            'vector': query_embedding,
            'filter': {
                'must': [
                    {'key': 'tenant_id', 'match': {'value': str(tenant_id)}},
                    {'key': 'document_id', 'match': {'any': document_ids}},
                ]
            },
            'limit': top_k,
            'with_payload': True,
        }

        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data.get('result', []) if isinstance(data, dict) else []

    def get_chunks_by_index(
        self,
        document_id: str,
        chunk_indices: List[int],
    ) -> List[Dict[str, Any]]:
        """Fetch specific chunks by index for context-window expansion (no ANN search)."""
        if not chunk_indices:
            return []

        scroll_filter = Filter(
            must=[
                FieldCondition(key="document_id", match=MatchValue(value=str(document_id))),
                FieldCondition(key="chunk_index", match=MatchAny(any=chunk_indices)),
            ]
        )

        try:
            records, _ = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=scroll_filter,
                limit=len(chunk_indices),
                with_payload=True,
                with_vectors=False,
            )
            return [
                {
                    'text': r.payload.get('text', ''),
                    'document_id': r.payload.get('document_id'),
                    'chunk_index': r.payload.get('chunk_index'),
                }
                for r in records
            ]
        except Exception as e:
            logger.error(f"Qdrant: error fetching chunks by index: {e}")
            return []

    # ── Delete ────────────────────────────────────────────────────────────────

    def delete_document_vectors(self, document_id: uuid.UUID):
        """Delete all stored vectors for a given document."""
        try:
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="document_id",
                            match=MatchValue(value=str(document_id)),
                        )
                    ]
                ),
            )
            logger.info(f"Qdrant: deleted vectors for document {document_id}")
        except Exception as e:
            logger.error(f"Qdrant: error deleting vectors for {document_id}: {e}")

    # ── Health ────────────────────────────────────────────────────────────────

    def get_collection_info(self) -> Dict[str, Any]:
        """Return basic stats about the collection (useful for health checks)."""
        try:
            info = self.client.get_collection(self.collection_name)
            return {
                'name': self.collection_name,
                'vector_dim': self._dim,
                'points_count': info.points_count,
                'indexed_vectors': info.indexed_vectors_count,
                'status': str(info.status),
            }
        except Exception as e:
            return {'error': str(e)}
