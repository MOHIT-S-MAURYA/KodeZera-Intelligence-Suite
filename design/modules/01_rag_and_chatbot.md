# RAG System — Complete Analysis Report

**Date:** 10 March 2026  
**Scope:** Full analysis of the Retrieval-Augmented Generation pipeline  
**Goal:** Identify strengths, weaknesses, gaps, and a roadmap to "Opus-level" chatbot quality

---

## 1. System Overview

### Architecture Summary

The RAG system spans **14 files** across 4 Django apps + 2 frontend files:

| Layer                  | Files                                                                                                                     | Purpose                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Document Ingestion** | `documents/tasks.py`, `rag/services/document_processing.py`, `rag/services/embeddings.py`, `rag/services/vector_store.py` | Extract → Clean → Chunk → Embed → Store                                           |
| **Query Pipeline**     | `rag/services/rag_pipeline.py`, `rag/services/retriever.py`, `rag/services/rag_query.py`                                  | Access check → Embed query → Vector search → Context expand → LLM generate        |
| **LLM Generation**     | `rag/services/llm_runner.py`                                                                                              | Multi-provider LLM dispatch (OpenAI, Anthropic, Ollama, HuggingFace, Local, Mock) |
| **Models**             | `rag/models.py`, `documents/models.py`                                                                                    | VectorChunk, ChatSession, ChatMessage, ChatFolder, Document, DocumentAccess       |
| **API**                | `api/views/rag.py`, `api/views/chat.py`                                                                                   | SSE streaming endpoint, session/folder CRUD                                       |
| **Frontend**           | `pages/Chat.tsx`, `services/rag.service.ts`                                                                               | 1500+ line chat UI, SSE stream consumer                                           |

### Data Flow

```
User types question
    │
    ▼
[Rate Limit: 10/min] → [Tenant Quota: 500/day]
    │
    ▼
[Get/Create ChatSession] → Save user message to DB
    │
    ▼
[DocumentAccessService] → 5-rule RBAC resolution (cached 15m in Redis)
    │  ├─ Public docs (visibility=public, status=completed)
    │  ├─ User's own uploads
    │  ├─ Role-based grants (DocumentAccess type=role)
    │  ├─ Department grants (including ancestor departments)
    │  └─ User-specific grants
    │
    ▼
[EmbeddingService] → Embed question (same model as ingestion)
    │
    ▼
[VectorStoreService.search_vectors()] → Qdrant ANN search, COSINE, top_k=5
    │  Filter: tenant_id + accessible_doc_ids (MatchAny)
    │
    ▼
[Context Window Expansion] → Fetch ±1 surrounding chunks → merge full_text
    │
    ▼
[Confidence Scoring] → >0.85=high, >0.75=medium, <0.75=low
    │
    ▼
[LLMRunner.generate_response_stream()] → System prompt + context + 10-msg history
    │  SSE: metadata first, then token-by-token chunks, then done signal
    │
    ▼
[Save ChatMessage + sources] → [AuditLog entry]
    │
    ▼
[Frontend renders streamed markdown]
```

---

## 2. Component Deep-Dive

### 2.1 Document Processing (`document_processing.py`)

| Aspect                | Current State                                                      |
| --------------------- | ------------------------------------------------------------------ |
| **Formats**           | PDF (PyPDF2), DOCX (python-docx), TXT                              |
| **Text cleaning**     | Whitespace normalization, null-byte removal only                   |
| **Chunking strategy** | Fixed token window: 500 tokens, 50 overlap, tiktoken `cl100k_base` |
| **Chunk metadata**    | `text`, `chunk_index`, `token_count`, `start_token`, `end_token`   |

**Assessment:** Basic but functional. No semantic chunking, no table/image handling, no OCR.

### 2.2 Embedding Service (`embeddings.py`)

| Aspect                 | Current State                                                         |
| ---------------------- | --------------------------------------------------------------------- |
| **Default provider**   | SentenceTransformers `all-MiniLM-L6-v2` (384-dim) — local, no API key |
| **Alternatives**       | OpenAI (1536-dim), HuggingFace Inference API                          |
| **Fallback chain**     | Configured → SentenceTransformers → Dev pseudo-embeddings             |
| **Model caching**      | Module-level attribute cache per model name                           |
| **Dimension handling** | Pad/truncate + re-normalize if dimension mismatch                     |

**Assessment:** Good provider abstraction. Dimension mismatch guard is smart. But no embedding caching for repeated texts.

### 2.3 Vector Store (`vector_store.py`)

| Aspect                | Current State                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| **Database**          | Qdrant (local path / remote / in-memory fallback)                                                 |
| **Singleton**         | Thread-safe module-level `_QDRANT_CLIENT` with double-checked locking                             |
| **Distance metric**   | COSINE                                                                                            |
| **Stored payload**    | `tenant_id`, `document_id`, `department_id`, `classification_level`, `chunk_index`, `text[:1000]` |
| **Filtering**         | `tenant_id` (MatchValue) + `document_ids` (MatchAny)                                              |
| **Context expansion** | `get_chunks_by_index()` via scroll with filter                                                    |

**Assessment:** Solid singleton pattern. Payload-based filtering is correct. However: no HNSW index tuning, no payload indexing, no batch search, single collection for all tenants.

### 2.4 Retriever (`retriever.py`)

| Aspect                  | Current State                                           |
| ----------------------- | ------------------------------------------------------- |
| **Primary retrieval**   | Single dense vector search, top_k=5                     |
| **Context expansion**   | ±1 chunk window (configurable via `RAG_CONTEXT_WINDOW`) |
| **Re-ranking**          | None                                                    |
| **Hybrid search**       | None (no sparse/keyword component)                      |
| **Confidence**          | >0.85=high, >0.75=medium, else low                      |
| **Metadata enrichment** | Fetches document title + file_type from DB              |

**Assessment:** Simplest possible retrieval. No re-ranking, no hybrid search, no MMR diversity.

### 2.5 LLM Runner (`llm_runner.py`)

| Aspect              | Current State                                                                     |
| ------------------- | --------------------------------------------------------------------------------- |
| **Providers**       | OpenAI, Anthropic, Ollama, HuggingFace, Local (TinyLlama), Dev Mock               |
| **Prompt template** | Fixed system prompt + `CONTEXT:\n{chunks}\n\nQUESTION:\n...\n\nANSWER:`           |
| **History**         | Last 10 messages from chat history appended to messages                           |
| **Streaming**       | True SSE streaming for OpenAI/Anthropic/Ollama; word-by-word simulation for local |
| **Temperature**     | 0.7 fixed                                                                         |
| **Max tokens**      | From DB config or 1000 default                                                    |
| **Fallback**        | Every provider falls back to mock if no API key                                   |

**Assessment:** Excellent provider coverage with graceful fallback chain. But: no function calling, no structured output, no guardrails, no prompt engineering for citations.

### 2.6 RAG Pipeline (`rag_pipeline.py`)

| Aspect                 | Current State                                                   |
| ---------------------- | --------------------------------------------------------------- |
| **Orchestration**      | Linear: access → retrieve → generate → save                     |
| **History cap**        | 20 messages (DB query) → 10 sent to LLM                         |
| **Session management** | Get-or-create by UUID, auto-title "New Chat"                    |
| **Source dedup**       | Per-document dedup, keeps highest score                         |
| **Error handling**     | Custom exceptions: `LLMServiceError`, `DocumentProcessingError` |

**Assessment:** Clean orchestration. History windowing is sensible. But no query rewriting, no answer validation, no citation verification.

### 2.7 Frontend (`Chat.tsx` + `rag.service.ts`)

| Aspect             | Current State                                                          |
| ------------------ | ---------------------------------------------------------------------- |
| **Component size** | 1500+ lines (monolithic)                                               |
| **SSE handling**   | ReadableStream with manual buffer parsing                              |
| **Features**       | Folders, sessions, search, drag-and-drop, inline rename, context menus |
| **State**          | All local useState (no external store)                                 |
| **Markdown**       | Streamed answer rendered as markdown                                   |

**Assessment:** Feature-rich UI but monolithic. No abort controller for cancelled queries, no retry logic, no optimistic rendering.

---

## 3. SWOT Analysis

### Strengths

