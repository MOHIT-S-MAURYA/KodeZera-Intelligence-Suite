# RAG Module Closeout Audit (Validated)

Date: 2026-04-10
Owner: Platform + RAG + API teams
Scope: End-to-end RAG pipeline (ingestion, retrieval, generation, streaming, access control, quotas, analytics, and AI configuration)

## 1. Executive Status

Current status is "functional but not closeout-ready".

What is working now:

- End-to-end RAG answers can stream successfully.
- RBAC checks occur before retrieval.
- Local stack path (Ollama + local embeddings) is operational.
- Citation verification is present in both sync and stream paths.

What blocks module closure:

- Quota metering is disconnected from the active query path.
- Runtime bug in available-model detection can 500 under valid OpenAI key conditions.
- Access cache invalidation is incomplete, causing stale access decisions.
- Embedding model changes do not trigger backend migration/reindex flow.

## 2. Validated Runtime Architecture

Inbound query path (currently active):

1. POST /api/v1/rag/query/
2. DRF throttles + QuotaService.check_queries()
3. RAGQueryService.query_stream()
4. RAGPipeline.execute_query_stream()
5. DocumentAccessService.get_accessible_document_ids()
6. RAGRetriever.retrieve_with_context()
7. LLMRunner.generate_response_stream()
8. SSE stream -> frontend rag.service.ts parser -> Chat.tsx

Ingestion path:

1. Document upload/version update
2. apps.documents.tasks.process_document_task
3. DocumentProcessingService (extract + chunk)
4. EmbeddingService (provider/model from AIProviderConfig)
5. VectorStoreService.store_embeddings (Qdrant)
6. VectorChunk rows + Document status update

## 3. Critical Findings (Severity Ordered)

### P0 - Quota enforcement is effectively blind on the active stream path

Evidence:

- Quota reads from MeteringService.get_queries() in apps/core/services/quota.py.
- MeteringService increment methods are defined in apps/core/services/metering.py.
- Active endpoint uses stream path only (apps/api/views/rag.py -> query_stream).
- Stream pipeline path does not call MeteringService and does not call \_record_metrics (apps/rag/services/rag_pipeline.py).

Impact:

- Tenant query usage can remain near zero while real traffic continues.
- Quota headers and quota enforcement are not trustworthy for real stream traffic.

Required fix:

- Record query usage directly in execute_query_stream() (success + failure).
- Add failed-query metering when stream aborts/errors.
- Ensure quota reset semantics match product policy (daily vs monthly approximation).

Acceptance criteria:

- After 3 successful stream requests, metering counter increments by 3.
- Quota header used value increases accordingly.
- Quota exceeded condition blocks additional requests as expected.

### P0 - Available models endpoint can raise runtime NameError

Evidence:

- apps/api/views/platform_owner.py references OPENAI_EMBED_MODELS in available_models().
- OPENAI_EMBED_MODELS is not defined in that module.

Impact:

- If openai_embed_ok is true, endpoint can fail with 500.
- AI configuration page becomes unreliable for production key validation.

Required fix:

- Define OPENAI_EMBED_MODELS (or replace with existing canonical model list constant).

Acceptance criteria:

- available-models endpoint returns 200 for valid OpenAI embedding key.

### P1 - Access decision cache invalidation is incomplete

Evidence:

- Document access IDs cached for 15 minutes in apps/documents/services/access.py.
- Invalidation is mainly grant-focused (create/revoke) from apps/api/views/documents.py.
- UserRole signals invalidate RBAC permission caches, not DocumentAccessService cache (apps/rbac/models.py).
- Org membership add/remove flows do not invalidate document access cache (apps/core/services/org_hierarchy.py).
- Expired UserOrgUnit cleanup does not invalidate document access cache (apps/rbac/tasks.py).

Impact:

- Users can temporarily retain stale access (or stale denial) after role/org changes.
- Behavior appears nondeterministic in access-sensitive demos.

Required fix:

- Add DocumentAccessService.invalidate_cache(user_id) hooks on:
  - UserRole create/update/delete
  - UserOrgUnit add/remove/expire
  - Role hierarchy cache bust operations for affected users
- Add invalidation when document visibility/classification/status changes.

Acceptance criteria:

- Access changes are reflected immediately without manual cache clears.

### P1 - Embedding model change has no enforced backend migration workflow

Evidence:

- AI config update endpoint only persists config (apps/api/views/platform_owner.py, ai_config_update).
- vector_store.recreate_collection() exists but is not wired to an orchestration path.
- store_embeddings() skips chunks when dimensions mismatch (apps/rag/services/vector_store.py).
- process_document_task marks document completed using len(chunks), even if vectors stored are partial/zero.

Impact:

- Silent retrieval degradation after embedding model changes.
- "Completed" document status can be false-positive relative to indexed vectors.

Required fix:

- Add explicit reindex workflow state after embedding provider/model change.
- Fail processing when zero vectors are stored for non-empty chunks.
- Provide bulk reindex command/API (tenant or global scope).

Acceptance criteria:

