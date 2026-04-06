"""
LLM Runner - Handles interaction with language models.

Reads provider, model, and API key from the AIProviderConfig DB record
(configured by the Platform Owner via the AI Settings UI).

Supported providers:
  - openai       → OpenAI Chat Completions API
  - huggingface  → HuggingFace Inference API (free tier available)
  - anthropic    → Anthropic Claude API
  - ollama       → Ollama local inference (no key required)
  - local        → Local transformers pipeline (TinyLlama, no API key)

Falls back to a rich contextual dev-mode mock when no API key is set.
"""
import json
import logging
from typing import List, Dict, Any, Generator

logger = logging.getLogger(__name__)

# Module-level cache for local transformers pipelines.
# Key: "{model_id}:{device}". Avoids reloading model weights on every request.
_LOCAL_PIPELINE_CACHE: Dict[str, Any] = {}

_PLACEHOLDER_KEYS = {'', 'your-openai-api-key-here', 'sk-...', 'OPENAI_API_KEY',
                     'your-hf-api-key', 'your-anthropic-api-key'}


def _is_placeholder(key: str) -> bool:
    return not key or key.strip() in _PLACEHOLDER_KEYS


def _load_config():
    """Load AIProviderConfig from DB with graceful fallback to settings."""
    try:
        from apps.core.models import AIProviderConfig
        return AIProviderConfig.get_config()
    except Exception as e:
        logger.warning(f"Could not load AIProviderConfig from DB: {e}. Using settings.py defaults.")
        return None