| #   | Strength                        | Evidence                                                                                                                                                 |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **Multi-provider architecture** | 5 LLM providers + 4 embedding providers with automatic fallback chains. Can run fully offline (SentenceTransformers + TinyLlama + Qdrant local).         |
| S2  | **RBAC-integrated retrieval**   | 5-rule document access resolution (public, own, role, dept, user grants) with Redis caching. Tenant data is cryptographically isolated by Qdrant filter. |
| S3  | **Real SSE streaming**          | True token-by-token streaming for OpenAI/Anthropic/Ollama. Metadata (sources) sent before answer starts.                                                 |
| S4  | **Graceful degradation**        | No API key? → Mock response with retrieved context preview. OpenAI SDK error? → Fall back to local model. HF rate-limited? → TinyLlama CPU.              |
| S5  | **Context window expansion**    | ±N surrounding chunks merged for richer context, avoiding the "truncated mid-sentence" problem.                                                          |
| S6  | **Production safeguards**       | Rate limiting (10/min/user), tenant daily quota (500/day), upload rate limit (20/h), audit logging, max file size check.                                 |
| S7  | **Chat management**             | Persistent sessions with history, folders, rename, drag-and-drop — full ChatGPT-style UX.                                                                |
| S8  | **Async document processing**   | Celery with retry (max 3), separate embedding queue, status tracking (pending → processing → completed/failed).                                          |
| S9  | **Dimension safety**            | Embedding dimension auto-validated: pad if too short, truncate+renormalize if too long.                                                                  |
| S10 | **Clean separation**            | 7 service files with single responsibilities: processing, embedding, vector store, retriever, LLM, pipeline, query.                                      |

### Weaknesses

| #   | Weakness                                      | Impact                                                                                                                             | Current Code                                                                    |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| W1  | **No hybrid search (sparse + dense)**         | Pure semantic search misses exact keyword matches (e.g., "Policy HR-2024-07" returns nothing if embedding doesn't capture the ID). | `retriever.py` — only `search_vectors()`, no BM25/keyword component             |
| W2  | **No re-ranking**                             | Top-5 chunks by raw cosine may not be the most _answer-relevant_. Cross-encoder re-ranking typically improves quality 15-25%.      | `retriever.py` — results returned as-is from Qdrant                             |
| W3  | **Fixed 500-token chunking**                  | One-size-fits-all chunking. No awareness of document structure (headings, paragraphs, tables, lists). Splits mid-paragraph.        | `document_processing.py` line 102 — `self.chunk_size = settings.RAG_CHUNK_SIZE` |
| W4  | **No query rewriting/expansion**              | User's first message is embedded as-is. Typos, vague queries, and pronouns referring to chat history are not resolved.             | `rag_pipeline.py` — `query_text` passed directly to retriever                   |
| W5  | **Naive prompt template**                     | Single static system prompt with no role differentiation, no few-shot examples, no explicit citation format.                       | `llm_runner.py` `_build_system_prompt()` — 3-sentence generic prompt            |
| W6  | **Context truncated to 800 chars per chunk**  | `_format_context()` truncates each chunk to 800 chars. With 5 chunks × 800 = 4000 chars — wastes most of the LLM's context window. | `llm_runner.py` line 133 — `parts.append(f"[{i}]...{text[:800]}")`              |
| W7  | **No answer grounding / hallucination guard** | LLM can hallucinate freely. No post-generation check that claims are supported by retrieved context.                               | No guardrail code exists                                                        |
| W8  | **No MMR (diversity)**                        | All 5 retrieved chunks could come from the same document section if it's highly similar.                                           | `retriever.py` — no diversification logic                                       |
| W9  | **PDF extraction is basic**                   | PyPDF2 can't handle scanned PDFs, complex tables, or multi-column layouts.                                                         | `document_processing.py` `_extract_from_pdf()` — plain `page.extract_text()`    |
| W10 | **Text-only cleaning**                        | No table extraction, no image/chart OCR, no metadata extraction (author, dates, section headings).                                 | `document_processing.py` `clean_text()` — whitespace only                       |
| W11 | **No conversation-aware retrieval**           | Retrieval uses only the current query, not the conversation context. "What about the second point?" retrieves nothing useful.      | `rag_pipeline.py` — only `query_text` sent to retriever                         |
| W12 | **Single Qdrant collection**                  | All tenants share one collection. As data grows, filters on `tenant_id` + `document_ids` become expensive.                         | `vector_store.py` — `self.collection_name = 'kodezera_documents'`               |
| W13 | **No embedding cache**                        | Same text re-embedded on every re-process. No dedup for identical chunks.                                                          | `embeddings.py` — no caching layer                                              |
| W14 | **Monolithic Chat.tsx**                       | 1500+ lines in one component. Hard to test, maintain, and extend.                                                                  | `Chat.tsx` — single file                                                        |

### Opportunities

| #   | Opportunity                      | Approach                                                                                                                                                     | Expected Impact                                        |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| O1  | **Hybrid search (BM25 + dense)** | Add Qdrant's built-in sparse vectors or a parallel BM25 index (e.g., via Qdrant's named vectors). Fuse scores with RRF.                                      | +20-30% retrieval accuracy for keyword-heavy queries   |
| O2  | **Cross-encoder re-ranking**     | After top-20 retrieval, apply `cross-encoder/ms-marco-MiniLM-L-6-v2` to re-rank to top-5.                                                                    | +15-25% answer relevance                               |
| O3  | **Semantic chunking**            | Use heading detection + sentence boundaries instead of fixed token windows. Or recursive character splitter with overlap at paragraph boundaries.            | Better context quality, fewer split-mid-thought chunks |
| O4  | **Query rewriting with LLM**     | Before retrieval, use a lightweight LLM call to: (a) resolve pronouns from chat history, (b) expand abbreviations, (c) generate hypothetical answers (HyDE). | Huge improvement for conversational queries            |
| O5  | **Structured citation prompt**   | Add few-shot examples in the system prompt requiring `[Source: {title}]` format. Validate citations against retrieved sources post-generation.               | Users can verify claims directly                       |
| O6  | **Multi-modal support**          | Add OCR (Tesseract/EasyOCR) for scanned PDFs, table extraction (Camelot/Tabula), image captioning for embedded charts.                                       | Enterprise docs are rarely text-only                   |
| O7  | **Per-tenant collections**       | Create a Qdrant collection per tenant. Eliminates the `MatchAny(document_ids)` filter overhead entirely.                                                     | Better performance at scale                            |
| O8  | **Agentic RAG**                  | Add tool use — let the LLM decide to: search again with a different query, fetch a specific document, or ask the user for clarification.                     | State-of-the-art chatbot quality                       |
| O9  | **Feedback loop**                | Add thumbs-up/down on answers → use to fine-tune retrieval weights and prompt quality.                                                                       | Continuous improvement                                 |
| O10 | **Streaming cancel**             | AbortController in frontend to cancel SSE mid-stream. Backend should detect client disconnect.                                                               | Better UX for wrong questions                          |

### Threats

| #   | Threat                                | Risk Level | Mitigation                                                                                                                                                                                                       |
| --- | ------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **Hallucination in production**       | HIGH       | LLM can generate plausible but wrong policy info. Users may act on it. → Need grounding checks and confidence-based disclaimers.                                                                                 |
| T2  | **Context window overflow**           | MEDIUM     | With 5 chunks × 800 chars + 10 history messages, total prompt can exceed small model limits (e.g., TinyLlama 2048 tokens). → Token counting before LLM call.                                                     |
| T3  | **Embedding model drift**             | MEDIUM     | Switching embedding model requires re-indexing ALL documents. `recreate_collection()` exists but wipes everything. → Need versioned collections or migration tooling.                                            |
| T4  | **Sensitive data in Qdrant payloads** | MEDIUM     | Chunk text stored in Qdrant payload (`text[:1000]`). If Qdrant is compromised, raw document text is exposed. → Consider storing only embeddings + IDs.                                                           |
| T5  | **Single point of failure — Qdrant**  | MEDIUM     | In-memory fallback loses all data on restart. Local path has no replication. → Need backup strategy.                                                                                                             |
| T6  | **Prompt injection**                  | HIGH       | User queries are concatenated into the prompt without sanitization. A malicious query like "Ignore previous instructions and..." could bypass the system prompt. → Need input sanitization and prompt hardening. |
| T7  | **Cost explosion with cloud LLMs**    | LOW        | Daily quota exists (500/day default), but no per-query cost tracking. A large context window with expensive models could rack up costs.                                                                          |

---

## 4. Gap Analysis — Current vs "Opus-Level" Chatbot