- Model switch sets system state to reindex-required.
- Reindex run returns all documents indexed with vector count > 0.

### P1 - AI availability cache is stale after config update

Evidence:

- available_models() caches response for 300 seconds using platform_ai_available_models key.
- ai_config_update() does not clear that key.

Impact:

- Platform owner sees stale provider readiness right after saving new keys/model.

Required fix:

- Invalidate platform_ai_available_models cache in ai_config_update().

Acceptance criteria:

- available-models reflects new key/provider state immediately after update.

### P2 - Analytics quality is incomplete for cost/usage correctness

Evidence:

- \_record_metrics() sets tokens_in=0 and tokens_out=0 (apps/rag/services/rag_pipeline.py).
- record_query_analytics() estimates cost with provider=getattr(model_used, 'provider', 'unknown') while model_used is a string (apps/analytics/services/query_analytics.py).

Impact:

- Cost and token analytics are materially inaccurate.
- Operational decisions based on analytics are low confidence.

Required fix:

- Parse provider/model explicitly from config.
- Capture real token usage from provider responses where possible.

Acceptance criteria:

- Query analytics records non-zero tokens for provider responses.
- Cost estimates vary by provider/model as expected.

### P2 - SSE contract variants increase client complexity and edge risk

Evidence:

- Stream emits different terminal shapes across branches in apps/rag/services/rag_pipeline.py:
  - metadata event
  - chunk events
  - done event
  - error-only event (without done)
  - no-access branch returns answer+done in single event

Impact:

- Frontend parser must support multiple terminal conventions.
- Harder to evolve protocol safely.

Required fix:

- Standardize event schema: start, chunk, error, done.
- Always emit done with terminal status.

Acceptance criteria:

- One schema contract documented and validated in integration tests.

### P2 - Module test coverage is insufficient for closure confidence

Evidence:

- apps/rag/tests.py has limited unit tests only.
- apps/api/tests.py, apps/documents/tests.py, and apps/core/tests.py are largely placeholders.

Impact:

- High regression risk for access, streaming, and configuration changes.

Required fix:

- Add focused tests for:
  - stream protocol contract
  - quota metering integration
  - access-cache invalidation events
  - embedding switch + reindex requirement

Acceptance criteria:

- CI includes these test suites and passes on clean environment.

## 4. Non-Blocking but Important Observations

- Retriever already includes lightweight follow-up rewrite + lexical-semantic fusion; previous docs claiming "no rewrite/no rerank" are outdated.
- Chat session list prefetches all messages in list path, which may become expensive as tenant history grows.
- Document access ancestor resolution currently loops per org unit and can be optimized for large memberships.

## 5. Closeout Plan (One-and-Done Sequence)

Phase 1: Correctness blockers (P0)

- Wire stream metering and quota alignment.
- Fix OPENAI_EMBED_MODELS runtime bug.

Phase 2: Access consistency (P1)

- Add cache invalidation hooks across role/org/document mutation events.
- Add tests proving immediate access consistency.

Phase 3: Embedding lifecycle safety (P1)

- Introduce reindex-required state on embedding change.
- Implement bulk reindex path and completion reporting.
- Prevent false "completed" document state when vectors are missing.

Phase 4: Observability and contract hardening (P2)

- Standardize SSE event contract.
- Correct token/cost analytics.
- Expand integration tests for stream + config + access.

## 6. Definition of Done for RAG Module Closure

- P0 issues resolved and verified in staging.
- Access changes reflect immediately without manual cache clear.
- Embedding model change has explicit migration/reindex workflow.
- No undefined symbol/runtime errors in platform AI endpoints.
- Quota counters reflect real stream traffic.
- SSE contract documented and stable.
- Integration tests added for stream/access/quota/reindex.
- Dashboard metrics for RAG queries and token usage are non-zero and plausible.
- Runbook exists for provider key rotation, embedding switch, and reindex.

## 7. Files Reviewed During Audit

- apps/api/views/rag.py
- apps/rag/services/rag_query.py
- apps/rag/services/rag_pipeline.py
- apps/rag/services/retriever.py
- apps/rag/services/llm_runner.py
- apps/rag/services/vector_store.py
- apps/rag/services/embeddings.py
- apps/rag/services/citation_verifier.py
- apps/documents/services/access.py
- apps/documents/tasks.py
- apps/api/views/documents.py
- apps/core/services/quota.py
- apps/core/services/metering.py
- apps/core/throttle.py
- apps/rbac/models.py
- apps/rbac/tasks.py
- apps/core/services/org_hierarchy.py
- apps/api/views/platform_owner.py
- apps/api/serializers/ai_config.py
- apps/analytics/services/collector.py
- apps/analytics/services/query_analytics.py
- frontend/src/services/rag.service.ts
- frontend/src/pages/Chat.tsx

## 8. Suggested Immediate Next PR

Small, high-confidence PR to de-risk production quickly:

1. Fix OPENAI_EMBED_MODELS undefined constant.
2. Invalidate available-models cache in ai_config_update().
3. Add stream-path metering increments.
4. Add one integration test covering quota counter increment after streaming query.
