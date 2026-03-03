"""
LLM Runner - Handles interaction with language models.

Reads provider, model, and API key from the AIProviderConfig DB record
(configured by the Platform Owner via the AI Settings UI).

Supported providers:
  - openai       → OpenAI Chat Completions API
  - huggingface  → HuggingFace Inference API (free tier available)
  - anthropic    → Anthropic Claude API
  - ollama       → Ollama local inference (no key required)

Falls back to a rich contextual dev-mode mock when no API key is set.
"""
import json
import logging
from typing import List, Dict, Any, Generator

logger = logging.getLogger(__name__)

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
        parts = []
        for i, chunk in enumerate(context[:5], 1):
            text = chunk.get('full_text') or chunk.get('text', '')
            title = chunk.get('document_title', 'Unknown')
            parts.append(f"[{i}] Source: {title}\n{text[:800]}")
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
        if not self.api_key:
            return self._mock_response(context or [], query)
        try:
            import requests as req
            base = self.api_base or f"https://api-inference.huggingface.co/models/{self.model}"
            prompt = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in messages) + "\nASSISTANT:"
            headers = {"Authorization": f"Bearer {self.api_key}"}
            resp = req.post(base, headers=headers,
                            json={"inputs": prompt, "parameters": {"max_new_tokens": self.max_tokens}},
                            timeout=60)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list) and data:
                return data[0].get('generated_text', str(data[0]))
            return str(data)
        except Exception as e:
            logger.error(f"HuggingFace error: {e}")
            return f"HuggingFace error: {e}"

    def _stream_huggingface(self, messages, context=None, query='') -> Generator[str, None, None]:
        """HuggingFace streaming via text-generation-inference SSE."""
        if not self.api_key:
            yield from (w + ' ' for w in self._mock_response(context or [], query).split())
            return
        try:
            import requests as req
            base = self.api_base or f"https://api-inference.huggingface.co/models/{self.model}"
            prompt = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in messages) + "\nASSISTANT:"
            headers = {"Authorization": f"Bearer {self.api_key}"}
            with req.post(
                base + "/generate_stream",
                headers=headers,
                json={"inputs": prompt, "parameters": {"max_new_tokens": self.max_tokens}},
                stream=True, timeout=60
            ) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if line:
                        decoded = line.decode('utf-8')
                        if decoded.startswith('data:'):
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
            yield f"Error: {e}"

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