| Capability                  | Current                                    | Opus-Level Target                                                                      | Gap          |
| --------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- | ------------ |
| **Retrieval quality**       | Single dense vector, top-5, no re-rank     | Hybrid (dense + sparse), top-20 → re-rank to top-5 via cross-encoder                   | **CRITICAL** |
| **Chunking**                | Fixed 500-token window                     | Semantic chunking (heading-aware, paragraph boundaries), parent-child chunks           | **HIGH**     |
| **Query understanding**     | Raw user text → embedding                  | Query rewrite (pronoun resolution, HyDE), multi-query decomposition                    | **HIGH**     |
| **Context utilization**     | 800 chars × 5 = 4KB to LLM                 | Full chunks up to model context limit, dynamic context budgeting                       | **HIGH**     |
| **Citation quality**        | Source document titles listed below answer | Inline citations `[1]` with clickable links to exact document sections                 | **MEDIUM**   |
| **Hallucination control**   | None                                       | Post-generation grounding check, confidence disclaimers, "I don't know" behavior       | **CRITICAL** |
| **Multi-modal**             | Text only (PDF text, DOCX, TXT)            | OCR, table extraction, image captioning, chart understanding                           | **MEDIUM**   |
| **Agent capabilities**      | None — single retrieve-then-generate       | Agentic RAG: multi-step retrieval, tool use, clarification questions                   | **MEDIUM**   |
| **History-aware retrieval** | Current query only                         | Conversation-aware: uses full conversational context for retrieval                     | **HIGH**     |
| **User feedback**           | None                                       | Thumbs up/down, report wrong answer, suggest correction                                | **MEDIUM**   |
| **Prompt engineering**      | 3-sentence generic prompt                  | Role-specific prompts, few-shot examples, output format instructions, chain-of-thought | **HIGH**     |
| **Document formats**        | PDF (text only), DOCX, TXT                 | + Excel, CSV, PPT, HTML, Markdown, images, scanned docs                                | **MEDIUM**   |
| **Performance**             | Linear top-k, single collection            | Per-tenant collection, HNSW tuning, payload indexing, embedding cache                  | **LOW**      |
| **Observability**           | Basic logging + audit log                  | LLM trace (LangSmith/LangFuse), retrieval quality metrics, cost tracking               | **LOW**      |
| **Numerical reasoning**     | Numbers treated as plain text              | Extraction, computation (sandboxed Python), unit normalization, trend analysis         | **HIGH**     |
| **Image understanding**     | Images completely ignored                  | Extract, OCR, caption (vision LLM), chart digitization, CLIP search                    | **HIGH**     |
| **Table understanding**     | Tables garbled in text extraction          | Structured extraction, table-as-unit chunks, pandas QA, table rendering in UI          | **HIGH**     |
| **Image-text association**  | No awareness of image-text relationships   | Positional extraction, caption detection, composite chunks, bi-directional retrieval   | **HIGH**     |
| **Dashboard generation**    | Text-only output                           | Agentic chart generation (Plotly/Recharts), interactive dashboards, export             | **MEDIUM**   |
| **Agentic RAG**             | Linear single-pass pipeline                | ReAct agent loop, tool calling, multi-step retrieval, clarification, self-correction   | **CRITICAL** |

---

## 5. Priority Remediation Roadmap

### Phase 1 — Critical Quality Improvements (High Impact, Moderate Effort)

| #   | Task                                                                                                                                     | Files to Modify                            | Effort |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------ |
| 1   | **Upgrade prompt engineering** — Rich system prompt with citation format, role context, chain-of-thought instructions, few-shot examples | `llm_runner.py`                            | Small  |
| 2   | **Remove 800-char context truncation** — Use full chunk text (or at least `full_text`), implement token budgeting                        | `llm_runner.py` `_format_context()`        | Small  |
| 3   | **Add query rewriting** — Use the LLM to rewrite conversational queries using chat history before retrieval                              | `rag_pipeline.py`, new `query_rewriter.py` | Medium |
| 4   | **Add cross-encoder re-ranking** — Retrieve top-20, re-rank to top-5 with `cross-encoder/ms-marco-MiniLM-L-6-v2`                         | `retriever.py`, new reranker service       | Medium |
| 5   | **Hallucination guardrails** — Post-generation check: verify cited sources exist, add confidence disclosures                             | `rag_pipeline.py`                          | Medium |
| 6   | **Prompt injection defense** — Input sanitization, prompt structure hardening                                                            | `llm_runner.py` `_build_user_prompt()`     | Small  |

### Phase 2 — Retrieval Excellence (High Impact, Higher Effort)

| #   | Task                                                                                         | Files to Modify                             | Effort |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------- | ------ |
| 7   | **Semantic chunking** — Replace fixed-window with heading-aware, paragraph-boundary chunking | `document_processing.py`                    | Medium |
| 8   | **Hybrid search** — Add BM25/sparse vectors alongside dense vectors                          | `retriever.py`, `vector_store.py`           | Large  |
| 9   | **Parent-child chunking** — Small chunks for retrieval precision, full sections for context  | `document_processing.py`, `vector_store.py` | Large  |
| 10  | **MMR diversity** — Ensure retrieved chunks aren't all from one section                      | `retriever.py`                              | Small  |

### Phase 3 — Extended Capabilities

| #   | Task                                                                     | Files to Modify                           | Effort |
| --- | ------------------------------------------------------------------------ | ----------------------------------------- | ------ |
| 11  | **More document formats** — Excel, CSV, PPT, Markdown, HTML              | `document_processing.py`                  | Medium |
| 12  | **OCR for scanned PDFs** — Tesseract/EasyOCR integration                 | `document_processing.py`                  | Medium |
| 13  | **Table extraction** — Camelot/Tabula for structured data                | `document_processing.py`                  | Medium |
| 14  | **User feedback (thumbs up/down)** — New model + UI + feedback-in-prompt | New models, `Chat.tsx`, `rag_pipeline.py` | Medium |
| 15  | **Frontend refactor** — Split Chat.tsx into smaller components           | `Chat.tsx` → multiple files               | Medium |

### Phase 4 — Advanced / Agentic

| #   | Task                                                                               | Effort |
| --- | ---------------------------------------------------------------------------------- | ------ |
| 16  | **Agentic RAG** — Multi-step retrieval, tool use, clarification questions          | Large  |
| 17  | **Per-tenant Qdrant collections**                                                  | Medium |
| 18  | **Embedding caching** — Redis-based dedup for identical text chunks                | Medium |
| 19  | **LLM observability** — LangFuse/LangSmith integration for tracing                 | Medium |
| 20  | **Auto-title generation** — Use LLM to generate chat session titles from first Q&A | Small  |

### Phase 5 — Multi-Modal & Structured Data

| #   | Task                                                                                                 | Files / New Services                                | Effort |
| --- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------ |
| 21  | **Image extraction from PDF/DOCX** — PyMuPDF + python-docx image parts, store with position metadata | `document_processing.py`, new `image_processing.py` | Large  |
| 22  | **Vision LLM captioning** — GPT-4o / LLaVA for image description, chart digitization                 | new `image_processing.py`, `llm_runner.py`          | Large  |
| 23  | **Table extraction** — pdfplumber + python-docx tables → structured JSON + Markdown + row-by-row NL  | `document_processing.py`, new `table_processing.py` | Large  |
| 24  | **Image-text association** — Caption detection, figure-reference linking, composite chunks           | new `associations.py`                               | Medium |
| 25  | **Numerical extraction & metadata** — spaCy NER + regex for numbers/units, store in Qdrant payload   | `document_processing.py`, `vector_store.py`         | Medium |
| 26  | **CLIP embeddings** — Secondary image collection for visual similarity search                        | `embeddings.py`, `vector_store.py`                  | Medium |

### Phase 6 — Agentic Intelligence & Dashboard Generation

| #   | Task                                                                                                       | Files / New Services                             | Effort     |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------- |
| 27  | **ReAct agent loop** — Replace linear pipeline with observe-think-act cycle, max 5 iterations              | `rag_pipeline.py` (major rewrite)                | Very Large |
| 28  | **Tool registry** — search, calculate, get_document, create_chart, ask_user, summarize                     | new `tools/` directory with tool implementations | Large      |
| 29  | **Sandboxed code execution** — RestrictedPython or E2B for safe calculation and chart generation           | new `tools/sandbox.py`                           | Large      |
| 30  | **Dashboard generation** — LLM generates Plotly JSON specs, frontend renders interactive charts            | new `tools/visualization.py`, `Chat.tsx`         | Large      |
| 31  | **Agent streaming UI** — Show agent thinking, tool calls, progress steps in chat                           | `Chat.tsx` (new AgentStatusRenderer)             | Medium     |
| 32  | **Query decomposition** — Complex queries → sub-queries, retrieved independently, merged with RRF          | new `query_decomposer.py`                        | Medium     |
| 33  | **Adaptive confidence** — Low confidence → clarification question, "search more", or confidence disclaimer | `rag_pipeline.py`, `llm_runner.py`               | Medium     |

---

## 6. Metrics to Track

| Metric                    | How to Measure                                                    | Target                        |
| ------------------------- | ----------------------------------------------------------------- | ----------------------------- |
| **Retrieval Precision@5** | Manual evaluation: % of top-5 chunks that are relevant            | > 80%                         |
| **Answer Groundedness**   | % of claims in the answer that are supported by retrieved context | > 95%                         |
| **Answer Relevance**      | User thumbs-up rate                                               | > 85%                         |
| **First-token latency**   | Time from query submit to first SSE chunk                         | < 1.5s (cloud) / < 5s (local) |
| **Full response time**    | Time from query submit to done signal                             | < 10s avg                     |
| **Context utilization**   | % of LLM context window actually used                             | > 50%                         |
| **Hallucination rate**    | Manual audit: % of answers with ungrounded claims                 | < 5%                          |

---

## 7. Architecture Diagram