class LLMRunner:
    """
    Runner for language model inference.
    Provider, model, and API key are loaded dynamically from the DB.
    """

    def __init__(self, provider: str = None, model: str = None):
        from django.conf import settings

        db_cfg = _load_config()

        if db_cfg:
            self.provider = (provider or db_cfg.llm_provider or 'openai').lower()
            self.model = model or db_cfg.llm_model or 'gpt-3.5-turbo'
            self.api_key = '' if _is_placeholder(db_cfg.llm_api_key) else db_cfg.llm_api_key
            self.api_base = db_cfg.llm_api_base or ''
            self.max_tokens = db_cfg.max_tokens_per_request or 1000
        else:
            # Hard fallback to settings.py
            self.provider = (provider or getattr(settings, 'LLM_PROVIDER', 'openai')).lower()
            self.model = model or getattr(settings, 'LLM_MODEL', 'gpt-3.5-turbo')
            raw_key = getattr(settings, 'OPENAI_API_KEY', '')
            self.api_key = '' if _is_placeholder(raw_key) else raw_key
            self.api_base = ''
            self.max_tokens = 1000

    # ─── Public API ───────────────────────────────────────────
    def generate_response(self, query: str, context: List[Dict[str, Any]],
                          chat_history: List[Dict[str, str]] = None) -> str:
        context_str = self._format_context(context)
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(context_str, query)

        messages = [{"role": "system", "content": system_prompt}]
        if chat_history:
            for msg in chat_history[-10:]:
                if msg.get('role') in ('user', 'assistant'):
                    messages.append({"role": msg['role'], "content": msg.get('content', '')})
        messages.append({"role": "user", "content": user_prompt})

        dispatch = {
            'openai':      self._generate_openai,
            'huggingface': self._generate_huggingface,
            'anthropic':   self._generate_anthropic,
            'ollama':      self._generate_ollama,
            'local':       self._generate_local,
        }
        fn = dispatch.get(self.provider)
        if fn:
            return fn(messages, context=context, query=query)
        return "LLM provider not configured or unsupported."

    def generate_response_stream(self, query: str, context: List[Dict[str, Any]],
                                 chat_history: List[Dict[str, str]] = None) -> Generator[str, None, None]:
        context_str = self._format_context(context)
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(context_str, query)

        messages = [{"role": "system", "content": system_prompt}]
        if chat_history:
            for msg in chat_history[-10:]:
                if msg.get('role') in ('user', 'assistant'):
                    messages.append({"role": msg['role'], "content": msg.get('content', '')})
        messages.append({"role": "user", "content": user_prompt})

        dispatch = {
            'openai':      self._stream_openai,
            'huggingface': self._stream_huggingface,
            'anthropic':   self._stream_anthropic,
            'ollama':      self._stream_ollama,
            'local':       self._stream_local,
        }
        fn = dispatch.get(self.provider)
        if fn:
            yield from fn(messages, context=context, query=query)
        else:
            yield "LLM provider not configured or unsupported."

    # ─── Prompt builders ─────────────────────────────────────
    def _format_context(self, context: List[Dict[str, Any]]) -> str:
        if not context:
            return "No relevant documents found."
        max_chars = 1200
        try:
            from django.conf import settings
            max_chars = int(getattr(settings, 'RAG_SOURCE_TEXT_MAX_CHARS', 1200))
        except Exception:
            pass
        parts = []
        for i, chunk in enumerate(context[:5], 1):
            text = chunk.get('full_text') or chunk.get('text', '')
            title = chunk.get('document_title', 'Unknown')
            parts.append(f"[{i}] Source: {title}\n{text[:max_chars]}")
        return "\n\n---\n\n".join(parts)

    def _build_system_prompt(self) -> str:
        return (
            "You are a helpful AI assistant for a company knowledge base. "
            "Answer questions based ONLY on the provided context. "
            "If the context does not contain enough information, say so. "
            "Always cite document sources in your answer."
        )

    def _build_user_prompt(self, context_str: str, query: str) -> str:
        return (
            f"CONTEXT:\n{context_str}\n\n"
            f"QUESTION: {query}\n\n"
            "ANSWER:"
        )

    # ─── Dev-mode mock ────────────────────────────────────────
    def _mock_response(self, context: List[Dict[str, Any]], query: str) -> str:
        if not context:
            return (
                "⚠️ **Dev Mode** – No relevant documents found in your accessible document set. "
                "Please upload documents and ensure they are fully processed."
            )
        sources, seen = [], set()
        for chunk in context:
            t = chunk.get('document_title', 'Unknown Document')
            if t not in seen:
                sources.append(t); seen.add(t)
        preview = context[0].get('full_text', context[0].get('text', ''))[:300]
        provider_note = f"provider=**{self.provider}**, model=**{self.model}**"
        return (
            f"⚠️ **Dev Mode Response** ({provider_note} — no API key configured)\n\n"
            f"Your question: *{query}*\n\n"
            f"Based on {len(context)} retrieved chunk(s) from: {', '.join(repr(s) for s in sources)}\n\n"
            f"**Excerpt from top result:**\n> {preview}...\n\n"
            f"To get real AI responses, set the API key via **Platform → AI Configuration**."
        )

    # ─── OpenAI ──────────────────────────────────────────────
    def _generate_openai(self, messages, context=None, query='') -> str:
        if not self.api_key:
            return self._mock_response(context or [], query)
        try:
            import openai
            try:
                client = openai.OpenAI(api_key=self.api_key, base_url=self.api_base or None)
            except TypeError:
                # OpenAI SDK version mismatch (e.g., unexpected 'proxies' kwarg).
                # Fall back to mock response so the pipeline still returns a result.
                logger.warning("OpenAI client init failed (SDK version mismatch). Using dev mock.")
                return self._mock_response(context or [], query)
            resp = client.chat.completions.create(
                model=self.model, messages=messages,
                temperature=0.7, max_tokens=self.max_tokens
            )
            return resp.choices[0].message.content
        except Exception as e:
            logger.error(f"OpenAI error: {e}")
            return self._mock_response(context or [], query)

    def _stream_openai(self, messages, context=None, query='') -> Generator[str, None, None]:
        if not self.api_key:
            yield from (w + ' ' for w in self._mock_response(context or [], query).split())
            return
        try:
            import openai
            try:
                client = openai.OpenAI(api_key=self.api_key, base_url=self.api_base or None)
            except TypeError:
                logger.warning("OpenAI client init failed (SDK version mismatch). Using dev mock.")
                yield from (w + ' ' for w in self._mock_response(context or [], query).split())
                return
            for chunk in client.chat.completions.create(
                model=self.model, messages=messages,
                temperature=0.7, max_tokens=self.max_tokens, stream=True
            ):
                content = chunk.choices[0].delta.content
                if content:
                    yield content
        except Exception as e:
            logger.error(f"OpenAI stream error: {e}")
            yield from (w + ' ' for w in self._mock_response(context or [], query).split())


    # ─── HuggingFace Inference API ────────────────────────────
    def _generate_huggingface(self, messages, context=None, query='') -> str:
        try:
            import requests as req
            base = self.api_base or f"https://api-inference.huggingface.co/models/{self.model}"
            prompt = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in messages) + "\nASSISTANT:"
            headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
            resp = req.post(base, headers=headers,
                            json={"inputs": prompt, "parameters": {"max_new_tokens": self.max_tokens}},
                            timeout=60)
            if resp.status_code in (401, 403):
                # If unauthenticated, fallback to a local transformers pipeline to fulfill the promise of free AI.
                return self._generate_local_hf(prompt, context, query)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list) and data:
                return data[0].get('generated_text', str(data[0]))
            return str(data)
        except Exception as e:
            logger.error(f"HuggingFace inference API error: {e}")
            return self._generate_local_hf(prompt if 'prompt' in locals() else query, context, query)

    @staticmethod
    def _best_device() -> str:
        """Return 'mps' on Apple Silicon, else 'cpu'."""
        try:
            import torch
            if torch.backends.mps.is_available():
                return 'mps'
        except Exception:
            pass
        return 'cpu'

    def _generate_local_hf(self, prompt: str, context: List[Dict[str, Any]], query: str) -> str:
        """Fallback to local HuggingFace inference using transformers if the remote API fails/blocks."""
        return self._run_local_pipeline(context, query, device=self._best_device())

    def _run_local_pipeline(self, context: List[Dict[str, Any]], query: str, device: str = 'cpu') -> str:
        """Run TinyLlama (or configured small model) via local transformers pipeline.
        The pipeline is cached at module level so the model is only loaded once.
        """
        try:
            from transformers import pipeline as hf_pipeline

            # Use the configured model only if it looks small enough for local inference;
            # otherwise fall back to the pre-cached TinyLlama 1.1B chat model.
            local_model = (
                self.model
                if any(tag in self.model.lower() for tag in ('tiny', 'mini', 'small', '1b', '3b'))
                else 'TinyLlama/TinyLlama-1.1B-Chat-v1.0'
            )

            cache_key = f"{local_model}:{device}"
            if cache_key not in _LOCAL_PIPELINE_CACHE:
                logger.info(f"Loading local model '{local_model}' on {device} (first load)")
                # Use AutoModel directly with local_files_only to avoid network calls,
                # then wrap in a pipeline.
                import os as _os
                from transformers import AutoModelForCausalLM, AutoTokenizer
                tokenizer = AutoTokenizer.from_pretrained(local_model, local_files_only=True)
                model_obj = AutoModelForCausalLM.from_pretrained(local_model, local_files_only=True)
                _LOCAL_PIPELINE_CACHE[cache_key] = hf_pipeline(
                    'text-generation', model=model_obj, tokenizer=tokenizer, device=device,
                )
            else:
                logger.debug(f"Using cached local model '{local_model}' on {device}")

            pipe = _LOCAL_PIPELINE_CACHE[cache_key]

            local_prompt = (
                f"<|system|>\nYou are a helpful AI assistant. Answer the question based ONLY on the "
                f"provided context. Be concise and cite sources when possible.\n"
                f"Context:\n{self._format_context(context)}</s>\n"
                f"<|user|>\n{query}</s>\n"
                f"<|assistant|>\n"
            )
            out = pipe(local_prompt, max_new_tokens=min(self.max_tokens, 50), return_full_text=False)
            return out[0]['generated_text'].strip()
        except Exception as ex:
            logger.error(f"Local pipeline failed on {device}: {ex}")
            return self._mock_response(context or [], query)

    def _stream_huggingface(self, messages, context=None, query='') -> Generator[str, None, None]:
        """HuggingFace streaming via text-generation-inference SSE."""
        try:
            import requests as req
            base = self.api_base or f"https://api-inference.huggingface.co/models/{self.model}"
            prompt = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in messages) + "\nASSISTANT:"
            headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
            
            # Try SSE endpoint first (available on dedicated TGI endpoints).
            resp = req.post(
                base + "/generate_stream",
                headers=headers,
                json={"inputs": prompt, "parameters": {"max_new_tokens": self.max_tokens}},
                stream=True,
                timeout=60,
            )

            # Standard HF Inference API often doesn't expose /generate_stream.
            # In that case, call the non-stream endpoint and pseudo-stream words.
            if resp.status_code == 404:
                non_stream = req.post(
                    base,
                    headers=headers,
                    json={"inputs": prompt, "parameters": {"max_new_tokens": self.max_tokens}},
                    timeout=60,
                )
                if non_stream.status_code in (401, 403):
                    yield from self._stream_local_hf(query, context, messages)
                    return
                non_stream.raise_for_status()
                data = non_stream.json()
                if isinstance(data, list) and data:
                    generated = data[0].get('generated_text', '')
                else:
                    generated = str(data)
                for word in generated.split(' '):
                    if word:
                        yield word + ' '
                return

            if resp.status_code in (401, 403):
                yield from self._stream_local_hf(query, context, messages)
                return

            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                decoded = line.decode('utf-8')
                if not decoded.startswith('data:'):
                    continue
                try:
                    payload = json.loads(decoded[5:])
                    token = payload.get('token', {}).get('text', '')
                    if token:
                        yield token
                    if payload.get('generated_text') is not None:
                        break
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"HuggingFace stream error: {e}")
            yield from self._stream_local_hf(query, context, messages)

    def _stream_local_hf(self, query: str, context: List[Dict[str, Any]], messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        """Streaming fallback using local transformers. Runs synchronously; yields word-by-word."""
        try:
            logger.info("Starting synchronous local HF generation for stream...")
            full_text = self._run_local_pipeline(context, query, device=self._best_device())
            # Simulate token streaming word-by-word
            words = full_text.split(' ')
            for i, word in enumerate(words):
                yield word + (' ' if i < len(words) - 1 else '')
        except Exception as ex:
            logger.error(f"Local HF streaming fallback failed: {ex}")
            yield from (w + ' ' for w in self._mock_response(context or [], query).split())

    # ─── Local (transformers, no API) ────────────────────────
    def _generate_local(self, messages, context=None, query='') -> str:
        """
        Dedicated 'local' provider: run TinyLlama (or configured small model)
        directly via transformers — no external API calls, no API key required.
        Always uses CPU to guarantee thread safety inside Django request workers.
        """
        return self._run_local_pipeline(context or [], query, device=self._best_device())

    def _stream_local(self, messages, context=None, query='') -> Generator[str, None, None]:
        """Stream from local transformers model, word-by-word."""
        full_text = self._run_local_pipeline(context or [], query, device=self._best_device())
        words = full_text.split(' ')
        for i, word in enumerate(words):
            yield word + (' ' if i < len(words) - 1 else '')

    # ─── Anthropic ───────────────────────────────────────────
    def _generate_anthropic(self, messages, context=None, query='') -> str:
        if not self.api_key:
            return self._mock_response(context or [], query)
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self.api_key)
            system = next((m['content'] for m in messages if m['role'] == 'system'), '')
            chat_msgs = [m for m in messages if m['role'] != 'system']
            resp = client.messages.create(
                model=self.model, max_tokens=self.max_tokens,
                system=system, messages=chat_msgs
            )
            return resp.content[0].text
        except Exception as e:
            logger.error(f"Anthropic error: {e}")
            return f"Anthropic error: {e}"

    def _stream_anthropic(self, messages, context=None, query='') -> Generator[str, None, None]:
        if not self.api_key:
            yield from (w + ' ' for w in self._mock_response(context or [], query).split())
            return
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self.api_key)
            system = next((m['content'] for m in messages if m['role'] == 'system'), '')
            chat_msgs = [m for m in messages if m['role'] != 'system']
            with client.messages.stream(
                model=self.model, max_tokens=self.max_tokens,
                system=system, messages=chat_msgs
            ) as stream:
                for text in stream.text_stream:
                    yield text
        except Exception as e:
            logger.error(f"Anthropic stream error: {e}")
            yield f"Error: {e}"

    # ─── Ollama (local) ──────────────────────────────────────
    def _generate_ollama(self, messages, context=None, query='') -> str:
        base = self.api_base or 'http://localhost:11434'
        try:
            import requests as req
            prompt = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in messages) + "\nASSISTANT:"
            resp = req.post(f"{base}/api/generate",
                            json={"model": self.model, "prompt": prompt, "stream": False},
                            timeout=120)
            resp.raise_for_status()
            return resp.json().get('response', '')
        except Exception as e:
            logger.error(f"Ollama error: {e}")
            return f"Ollama error (is it running at {base}?): {e}"

    def _stream_ollama(self, messages, context=None, query='') -> Generator[str, None, None]:
        base = self.api_base or 'http://localhost:11434'
        try:
            import requests as req
            prompt = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in messages) + "\nASSISTANT:"
            with req.post(f"{base}/api/generate",
                          json={"model": self.model, "prompt": prompt, "stream": True},
                          stream=True, timeout=120) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if line:
                        try:
                            payload = json.loads(line.decode('utf-8'))
                            token = payload.get('response', '')
                            if token:
                                yield token
                            if payload.get('done'):
                                break
                        except Exception:
                            pass
        except Exception as e:
            logger.error(f"Ollama stream error: {e}")
            yield f"Error: {e}"
