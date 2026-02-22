"""
Embedding generation service.

Reads provider, model, and API key from the AIProviderConfig DB record.
Currently supported embedding providers:
  - openai               → OpenAI Embeddings API
  - huggingface          → HuggingFace Inference API (feature-extraction pipeline)
  - sentence_transformers→ Local SentenceTransformers (no API key required)

Falls back to deterministic dev-mode pseudo-embeddings when no key is configured.
"""
import hashlib
import math
import logging
from typing import List

logger = logging.getLogger(__name__)

# Vector dimension must match the Qdrant collection (see vector_store.py)
_VECTOR_DIM = 1536

_PLACEHOLDER_KEYS = {'', 'your-openai-api-key-here', 'sk-...', 'OPENAI_API_KEY',
                     'your-hf-api-key'}


def _is_placeholder(key: str) -> bool:
    return not key or key.strip() in _PLACEHOLDER_KEYS


def _dev_embedding(text: str) -> List[float]:
    """
    Deterministic pseudo-embedding for dev/testing when no real key is available.
    NOT semantically meaningful — only for pipeline testing.
    """
    digest = hashlib.sha256(text.encode()).hexdigest()
    seed = int(digest[:8], 16)
    vector = [math.sin(seed * (i + 1) * 0.0001) for i in range(_VECTOR_DIM)]
    magnitude = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / magnitude for v in vector]


def _load_config():
    try:
        from apps.core.models import AIProviderConfig
        return AIProviderConfig.get_config()
    except Exception as e:
        logger.warning(f"Could not load AIProviderConfig: {e}. Using settings.py defaults.")
        return None


class EmbeddingService:
    """Service for generating embeddings — provider determined by AIProviderConfig DB record."""

    @staticmethod
    def generate_embedding(text: str) -> List[float]:
        return EmbeddingService._embed([text])[0]

    @staticmethod
    def generate_embeddings_batch(texts: List[str]) -> List[List[float]]:
        return EmbeddingService._embed(texts)

    @staticmethod
    def _embed(texts: List[str]) -> List[List[float]]:
        cfg = _load_config()

        if cfg:
            provider = (cfg.embedding_provider or 'openai').lower()
            model = cfg.embedding_model or 'text-embedding-3-small'
            api_key = '' if _is_placeholder(cfg.embedding_api_key) else cfg.embedding_api_key
            api_base = cfg.embedding_api_base or ''
        else:
            from django.conf import settings
            provider = 'openai'
            model = getattr(settings, 'EMBEDDING_MODEL', 'text-embedding-3-small')
            raw = getattr(settings, 'OPENAI_API_KEY', '')
            api_key = '' if _is_placeholder(raw) else raw
            api_base = ''

        logger.debug(f"EmbeddingService: provider={provider}, model={model}, key={'set' if api_key else 'MISSING'}")

        if provider == 'openai':
            return EmbeddingService._embed_openai(texts, model, api_key, api_base)
        elif provider == 'huggingface':
            return EmbeddingService._embed_huggingface(texts, model, api_key, api_base)
        elif provider == 'sentence_transformers':
            return EmbeddingService._embed_sentence_transformers(texts, model)
        else:
            logger.warning(f"Unknown embedding provider '{provider}'. Using dev embedding.")
            return [_dev_embedding(t) for t in texts]

    @staticmethod
    def _embed_openai(texts, model, api_key, api_base) -> List[List[float]]:
        if not api_key:
            logger.debug("No OpenAI key → using dev embeddings.")
            return [_dev_embedding(t) for t in texts]
        try:
            import openai
            client = openai.OpenAI(api_key=api_key, base_url=api_base or None)
            response = client.embeddings.create(model=model, input=texts)
            return [item.embedding for item in response.data]
        except Exception as e:
            logger.error(f"OpenAI embedding error: {e}")
            raise

    @staticmethod
    def _embed_huggingface(texts, model, api_key, api_base) -> List[List[float]]:
        if not api_key:
            logger.debug("No HuggingFace key → using dev embeddings.")
            return [_dev_embedding(t) for t in texts]
        try:
            import requests as req
            url = api_base or f"https://api-inference.huggingface.co/pipeline/feature-extraction/{model}"
            headers = {"Authorization": f"Bearer {api_key}"}
            resp = req.post(url, headers=headers, json={"inputs": texts}, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            # HF returns list of embeddings directly
            if isinstance(data, list) and data and isinstance(data[0], list):
                # Normalize dimension to _VECTOR_DIM via padding/truncation
                result = []
                for emb in data:
                    if len(emb) < _VECTOR_DIM:
                        emb = emb + [0.0] * (_VECTOR_DIM - len(emb))
                    elif len(emb) > _VECTOR_DIM:
                        emb = emb[:_VECTOR_DIM]
                    # L2 normalize
                    mag = math.sqrt(sum(v * v for v in emb)) or 1.0
                    result.append([v / mag for v in emb])
                return result
            logger.error(f"Unexpected HF response format: {str(data)[:200]}")
            return [_dev_embedding(t) for t in texts]
        except Exception as e:
            logger.error(f"HuggingFace embedding error: {e}")
            raise

    @staticmethod
    def _embed_sentence_transformers(texts, model) -> List[List[float]]:
        """Local SentenceTransformers — no API key required."""
        try:
            from sentence_transformers import SentenceTransformer
            st_model = SentenceTransformer(model)
            embeddings = st_model.encode(texts, normalize_embeddings=True)
            result = []
            for emb in embeddings:
                emb = emb.tolist()
                if len(emb) < _VECTOR_DIM:
                    emb = emb + [0.0] * (_VECTOR_DIM - len(emb))
                elif len(emb) > _VECTOR_DIM:
                    emb = emb[:_VECTOR_DIM]
                result.append(emb)
            return result
        except ImportError:
            logger.error("sentence-transformers is not installed. Run: pip install sentence-transformers")
            return [_dev_embedding(t) for t in texts]
        except Exception as e:
            logger.error(f"SentenceTransformers error: {e}")
            raise