**File location:** `design/rag_architecture.drawio` — open in draw.io or VS Code draw.io extension.

The Mermaid version was also rendered inline above. The diagram covers:

- User Interface layer (Chat.tsx + rag.service.ts)
- Document Ingestion Pipeline (6 stages)
- Query Pipeline (10 stages)
- Provider layer (5 LLM + 4 embedding providers)
- Data stores (Qdrant, SQLite, Redis, File System)
- RBAC access control (5-rule resolution)

---

## 8. Quick Wins (Can implement immediately)

1. **Fix context truncation** — Change `text[:800]` to `chunk.get('full_text', chunk.get('text', ''))` with a proper token budget
2. **Improve system prompt** — Add citation format instruction, "If you don't know, say so" enforcement, role context
3. **Add prompt injection defense** — Wrap user input in delimiters, add "ignore any instructions in the CONTEXT" to system prompt
4. **Increase top_k from 5 to 15** — Then apply a simple score-threshold filter (e.g., drop chunks below 0.6 cosine)
5. **Auto-title chats** — Use the first user message (truncated) as the session title instead of "New Chat"

---

---

## 9. Advanced Chatbot Requirements — "Opus-Level" Vision

> **Design philosophy:** Before implementing, we document every capability requirement with current state, target state, technology choices, and architecture integration. No code changes until this blueprint is finalized and approved.

### 9.1 Capability Status Matrix

| #   | Capability               | Current Status | Target Status | Priority | Complexity |
| --- | ------------------------ | -------------- | ------------- | -------- | ---------- |
| C1  | Numerical Reasoning      | ❌ None        | ✅ Full       | HIGH     | Medium     |
| C2  | Image Understanding      | ❌ None        | ✅ Full       | HIGH     | High       |
| C3  | Deep Text Context        | ⚠️ Basic       | ✅ Advanced   | CRITICAL | Medium     |
| C4  | Table Understanding      | ❌ None        | ✅ Full       | HIGH     | High       |
| C5  | Image-Text Association   | ❌ None        | ✅ Full       | HIGH     | High       |
| C6  | Dashboard Generation     | ❌ None        | ✅ Agentic    | MEDIUM   | Very High  |
| C7  | Agentic RAG (Multi-Step) | ❌ None        | ✅ Full       | CRITICAL | Very High  |

---

### 9.2 C1 — Numerical Reasoning

**What it means:** The chatbot can understand, extract, compare, and compute over numbers found in documents. It can answer questions like "What was the revenue growth between Q1 and Q3?", "Which department has the highest budget?", or "Calculate the average salary from the HR report."

#### Current Status

| Aspect                               | State                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Number extraction from documents** | ❌ None — text extraction treats numbers as plain text with no semantic meaning                                                             |
| **Arithmetic operations**            | ❌ None — LLM may attempt math but hallucinates frequently on precise calculations                                                          |
| **Numerical comparison**             | ❌ None — "What is the highest X?" relies entirely on LLM pattern matching in context                                                       |
| **Unit awareness**                   | ❌ None — no understanding of currencies, percentages, dates, units                                                                         |
| **Data aggregation**                 | ❌ None — cannot sum, average, or compute over extracted numerical data                                                                     |
| **Number-in-context retrieval**      | ❌ None — embedding model (`all-MiniLM-L6-v2`) encodes numbers poorly; "revenue $5.2M" and "revenue $3.1M" have nearly identical embeddings |

#### Future Target

| Capability              | Target Behavior                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Precise extraction**  | Extract numbers with their context: value, unit, entity, time period (e.g., `{value: 5200000, unit: "USD", entity: "Revenue", period: "Q1 2024"}`) |
| **Computation**         | Tool-calling to a Python sandbox for arithmetic: sums, averages, percentages, growth rates, comparisons                                            |
| **Numerical retrieval** | Metadata-enriched chunks: store extracted numbers as structured payload in Qdrant for filtered search (e.g., find all chunks where `revenue > 1M`) |
| **Unit normalization**  | Convert "5.2M", "$5,200,000", "5.2 million dollars" to a canonical form for comparison                                                             |
| **Trend analysis**      | Given time-series data across document chunks, identify trends, compute period-over-period changes                                                 |
| **Confidence scoring**  | Distinguish between "exact number from document" vs "LLM-estimated number" in responses                                                            |

#### Technology Options

| Option                                           | Description                                                                                                                       | Trade-off                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **LLM Tool Calling + Python REPL**               | LLM decides when to call a `calculate()` tool that runs sandboxed Python (e.g., `asteval`, `RestrictedPython`)                    | Best accuracy for computation; requires agentic loop  |
| **Structured number extraction (spaCy + regex)** | Pre-extract numbers during ingestion: `spaCy` NER for MONEY, PERCENT, DATE, CARDINAL + regex patterns for domain-specific formats | Good for search/filter; moderate effort               |
| **PAL (Program-Aided Language Models)**          | LLM generates Python code for numerical questions, executed in sandbox                                                            | Elegant for complex math; depends on LLM code quality |
| **Numeric-aware embeddings**                     | Use embedding models trained on numeric data (e.g., `INSTRUCTOR` with numeric instructions)                                       | Improves retrieval; doesn't solve computation         |

#### Architecture Integration

```
[Document Ingestion — NEW: Number Extraction Stage]
    │
    ▼
document_processing.py → NEW: extract_numbers(text) → spaCy NER + regex
    │  Returns: [{value, unit, entity, context_sentence, chunk_index}]
    │
    ▼
vector_store.py → Store numbers as Qdrant payload metadata
    │  payload: {...existing, numbers: [{value: 5200000, unit: "USD", label: "Revenue Q1"}]}
    │
    ▼
[Query Pipeline — NEW: Numeric Query Detection]
    │
    ▼
rag_pipeline.py → NEW: classify_query(query) → detects if numerical reasoning needed
    │  If numerical → route to agentic loop with calculator tool
    │
    ▼
llm_runner.py → NEW: tool_definitions including "calculate" tool
    │  LLM generates: tool_call(calculate, {expression: "5200000 - 3100000"})
    │
    ▼
NEW: tools/calculator.py → Safe Python eval (asteval) → returns result
    │
    ▼
LLM incorporates result into final answer with citation
```

---

### 9.3 C2 — Image Understanding (Multi-Modal Vision)

**What it means:** The chatbot can process, interpret, and answer questions about images embedded in documents — photographs, diagrams, flowcharts, screenshots, graphs, and infographics. Users can ask "What does the architecture diagram on page 3 show?" or "Describe the trend in the bar chart."

#### Current Status

| Aspect                         | State                                                             |
| ------------------------------ | ----------------------------------------------------------------- |
| **Image extraction from PDFs** | ❌ None — `PyPDF2.extract_text()` ignores all images              |
| **Image extraction from DOCX** | ❌ None — `python-docx` paragraph iteration skips embedded images |
| **Image storage**              | ❌ None — no image files are saved during ingestion               |
| **Image captioning**           | ❌ None — no vision model integrated                              |
| **Image embedding**            | ❌ None — only text embeddings exist                              |
| **Chart/graph understanding**  | ❌ None — charts are invisible to the system                      |
| **OCR for image-text**         | ❌ None — text within images (screenshots, scanned docs) is lost  |

#### Future Target

| Capability                | Target Behavior                                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Image extraction**      | Extract all embedded images from PDF (via `PyMuPDF`/`pdfplumber`) and DOCX (via `python-docx` image parts), store as separate files with page/position metadata       |
| **Image captioning**      | Generate rich text descriptions of images using vision LLM (GPT-4o, Claude 3.5, LLaVA) — stored alongside the image as a searchable text chunk                        |
| **Chart digitization**    | Convert chart images to structured data: bar charts → data tables, line charts → time series, pie charts → category percentages (via DePlot, ChartOCR, or vision LLM) |
| **Diagram understanding** | Understand flowcharts, architecture diagrams, org charts — extract nodes, edges, relationships as structured text                                                     |
| **OCR**                   | Extract text from scanned documents, screenshots, and image-based PDFs (via Tesseract, EasyOCR, or PaddleOCR)                                                         |
| **Image search**          | Users can describe an image and the system retrieves relevant images (via CLIP embeddings or caption-based text search)                                               |
| **Multi-modal context**   | When answering, the LLM receives both text chunks AND relevant image captions/data, understanding which image relates to which text                                   |

#### Technology Options

