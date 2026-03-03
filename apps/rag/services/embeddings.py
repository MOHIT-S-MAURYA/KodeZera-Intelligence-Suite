"""
Embedding generation service.

Provider is resolved at runtime from the AIProviderConfig DB record.
Supported providers:

  openai               → OpenAI Embeddings API (dim=1536 for text-embedding-3-small)
  huggingface          → HuggingFace Inference API (feature-extraction pipeline)
  sentence_transformers→ Local SentenceTransformers — 🌟 DEFAULT — no API key, runs offline
  dev                  → Deterministic pseudo-embeddings (pipeline testing only)

The dimension produced by this service MUST match settings.VECTOR_DIMENSION so
Qdrant uses the correct collection size. Update both together when you change the
embedding model.

Default (out-of-the-box):
  provider = sentence_transformers
  model    = all-MiniLM-L6-v2   (384 dimensions, fast, good quality)
  dim      = 384
"""
import hashlib
import math
import logging
from typing import List

logger = logging.getLogger(__name__)

# ── Dimension must match settings.VECTOR_DIMENSION ─────────────────────────────
# SentenceTransformers all-MiniLM-L6-v2  → 384
# OpenAI text-embedding-3-small           → 1536
# OpenAI text-embedding-ada-002           → 1536
_DEFAULT_PROVIDER = 'sentence_transformers'
_DEFAULT_ST_MODEL = 'all-MiniLM-L6-v2'
_DEFAULT_DIM = 384          # matches settings.VECTOR_DIMENSION default

_PLACEHOLDER_KEYS = {'', 'your-openai-api-key-here', 'sk-...', 'OPENAI_API_KEY',
                     'your-hf-api-key'}


def _is_placeholder(key: str) -> bool:
    return not key or key.strip() in _PLACEHOLDER_KEYS


def _dev_embedding(text: str, dim: int = _DEFAULT_DIM) -> List[float]:
    """
    Deterministic pseudo-embedding used only when provider=='dev'.
    NOT semantically meaningful — purely for pipeline smoke-testing.
    """
    digest = hashlib.sha256(text.encode()).hexdigest()
    seed = int(digest[:8], 16)
    vector = [math.sin(seed * (i + 1) * 0.0001) for i in range(dim)]
    magnitude = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / magnitude for v in vector]


def _load_config():
    try:
        from apps.core.models import AIProviderConfig
        return AIProviderConfig.get_config()
    except Exception as e:
        logger.warning(f"Could not load AIProviderConfig: {e}. Using defaults.")
        return None