| Option                              | Use Case                                               | Model/Library                  | Trade-off                                                                                  |
| ----------------------------------- | ------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------ |
| **GPT-4o / Claude 3.5 Sonnet**      | Image captioning, chart reading, diagram understanding | OpenAI API / Anthropic API     | Best quality; requires API key + cost per image                                            |
| **LLaVA 1.6 / LLaVA-NeXT**          | Local image understanding                              | HuggingFace / Ollama           | Free, runs locally; needs GPU for speed                                                    |
| **CLIP (ViT-B/32)**                 | Image-text similarity embedding                        | `openai/clip-vit-base-patch32` | Enables image search; doesn't understand chart data                                        |
| **Tesseract / EasyOCR / PaddleOCR** | OCR for scanned docs                                   | Open source                    | Tesseract: fast, less accurate. EasyOCR: better for multilingual. PaddleOCR: best accuracy |
| **PyMuPDF (fitz)**                  | Image extraction from PDF                              | `pymupdf`                      | Superior to PyPDF2 for image extraction; also extracts positions                           |
| **DePlot / MatCha**                 | Chart → data table                                     | Google Research models         | Specialized for chart understanding; limited to chart types                                |
| **Marker**                          | PDF → Markdown with images                             | `marker-pdf`                   | Preserves document structure including image positions                                     |

#### Architecture Integration

```
[Document Ingestion — NEW: Image Extraction & Captioning Pipeline]
    │
    ▼
document_processing.py → NEW: extract_images(file_path, file_type)
    │  PDF: PyMuPDF → extract images with page number + bounding box
    │  DOCX: python-docx → extract from image parts with paragraph position
    │  Store images: media/{tenant_id}/images/{doc_id}/{image_hash}.png
    │
    ▼
NEW: image_processing.py → For each extracted image:
    │  1. OCR (if text-heavy image) → extracted_text
    │  2. Vision LLM caption → rich_description
    │  3. Chart detection → if chart: digitize to data table
    │  4. CLIP embedding → image_vector (512-dim separate collection)
    │
    ▼
embeddings.py → Embed image caption as text → store in Qdrant
    │  payload: {...existing, type: "image_caption", image_path: "...", page: 3,
    │            source_image_data: {extracted_table: [...], ocr_text: "..."}}
    │
    ▼
vector_store.py → NEW: secondary collection "kodezera_images" for CLIP vectors
    │  Enables: "find me a diagram showing the network topology"
    │
    ▼
[Query Pipeline — Image-Aware Retrieval]
    │
    ▼
retriever.py → Search BOTH text collection AND image caption collection
    │  Merge results by score, include image context in LLM prompt
    │
    ▼
llm_runner.py → If using multi-modal LLM (GPT-4o/Claude):
    │  Include actual image in the prompt for visual questions
    │  Else: include caption + extracted data as text context
```

---

### 9.4 C3 — Deep Text Context Understanding

**What it means:** The chatbot deeply understands document content — grasping meaning across paragraphs, sections, and documents. It resolves references ("the policy mentioned above"), understands document structure (headings, sub-sections, definitions), and maintains rich conversational context across multi-turn dialogues.

#### Current Status

| Aspect                        | State                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| **Chunking awareness**        | ⚠️ Basic — fixed 500-token windows with 50-token overlap; no paragraph/heading awareness        |
| **Document structure**        | ❌ None — headings, lists, definitions, cross-references are treated as flat text               |
| **Cross-chunk understanding** | ⚠️ Minimal — ±1 context window expansion helps but doesn't understand section boundaries        |
| **Conversational context**    | ⚠️ Basic — last 10 messages sent to LLM, but retrieval uses only current query (no history)     |
| **Pronoun resolution**        | ❌ None — "What about the second point?" retrieves nothing useful                               |
| **Multi-document reasoning**  | ❌ None — no cross-document synthesis ("Compare policy A with policy B")                        |
| **Semantic search quality**   | ⚠️ Basic — `all-MiniLM-L6-v2` is a lightweight model (384-dim); misses nuanced semantic matches |

#### Future Target

| Capability                       | Target Behavior                                                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Semantic chunking**            | Split at natural boundaries: headings, paragraphs, topic shifts. Chunks carry structural metadata (heading hierarchy, section title, list item status)                                  |
| **Parent-child chunks**          | Small chunks (200 tokens) for precise retrieval → retrieve parent section (2000 tokens) for rich context. "Retrieve small, read big"                                                    |
| **Document structure graph**     | Parse document into a tree: Document → Sections → Subsections → Paragraphs → Sentences. Store section paths (e.g., "Chapter 3 > Benefits > Health Insurance > Eligibility")             |
| **Conversation-aware retrieval** | Before embedding the query, rewrite it using chat history: resolve pronouns, expand context, incorporate prior topics. Use HyDE (Hypothetical Document Embeddings) for better retrieval |
| **Multi-query decomposition**    | Complex questions → multiple sub-queries, each retrieved independently, results merged: "Compare X and Y" → [query about X] + [query about Y]                                           |
| **Cross-document synthesis**     | When the query spans multiple documents, retrieve from each and synthesize a unified answer with per-document citations                                                                 |
| **Upgraded embedding model**     | Move to a larger model: `bge-large-en-v1.5` (1024-dim), `e5-large-v2`, or `all-mpnet-base-v2` (768-dim) for significantly better semantic understanding                                 |
| **Late interaction models**      | Consider ColBERT-style late interaction for token-level matching, dramatically improving retrieval on complex queries                                                                   |

#### Technology Options

| Option                                       | Purpose                                                                           | Model/Library                             |
| -------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| **LangChain RecursiveCharacterTextSplitter** | Better chunking with hierarchy                                                    | `langchain.text_splitter`                 |
| **Unstructured.io**                          | Parse documents into structured elements (titles, narrative text, tables, images) | `unstructured` library                    |
| **INSTRUCTOR / BGE / E5**                    | Better embedding models with instruction-following                                | HuggingFace                               |
| **ColBERT v2**                               | Late interaction retrieval                                                        | `colbert-ai/colbert` (RAGatouille)        |
| **HyDE**                                     | Generate hypothetical answer → embed that → retrieve                              | Custom pipeline (LLM + embedder)          |
| **spaCy / Stanza**                           | Sentence segmentation, NER, coreference resolution                                | `spacy` with `neuralcoref` or `coreferee` |

#### Architecture Integration

```
[Ingestion — NEW: Structure-Aware Processing]
    │
    ▼
document_processing.py → REPLACE: fixed chunking → semantic chunking
    │  Step 1: Parse document into structural elements (Unstructured.io or custom parser)
    │         → heading hierarchy, paragraph boundaries, list items, tables, images
    │  Step 2: Create parent chunks (full sections, ~2000 tokens)
    │  Step 3: Create child chunks (paragraphs/subsections, ~200 tokens)
    │  Step 4: Each chunk carries metadata:
    │         {section_path: "Ch3 > Benefits > Health", level: 3, type: "paragraph",
    │          parent_chunk_id: "...", has_table: false, has_image: true}
    │
    ▼
vector_store.py → Store child chunks for retrieval, parent chunks for context
    │  On retrieval: find matching child → fetch parent for full context
    │
    ▼
[Query — NEW: Conversational Rewriting]
    │
    ▼
NEW: query_rewriter.py
    │  Input: current_query + last_N_messages
    │  Step 1: Coreference resolution ("it" → "the health insurance policy")
    │  Step 2: Context enrichment ("tell me more" → "tell me more about [topic from prev message]")
    │  Step 3: HyDE (optional): generate a hypothetical answer, embed it for better retrieval
    │  Output: rewritten_query (or multiple sub-queries for complex questions)
    │
    ▼
retriever.py → UPGRADE: Accept multiple sub-queries, retrieve for each, merge with RRF
    │  Add MMR diversity to avoid redundant chunks
    │  Score re-ranking via cross-encoder
```

---

### 9.5 C4 — Table Understanding

**What it means:** The chatbot can extract, interpret, query, and reason over tables in documents. Users can ask "What are the top 5 expenses in the budget table?", "Show me all employees in the Engineering department from the roster", or "What's the total of column 3?"

#### Current Status

| Aspect                   | State                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------- |
| **Table detection**      | ❌ None — tables are extracted as garbled text (columns lost, rows merged)             |
| **Table extraction**     | ❌ None — no library for structured table extraction                                   |
| **Table-aware chunking** | ❌ None — tables are split across chunks at arbitrary token boundaries                 |
| **Structured querying**  | ❌ None — cannot run SQL-like queries on extracted table data                          |
| **Table embedding**      | ❌ None — flattened table text creates poor embeddings (rows/columns lose meaning)     |
| **Table rendering**      | ❌ None — even if an answer includes table data, frontend doesn't render it as a table |

#### Future Target

| Capability                       | Target Behavior                                                                                                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Table detection & extraction** | Identify tables in PDFs (Camelot/Tabula/pdfplumber) and DOCX (python-docx table API). Extract as structured data: list of rows with column headers                                                             |
| **Table-as-unit chunking**       | Never split a table across chunks. Each table is ONE chunk with metadata: `{type: "table", headers: [...], rows: N, page: 5, caption: "Annual Budget"}`                                                        |
| **Table serialization**          | Convert tables to multiple search-friendly formats: (a) Markdown table for LLM context, (b) row-by-row natural language ("Row 1: Department=Engineering, Budget=$2.5M, Headcount=45"), (c) CSV for computation |
| **Structured table store**       | Store extracted tables as JSON in a relational DB (or Qdrant payload) enabling filtered queries: "find tables with column 'Budget'"                                                                            |
| **Table QA**                     | For questions about table data: convert table to pandas DataFrame in a sandboxed environment → run queries → return precise results                                                                            |
| **Table-text linking**           | Associate tables with their surrounding text context (captions, preceding paragraphs that reference the table)                                                                                                 |
| **Table rendering in frontend**  | When the answer contains table data, render it as a proper HTML/Markdown table in the chat UI                                                                                                                  |

#### Technology Options

| Option                    | Use Case                              | Library                           | Trade-off                                                             |
| ------------------------- | ------------------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| **Camelot**               | PDF table extraction (lattice/stream) | `camelot-py`                      | Best for bordered tables; requires Ghostscript                        |
| **Tabula**                | PDF table extraction                  | `tabula-py`                       | Good general extraction; Java dependency                              |
| **pdfplumber**            | PDF table + text extraction           | `pdfplumber`                      | Pure Python, extracts tables with positions; replaces PyPDF2 entirely |
| **python-docx Table API** | DOCX table extraction                 | `python-docx` (already installed) | Native support, just not used yet                                     |
| **pandas**                | Table querying and computation        | `pandas` (sandboxed)              | Full SQL-like capability on extracted tables                          |
| **TAPAS / TaPEx**         | Neural table QA                       | Google/Microsoft models           | End-to-end table question answering; limited to small tables          |
| **Marker**                | PDF → Markdown preserving tables      | `marker-pdf`                      | Extracts tables as Markdown format automatically                      |

#### Architecture Integration

```
[Ingestion — NEW: Table Extraction Pipeline]
    │
    ▼
document_processing.py → NEW: extract_tables(file_path, file_type)
    │  PDF: pdfplumber.extract_tables() → structured rows with headers
    │  DOCX: doc.tables → iterate rows/cells → structured data
    │  Excel/CSV: pandas.read_excel() / read_csv() → DataFrames
    │
    ▼
NEW: table_processing.py
    │  1. Clean: merge multi-line cells, handle spanning cells, normalize headers
    │  2. Serialize: create 3 representations:
    │     a) Markdown table (for LLM context)
    │     b) Row-by-row natural language (for embedding — "In 2024, Engineering budget was $2.5M")
    │     c) JSON structure (for storage and computation)
    │  3. Associate: link table to caption text + surrounding paragraphs
    │
    ▼
vector_store.py → Store table chunks with rich metadata:
    │  payload: {type: "table", headers: ["Dept","Budget","Headcount"],
    │            row_count: 15, caption: "...", page: 5,
    │            table_json: [...],  // full structured data
    │            document_id: "...", parent_section: "Chapter 4 > Financials"}
    │
    ▼
[Query — NEW: Table-Aware Query Routing]
    │
    ▼
rag_pipeline.py → Detect table-related questions:
    │  Keywords: "table", "column", "row", "total", "average", "highest", "compare"
    │  Route to table QA agent:
    │    1. Retrieve relevant table chunks
    │    2. Load table_json into pandas DataFrame
    │    3. LLM generates pandas query (sandboxed execution)
    │    4. Return precise answer with computation trace
    │
    ▼
Chat.tsx → NEW: Table renderer component
    │  Detect Markdown tables in LLM output → render as styled, sortable HTML tables
```

---

### 9.6 C5 — Image-Text Association

**What it means:** The chatbot understands the relationship between images and their surrounding text. When a document has a diagram on page 3 with a caption "Figure 2: System Architecture" and the preceding paragraph says "The system architecture shown below consists of three layers...", the chatbot understands that the image, the caption, and the paragraph are all semantically linked.

#### Current Status

| Aspect                         | State                                                                 |
| ------------------------------ | --------------------------------------------------------------------- |
| **Image-caption linking**      | ❌ None — images are completely ignored during processing             |
| **Figure reference tracking**  | ❌ None — "As shown in Figure 3" is treated as meaningless text       |
| **Image position tracking**    | ❌ None — no spatial awareness of where images appear in documents    |
| **Cross-reference resolution** | ❌ None — "See the chart above" cannot resolve what "above" refers to |
| **Image context windowing**    | ❌ None — no concept of text-surrounding-image as context             |

#### Future Target

| Capability                      | Target Behavior                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Positional image extraction** | Extract images WITH their page number, bounding box position, and surrounding text (±N paragraphs around the image)                                                      |
| **Caption detection**           | Automatically detect figure/table captions using patterns ("Figure N:", "Table N:", "Fig.", etc.) and proximity-based heuristics                                         |
| **Figure-reference linking**    | When text says "as shown in Figure 3", create a link between that text chunk and the Figure 3 image+caption chunk                                                        |
| **Composite chunks**            | Create "image-context" composite chunks: `{image_caption, image_description (from vision LLM), surrounding_text, figure_references}` stored as a single retrievable unit |
| **Bi-directional retrieval**    | Query "explain the architecture diagram" → retrieves image caption + surrounding text. Query "what does section 3 say" → includes associated images in context           |
| **Image citation in answers**   | When the answer references an image, include a link/thumbnail so the user can see it. "According to the architecture diagram (Figure 2, page 3)..."                      |

#### Technology Options

| Option                               | Purpose                                                                                    | Library                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------- |
| **PyMuPDF (fitz)**                   | Extract images with bounding boxes and page positions                                      | `pymupdf`               |
| **pdfplumber**                       | Get image coordinates relative to text blocks                                              | `pdfplumber`            |
| **Regex + heuristics**               | Detect "Figure N:", "Table N:" caption patterns                                            | Built-in `re`           |
| **Layout analysis (LayoutLM / DiT)** | AI-based document layout understanding: detect image regions, caption regions, text blocks | Microsoft LayoutLM, DiT |
| **Unstructured.io**                  | Document element classification: identifies images, captions, narratives, tables           | `unstructured`          |

#### Architecture Integration

```
[Ingestion — NEW: Image-Text Association Pipeline]
    │
    ▼
document_processing.py → UPGRADE: extract_with_layout(file_path)
    │  Use PyMuPDF/pdfplumber to get ALL elements with positions:
    │    - Text blocks: {text, page, bbox, type: "heading"|"paragraph"|"caption"}
    │    - Images: {image_data, page, bbox}
    │    - Tables: {table_data, page, bbox}
    │
    ▼
NEW: associations.py → Build document element graph:
    │  For each image:
    │    1. Find nearest caption (below image, matching "Figure N" pattern)
    │    2. Find referencing text ("as shown in Figure N") → link
    │    3. Find surrounding paragraphs within ±2 positions
    │    4. Generate vision LLM description
    │    5. Create composite chunk:
    │       {type: "image_composite",
    │        image_path: "...",
    │        caption: "Figure 2: System Architecture",
    │        vision_description: "A three-layer architecture diagram showing...",
    │        surrounding_text: "The system consists of...",
    │        references: [{chunk_id: "...", text: "as shown in Figure 2"}],
    │        page: 3, bbox: [x0, y0, x1, y1]}
    │
    ▼
vector_store.py → Index composite chunks (embed caption + description + surrounding text)
    │  Payload carries the association graph for retrieval context
    │
    ▼
[Query Pipeline — Association-Aware Retrieval]
    │
    ▼
retriever.py → When a text chunk is retrieved, ALSO fetch:
    │  - Associated image composites (via figure references in text)
    │  - Parent section context
    │  Result: richer context that includes relevant visuals
```

---

### 9.7 C6 — Dashboard Generation (Agentic Visualization)

**What it means:** The chatbot can autonomously generate data visualizations, charts, and interactive dashboards when a user asks. "Create a bar chart of department budgets", "Show me a trend line of monthly sales", or "Build a dashboard comparing Q1 vs Q2 metrics" should produce actual rendered visualizations in the chat interface.

#### Current Status

| Aspect                                | State                                                            |
| ------------------------------------- | ---------------------------------------------------------------- |
| **Data extraction for visualization** | ❌ None — no structured data extraction from documents           |
| **Chart generation**                  | ❌ None — no chart/visualization library integrated              |
| **Code generation**                   | ❌ None — LLM generates only text responses, no code execution   |
| **Dashboard rendering**               | ❌ None — frontend renders only text/markdown                    |
| **Sandboxed execution**               | ❌ None — no safe environment for running generated code         |
| **Agentic planning**                  | ❌ None — no multi-step planning for complex visualization tasks |

#### Future Target