class EmbeddingService:
    """
    Embedding service — provider and model resolved from AIProviderConfig (DB) at call-time.
    Falls back to SentenceTransformers (local, no API key) when not configured.
    """

    @staticmethod
    def generate_embedding(text: str) -> List[float]:
        return EmbeddingService._embed([text])[0]

    @staticmethod
    def generate_embeddings_batch(texts: List[str]) -> List[List[float]]:
        return EmbeddingService._embed(texts)

    @staticmethod
    def _embed(texts: List[str]) -> List[List[float]]:
        from django.conf import settings
        cfg = _load_config()

        # ── Resolve provider / model / key ────────────────────────────────────
        if cfg:
            provider = (cfg.embedding_provider or _DEFAULT_PROVIDER).lower()
            model    = cfg.embedding_model    or _DEFAULT_ST_MODEL
            api_key  = '' if _is_placeholder(cfg.embedding_api_key) else cfg.embedding_api_key
            api_base = cfg.embedding_api_base or ''
        else:
            provider = getattr(settings, 'EMBEDDING_PROVIDER', _DEFAULT_PROVIDER).lower()
            model    = getattr(settings, 'EMBEDDING_MODEL', _DEFAULT_ST_MODEL)
            raw_key  = getattr(settings, 'OPENAI_API_KEY', '')
            api_key  = '' if _is_placeholder(raw_key) else raw_key
            api_base = ''

        # ── Expected dimension from settings ──────────────────────────────────
        dim = getattr(settings, 'VECTOR_DIMENSION', _DEFAULT_DIM)

        logger.debug(
            f"EmbeddingService: provider={provider}, model={model}, "
            f"key={'set' if api_key else 'NOT SET'}, dim={dim}"
        )

        dispatch = {
            'sentence_transformers': EmbeddingService._embed_sentence_transformers,
            'openai':                EmbeddingService._embed_openai,
            'huggingface':           EmbeddingService._embed_huggingface,
            'dev':                   lambda t, m, k, b: [_dev_embedding(x, dim) for x in t],
        }

        fn = dispatch.get(provider)
        if fn is None:
            logger.warning(f"Unknown embedding provider '{provider}'. Using SentenceTransformers.")
            fn = EmbeddingService._embed_sentence_transformers

        embeddings = fn(texts, model, api_key, api_base)

        # ── Sanity-check dimension of every embedding ─────────────────────────
        validated = []
        for emb in embeddings:
            if len(emb) < dim:
                emb = emb + [0.0] * (dim - len(emb))
            elif len(emb) > dim:
                emb = emb[:dim]
                mag = math.sqrt(sum(v * v for v in emb)) or 1.0
                emb = [v / mag for v in emb]
            validated.append(emb)

        return validated

    # ─── Sentence Transformers (LOCAL, no API key) ────────────────────────────

    @staticmethod
    def _embed_sentence_transformers(texts, model, api_key, api_base) -> List[List[float]]:
        """
        Local embedding via the sentence-transformers library.
        Downloads the model on first use (~90 MB for all-MiniLM-L6-v2).
        Subsequent calls use the cached model.
        """
        try:
            from sentence_transformers import SentenceTransformer
            # Use a module-level cache to avoid reloading the model on every call
            cache_attr = f'_st_model_{model.replace("/", "_").replace("-", "_")}'
            if not hasattr(EmbeddingService, cache_attr):
                logger.info(f"EmbeddingService: loading SentenceTransformer model '{model}'...")
                setattr(EmbeddingService, cache_attr, SentenceTransformer(model))
                logger.info(f"EmbeddingService: model '{model}' loaded.")
            st_model = getattr(EmbeddingService, cache_attr)
            embeddings = st_model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
            return [emb.tolist() for emb in embeddings]
        except ImportError:
            logger.error(
                "sentence-transformers is not installed. "
                "Run: pip install sentence-transformers"
            )
            from django.conf import settings
            dim = getattr(settings, 'VECTOR_DIMENSION', _DEFAULT_DIM)
            return [_dev_embedding(t, dim) for t in texts]
        except Exception as e:
            logger.error(f"SentenceTransformers error: {e}")
            raise

    # ─── OpenAI ──────────────────────────────────────────────────────────────

    @staticmethod
    def _embed_openai(texts, model, api_key, api_base) -> List[List[float]]:
        if not api_key:
            logger.warning("OpenAI embedding: no API key → falling back to SentenceTransformers.")
            return EmbeddingService._embed_sentence_transformers(
                texts, _DEFAULT_ST_MODEL, '', ''
            )
        try:
            import openai
            client = openai.OpenAI(api_key=api_key, base_url=api_base or None)
            response = client.embeddings.create(model=model, input=texts)
            return [item.embedding for item in response.data]
        except Exception as e:
            logger.error(f"OpenAI embedding error: {e}")
            raise

    # ─── HuggingFace Inference API ────────────────────────────────────────────

    @staticmethod
    def _embed_huggingface(texts, model, api_key, api_base) -> List[List[float]]:
        if not api_key:
            logger.warning("HuggingFace embedding: no API key → falling back to SentenceTransformers.")
            return EmbeddingService._embed_sentence_transformers(
                texts, _DEFAULT_ST_MODEL, '', ''
            )
        try:
            import requests as req
            from django.conf import settings
            dim = getattr(settings, 'VECTOR_DIMENSION', _DEFAULT_DIM)
            url = api_base or f"https://api-inference.huggingface.co/pipeline/feature-extraction/{model}"
            headers = {"Authorization": f"Bearer {api_key}"}
            resp = req.post(url, headers=headers, json={"inputs": texts}, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list) and data and isinstance(data[0], list):
                result = []
                for emb in data:
                    # Clip/pad handled in _embed(); just L2-normalise here
                    mag = math.sqrt(sum(v * v for v in emb)) or 1.0
                    result.append([v / mag for v in emb])
                return result
            logger.error(f"Unexpected HuggingFace response format: {str(data)[:200]}")
            return [_dev_embedding(t, dim) for t in texts]
        except Exception as e:
            logger.error(f"HuggingFace embedding error: {e}")
            raise