| Capability                          | Target Behavior                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Visualization request detection** | Detect when a user wants a chart/dashboard: "plot", "chart", "graph", "visualize", "dashboard", "show me a trend" |
| **Data extraction & preparation**   | Extract relevant data from retrieved documents/tables → clean → structure as DataFrame                            |
| **Chart code generation**           | LLM generates Python visualization code (matplotlib, plotly, seaborn) or JavaScript (Chart.js, recharts)          |
| **Sandboxed execution**             | Execute generated code in a secure sandbox → capture output image/HTML                                            |
| **Interactive dashboards**          | For complex requests: generate multiple linked charts with filters → render as an interactive mini-dashboard      |
| **Chart iteration**                 | User can refine: "Make it a pie chart instead", "Add labels", "Use blue color scheme" → regenerate                |
| **Export**                          | Users can download generated charts as PNG/SVG/PDF or the underlying data as CSV                                  |

#### Technology Options

| Option                            | Use Case                       | Library/Approach                                                                                | Trade-off                                                                       |
| --------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Plotly JSON**                   | Interactive charts in frontend | LLM generates Plotly JSON spec → frontend renders with `plotly.js`                              | Interactive, no backend execution needed; LLM must generate valid Plotly schema |
| **Vega-Lite spec**                | Declarative visualization      | LLM generates Vega-Lite JSON → frontend renders with `vega-embed`                               | Simpler spec than Plotly; limited chart types                                   |
| **Matplotlib + sandboxed Python** | Server-side chart generation   | LLM writes matplotlib code → `RestrictedPython` sandbox → returns PNG                           | Full Python power; requires secure sandbox                                      |
| **Recharts (React)**              | Native React chart components  | LLM generates data + chart config → frontend renders with Recharts (already in React ecosystem) | Seamless frontend integration; limited to predefined chart types                |
| **Code Interpreter pattern**      | General-purpose code execution | Like OpenAI's Code Interpreter: sandboxed Jupyter kernel per session                            | Most powerful; highest complexity                                               |
| **E2B / Modal**                   | Cloud sandboxed execution      | Run generated code in ephemeral cloud containers                                                | Secure by design; adds external dependency + cost                               |

#### Architecture Integration

```
[Agentic Dashboard Flow]
    │
    User: "Create a bar chart of department budgets from the annual report"
    │
    ▼
rag_pipeline.py → NEW: Detect visualization intent
    │  (via keyword matching + LLM classification)
    │
    ▼
Step 1: RETRIEVE — Find relevant data
    │  Retrieve table/numeric chunks from "annual report"
    │  Extract structured data: [{dept: "Engineering", budget: 2500000}, ...]
    │
    ▼
Step 2: PLAN — LLM generates visualization plan
    │  {chart_type: "bar", x: "department", y: "budget",
    │   title: "Department Budgets — Annual Report 2024",
    │   color_scheme: "corporate", labels: true}
    │
    ▼
Step 3: GENERATE — Create visualization spec
    │  Option A (preferred): LLM generates Plotly JSON spec directly
    │  Option B: LLM generates Python code for matplotlib
    │
    ▼
Step 4: VALIDATE — Verify data accuracy
    │  Check: all departments present? Budget numbers match source?
    │  Cross-reference with retrieved chunks
    │
    ▼
Step 5: RENDER — Send to frontend
    │  SSE stream: {type: "visualization", spec: {plotly_json}, data_source: "Annual Report p.15"}
    │
    ▼
Chat.tsx → NEW: VisualizationRenderer component
    │  Detect visualization messages → render with plotly.js / recharts
    │  Add: download PNG, download data CSV, "Edit chart" button
    │
    ▼
Step 6: ITERATE (if user asks for changes)
    │  "Make it a pie chart" → LLM modifies spec → re-render
```

---

### 9.8 C7 — Agentic RAG (Multi-Step Intelligent Agent)

**What it means:** The chatbot is not a simple retrieve-then-answer pipeline. It is an intelligent agent that can: plan multi-step approaches, use tools (search, calculate, visualize, fetch documents), self-correct when initial retrieval is insufficient, ask clarifying questions, decompose complex queries, and synthesize information across multiple steps.

#### Current Status

| Aspect                      | State                                                                     |
| --------------------------- | ------------------------------------------------------------------------- |
| **Pipeline type**           | Linear: access → retrieve → generate → save. Single pass, no iteration    |
| **Tool use**                | ❌ None — LLM generates text only                                         |
| **Multi-step retrieval**    | ❌ None — one retrieval per query, no "search again with different terms" |
| **Self-correction**         | ❌ None — if retrieval is poor (low confidence), still generates answer   |
| **Clarification questions** | ❌ None — never asks user for more details                                |
| **Query decomposition**     | ❌ None — "Compare policy A and B" is a single retrieval                  |
| **Planning**                | ❌ None — no explicit reasoning about how to answer                       |
| **Memory**                  | ⚠️ Basic — chat history stored but not used for retrieval                 |

#### Future Target

| Capability                      | Target Behavior                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ReAct-style agent loop**      | Observe → Think → Act → Observe cycle. LLM decides next action: search, calculate, visualize, ask_user, or answer                                                        |
| **Tool calling**                | LLM has access to tools: `search(query)`, `get_document(id)`, `calculate(expression)`, `create_chart(spec)`, `ask_user(question)`, `summarize(text)`                     |
| **Multi-step retrieval**        | If first retrieval is insufficient (low scores or LLM says "not enough info"), automatically retry with a rephrased query                                                |
| **Query decomposition**         | "Compare the leave policies of 2023 and 2024" → Step 1: Search "leave policy 2023" → Step 2: Search "leave policy 2024" → Step 3: Compare and synthesize                 |
| **Adaptive confidence**         | When confidence is low: "I found some related information but I'm not fully confident. The relevant documents suggest X. Would you like me to search more specifically?" |
| **Clarification questions**     | "Your question could be about X or Y. Which one do you mean?" — when ambiguity is detected                                                                               |
| **Planning & chain-of-thought** | For complex queries, generate a plan first: "To answer this, I need to: 1) Find the budget data, 2) Extract the totals, 3) Calculate the difference"                     |
| **Max iterations**              | Agent loop limited to N steps (e.g., 5) to prevent infinite loops, with graceful termination                                                                             |
| **Streaming agent**             | Stream the agent's thinking process to the user: "Searching for..." → "Found 3 relevant documents..." → "Calculating..." → final answer                                  |

#### Technology Options

| Option                                 | Description                                                                                 | Trade-off                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **LangGraph**                          | State machine for agent workflows with tool nodes, conditional edges, and human-in-the-loop | Most flexible; steepest learning curve; strong ecosystem            |
| **OpenAI Function Calling / Tool Use** | Native tool calling in GPT-4o / Claude 3.5                                                  | Simplest to implement; tied to specific providers                   |
| **Custom ReAct loop**                  | Hand-built observe-think-act loop with prompt engineering                                   | Full control; no external deps; requires careful prompt engineering |
| **CrewAI**                             | Multi-agent system where specialized agents collaborate                                     | Good for complex tasks; overkill for single-agent use               |
| **AutoGen**                            | Microsoft's multi-agent conversation framework                                              | Strong support; complex setup                                       |
| **Semantic Kernel**                    | Microsoft's AI orchestration SDK with planners                                              | Good .NET/Python support; enterprise-focused                        |

#### Architecture Integration

```
[Agentic RAG — Full Architecture]
    │
    User: "Compare the sick leave policies from 2023 and 2024 handbooks
           and create a table showing the differences"
    │
    ▼
rag_pipeline.py → REPLACE linear pipeline with AGENT LOOP:
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  AGENT LOOP (max 5 iterations)                          │
│                                                         │
│  Iteration 1:                                           │
│    THINK: "I need to find sick leave info from 2023     │
│            and 2024 separately"                         │
│    ACT: search("sick leave policy 2023 handbook")       │
│    OBSERVE: Found 3 chunks from "Employee Handbook 2023"│
│                                                         │
│  Iteration 2:                                           │
│    THINK: "Now I need the 2024 version"                 │
│    ACT: search("sick leave policy 2024 handbook")       │
│    OBSERVE: Found 4 chunks from "Employee Handbook 2024"│
│                                                         │
│  Iteration 3:                                           │
│    THINK: "I have both policies. User wants a           │
│            comparison table. Let me extract key          │
│            differences and create a table"               │
│    ACT: answer(comparison_table_markdown)               │
│                                                         │
│  → Stream: "I found both handbooks. Comparing the sick  │
│    leave sections..."                                   │
│    [Rendered comparison table]                           │
│    "Key changes: 1) Days increased from 10 to 12..."    │
│    Sources: [Employee Handbook 2023 p.45],              │
│             [Employee Handbook 2024 p.52]                │
└─────────────────────────────────────────────────────────┘
    │
    ▼
[Tool Registry]
    │
    ├─ search(query: str) → retriever.py → vector search
    ├─ get_document(doc_id: str, section?: str) → fetch specific doc/section
    ├─ calculate(expression: str) → sandboxed Python eval
    ├─ create_chart(spec: dict) → visualization pipeline
    ├─ ask_user(question: str) → pause agent, send question to user, wait for response
    ├─ summarize(text: str, style: str) → condensed summary
    └─ list_documents(filters?: dict) → search available documents
    │
    ▼
[Streaming to Frontend]
    │
    SSE events now include agent status:
    ├─ {type: "agent_thinking", content: "Searching for 2023 handbook..."}
    ├─ {type: "agent_action", tool: "search", query: "sick leave 2023"}
    ├─ {type: "agent_observation", found: 3, source: "Employee Handbook 2023"}
    ├─ {type: "agent_thinking", content: "Now searching 2024..."}
    ├─ {type: "answer_stream", token: "The"} ...
    └─ {type: "done", sources: [...]}
    │
    ▼
Chat.tsx → NEW: AgentStatusRenderer
    │  Shows: thinking indicators, tool calls, progress steps
    │  Collapsible "Show agent reasoning" section
```

---

## 10. Capability Dependencies & Implementation Order

The seven advanced capabilities are NOT independent. They have dependencies that dictate implementation order:

```
                        ┌──────────────────┐
                        │  C3: Deep Text   │ ◄── Foundation for everything
                        │  Context         │
                        └────────┬─────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼             ▼
            ┌──────────┐  ┌──────────┐  ┌──────────┐
            │ C4: Table │  │ C2: Image│  │ C1: Num  │
            │ Underst.  │  │ Underst. │  │ Reasoning│
            └─────┬────┘  └────┬─────┘  └─────┬────┘
                  │             │               │
                  ▼             ▼               │
            ┌─────────────────────┐             │
            │ C5: Image-Text      │             │
            │ Association         │             │
            └─────────┬──────────┘             │
                      │                         │
                      ▼                         ▼
            ┌───────────────────────────────────────┐
            │ C7: Agentic RAG (ties everything)     │
            └─────────────────┬─────────────────────┘
                              │
                              ▼
            ┌───────────────────────────────────────┐
            │ C6: Dashboard Generation              │
            │ (requires agentic + tables + numbers) │
            └───────────────────────────────────────┘
```

### Recommended Implementation Phases

| Phase                          | Capabilities                                           | Why This Order                                                                                                                                    | Duration Estimate |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **Phase A: Foundation**        | C3 (Deep Text Context)                                 | Everything depends on better chunking, query rewriting, and embedding quality. This is the single highest-impact improvement.                     | —                 |
| **Phase B: Structured Data**   | C4 (Tables) + C1 (Numeric Reasoning)                   | Once text understanding is solid, add structured data handling. Tables and numbers are closely related — extracted tables feed numeric reasoning. | —                 |
| **Phase C: Multi-Modal**       | C2 (Image Understanding) + C5 (Image-Text Association) | Images depend on the document structure parsing built in Phase A. Association depends on both image extraction and text context.                  | —                 |
| **Phase D: Agentic Core**      | C7 (Agentic RAG)                                       | The agent loop ties together all previous capabilities as tools. Must have search, table QA, and image understanding available as tools first.    | —                 |
| **Phase E: Generative Output** | C6 (Dashboard Generation)                              | Dashboards require: data extraction (C4), numeric computation (C1), visualization, and agentic planning (C7). This is the capstone capability.    | —                 |

---

## 11. Current vs Future — Complete Status Comparison

| Area                 | Current State                | After Phase A                                             | After Phase B                        | After Phase C                            | After Phase D+E (Final)               |
| -------------------- | ---------------------------- | --------------------------------------------------------- | ------------------------------------ | ---------------------------------------- | ------------------------------------- |
| **Document Parsing** | PyPDF2 text-only extraction  | Unstructured.io: headings, paragraphs, structure          | + Table extraction (pdfplumber)      | + Image extraction (PyMuPDF)             | Full multi-modal parsing              |
| **Chunking**         | Fixed 500-token windows      | Semantic: heading + paragraph boundaries, parent-child    | + Table-as-unit chunks               | + Image-composite chunks                 | Hybrid semantic + structured          |
| **Embedding**        | `all-MiniLM-L6-v2` (384d)    | `bge-large-en-v1.5` (1024d) or `e5-large-v2`              | + Numerical metadata in payload      | + CLIP embeddings for images             | Multi-modal embedding fusion          |
| **Retrieval**        | Dense-only, top-5, no rerank | Hybrid (dense + BM25), top-20 → rerank → top-5, MMR       | + Table-specific retrieval           | + Image retrieval (CLIP)                 | Agentic multi-step retrieval          |
| **Query Processing** | Raw text → embed             | Query rewrite (pronouns, HyDE), multi-query decomposition | + Numeric query detection            | + Image query detection                  | Agent plans retrieval strategy        |
| **LLM Generation**   | Single-pass, 3-line prompt   | Rich prompt, citations, CoT, confidence                   | + Tool calling (calculate)           | + Multi-modal prompts (image in context) | Full agent loop with tool use         |
| **Table Support**    | ❌ Tables lost in extraction | ❌ Still text-only                                        | ✅ Extract, store, query tables      | ✅ + Table-image association             | ✅ + Dashboard generation from tables |
| **Image Support**    | ❌ Images ignored            | ❌ Still text-only                                        | ❌ Still text-only                   | ✅ Extract, caption, search images       | ✅ + Generate charts from data        |
| **Numeric Support**  | ❌ Numbers as plain text     | ⚠️ Better embedding captures numbers                      | ✅ Extract, compute, compare numbers | ✅ + Numbers from charts/images          | ✅ + Trend analysis and forecasting   |
| **Agentic**          | ❌ Linear pipeline           | ⚠️ Query rewriting (1 extra LLM call)                     | ⚠️ + Calculator tool                 | ⚠️ + Image tools                         | ✅ Full ReAct agent with all tools    |
| **Dashboard**        | ❌ Text-only output          | ❌ Text-only output                                       | ⚠️ Can render markdown tables        | ⚠️ Can show images                       | ✅ Interactive charts, dashboards     |
| **Frontend**         | Chat-only, markdown          | + Citation links, confidence                              | + Table rendering                    | + Image display in chat                  | + Chart renderer, agent status UI     |

---

## 12. Non-Functional Requirements for Opus-Level Chatbot

| Requirement             | Target                                                    | Approach                                                        |
| ----------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| **Response latency**    | First token < 2s, full response < 15s (cloud)             | Streaming, parallel retrieval, early context routing            |
| **Agent loop latency**  | Max 5 iterations, each < 5s                               | Timeout per step, graceful termination                          |
| **Accuracy**            | > 95% answer groundedness (no hallucination)              | Post-gen grounding check, confidence thresholds, "I don't know" |
| **Retrieval precision** | > 85% precision@5 after re-ranking                        | Hybrid search + cross-encoder + MMR                             |
| **Security**            | Zero prompt injection, zero data leakage                  | Input sanitization, prompt hardening, RBAC-enforced retrieval   |
| **Cost control**        | < $0.10 per complex query (cloud LLMs)                    | Token budgeting, caching, local-first for simple queries        |
| **Scalability**         | 1000 concurrent users per tenant                          | Per-tenant collections, async processing, connection pooling    |
| **Observability**       | Full trace of every agent step                            | LangFuse/LangSmith integration, step-by-step logging            |
| **Offline capability**  | Full functionality without cloud APIs                     | SentenceTransformers + LLaVA + TinyLlama/Ollama + local Qdrant  |
| **User experience**     | Agent thinking visible, cancel mid-stream, refine results | SSE agent events, AbortController, follow-up suggestions        |

---

## 13. Risk Assessment for Advanced Capabilities

| Risk                            | Probability | Impact                                 | Mitigation                                                                     |
| ------------------------------- | ----------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| **Agent infinite loops**        | Medium      | High — stuck queries, wasted API calls | Max iteration limit (5), total timeout (30s), cost ceiling per query           |
| **Incorrect chart data**        | Medium      | High — wrong business decisions        | Validate chart data against source before rendering, show data source          |
| **Vision model hallucination**  | High        | Medium — wrong image descriptions      | Cross-reference captions with surrounding text, confidence scoring             |
| **Table extraction errors**     | Medium      | High — garbled data → wrong answers    | Multiple extractor fallback (pdfplumber → Camelot → vision), human review flag |
| **Sandbox escape**              | Low         | Critical — remote code execution       | Use `RestrictedPython` or isolated containers (E2B), no filesystem access      |
| **Model size / memory**         | Medium      | Medium — OOM on smaller servers        | Lazy model loading, model offloading, quantized models (GGUF)                  |
| **API cost explosion**          | Medium      | Medium — unexpected bills              | Per-query cost tracking, daily caps, local-first routing                       |
| **Feature creep**               | High        | Medium — delayed delivery              | Phase-gated implementation, each phase is independently valuable               |
| **Embedding re-index required** | Certain     | Medium — downtime during migration     | Versioned collections, background re-indexing, dual-read during migration      |

---

_This analysis is based on reading all 14 RAG-related source files totaling ~2500 lines of Python and ~1800 lines of TypeScript._

_**Status:** Requirements documented. Implementation is ON HOLD until design review and approval._
