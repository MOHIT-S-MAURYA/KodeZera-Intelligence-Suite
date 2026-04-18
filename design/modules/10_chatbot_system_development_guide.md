# Chatbot System Development Guide (Adaptive, Secure, Scalable)

Date: 2026-04-11
Owner: Product + Frontend + Backend + RAG Teams
Status: Execution Guide

## 1. Purpose

This guide converts the new chatbot design into an executable development plan for the current Kodezera codebase.

Primary goals:

- Security: strict document-bound authorization, safe execution, no auth decisions by LLM.
- Scalability: stable streaming, efficient UI state, queue-based ingestion, measurable performance.
- Accuracy: better retrieval quality, citation grounding, deterministic data computation.
- Adaptive UI: responsive layout with minimal wasted space across mobile, tablet, desktop.

## 2. Scope Alignment (Current Repo vs Target Design)

Current live base:

- Backend: Django + DRF + Celery + Redis + Qdrant
- Frontend: React + TypeScript + Tailwind
- RAG stream endpoint: apps/api/views/rag.py
- RAG orchestration: apps/rag/services/rag_pipeline.py
- Chat UI: frontend/src/pages/Chat.tsx

Design adaptation decision:

- Do not rewrite backend framework now.
- Implement the new chatbot design on current Django/DRF stack.
- Introduce agent-style orchestration incrementally inside the existing RAG service layer.

## 3. Development Phases (Step-by-Step)

## Step 0: Freeze Requirements and Contracts

Tasks:

- Finalize message/event contract for streaming payloads.
- Finalize responsive behavior by breakpoint.
- Finalize security boundaries and approval flow for actions.

Deliverables:

- Streaming contract doc (JSON event types + required fields).
- Responsive behavior matrix.
- Security checklist.

Done when:

- Backend and frontend teams sign off on one shared contract.

## Step 1: Decompose Chat UI Architecture

Tasks:

- Split monolithic Chat page into modules:
  - ChatShell
  - ConversationSidebar
  - MessageViewport
  - MessageComposer
  - SourcesPanel
  - ActionApprovalModal
  - StreamStatusBar
- Move state orchestration into a dedicated hook/store:
  - useChatSessions
  - useChatMessages
  - useChatStream

Deliverables:

- New folder structure under frontend/src/features/chat/.
- Chat.tsx reduced to composition layer.

Done when:

- Chat.tsx is mostly orchestration and under 300 lines.

## Step 2: Implement Adaptive and Dynamic Layout

Tasks:

- Implement responsive shell:
  - Mobile (<768): sidebar as drawer, chat full-width.
  - Tablet (768-1024): collapsible sidebar, compact composer.
  - Desktop (>1024): persistent sidebar with adjustable width (min 260, max 360).
- Prevent wasted horizontal space:
  - Message column width: clamp(320px, 72vw, 980px).
  - Composer width matches message column.
- Make height truly adaptive:
  - Use 100dvh layout.
  - Sticky composer with safe-area support.

Deliverables:

- Responsive ChatShell with drawer/collapse/resize logic.
- Device-level visual QA screenshots.

Done when:

- No horizontal clipping, no overlap, and no dead whitespace on common resolutions.

## Step 3: Standardize Stream Protocol (Backend + Frontend)

Tasks:

- Replace loose SSE parsing with explicit event model:
  - start
  - metadata
  - chunk
  - action_required
  - error
  - done
- Update backend emission in apps/rag/services/rag_pipeline.py.
- Update parser in frontend/src/services/rag.service.ts.

Deliverables:

- Typed TypeScript interfaces for each stream event.
- One parser path handling all events deterministically.

Done when:

- Stream parser has no ambiguous branches and always ends with done or error+done.

## Step 4: Add Multimodal Rendering Blocks

Tasks:

- Introduce renderer registry by block type:
  - text
  - table
  - chart
  - image
  - source_list
  - action_card
- Add safe markdown rendering and sanitized HTML fallback.
- Add image component that supports expiring presigned URLs and refresh handling.

Deliverables:

- BlockRenderer component set.
- Contract between backend payload blocks and frontend renderers.

Done when:

- Same message can include mixed content blocks in one render pass.

## Step 5: Enforce Security Boundaries End-to-End

Tasks:

- Keep authorization pre-filter at retrieval level only.
- Ensure every retrieval call enforces allowed doc IDs metadata filter.
- For action flows, require human approval token before execution.
- Harden markdown/image rendering against injection.
- Verify sandbox execution has no external network access.

Deliverables:

- Security test cases for prompt injection, unauthorized retrieval, action spoofing.
- Documented approval flow with audit trace.

Done when:

- Red-team style scenarios fail safely.

## Step 6: Accuracy Improvements in Retrieval and Synthesis

Tasks:

- Add retrieval quality controls:
  - retrieval score thresholds
  - chunk diversity rules
  - context compression logic
- Expand query rewriting and follow-up handling.
- Enforce citation quality rules before final response.

Deliverables:

- Retrieval eval dataset and evaluation script usage plan.
- Quality dashboard metrics:
  - hit@k
  - citation validity
  - low-confidence response rate

Done when:

- Evaluation metrics reach target thresholds agreed by product.

## Step 7: Scalability and Performance Hardening

Tasks:

- Frontend:
  - virtualize long message lists
  - lazy load older session messages
  - memoize heavy renderers
- Backend:
  - add stream heartbeat for long responses
  - ensure queue isolation for ingestion vs query paths
  - cap context and token budgets per request

Deliverables:

- Performance budget document.
- Load test baseline and post-optimization report.

Done when:

- P95 first-token and full-response latency targets are met.

## Step 8: Introduce Action/HITL Flow

Tasks:

- Add action_required event payload with clear action summary.
- Build approval modal with Approve/Reject and reason.
- Resume backend workflow after user decision.

Deliverables:

- Action card UI + approval API wiring.
- Audit logs for every approval/rejection.

Done when:

- Action requests are impossible to execute without explicit user confirmation.

## Step 9: Add Operational Reindex and Model Change Workflow

Tasks:

- Keep reindex-required state on embedding model change.
- Run bulk reindex command for rollout windows.
- Add progress visibility in platform UI.

Deliverables:

- Runbook for model switch + reindex + validation.
- Admin checklist for safe rollout.

Done when:

- Embedding changes never silently degrade retrieval.

## Step 10: QA, Staging Rollout, and Release Gate

Tasks:

- Execute full functional checklist:
  - chat stream
  - multimodal blocks
  - mobile/tablet/desktop layouts
  - access controls
  - action approval flow
- Run regression tests and smoke tests.
- Conduct staged rollout by tenant cohort.

Deliverables:

- Release checklist signed by FE, BE, Security, QA.
- Post-release monitoring plan.

Done when:

- No P0/P1 defects remain in staging and pilot tenants.

## 4. UI Adaptation Rules (Mandatory)

Rules:

- No fixed wide chat container that wastes space.
- Sidebar must be collapsible and become a drawer on mobile.
- Composer and message panel must respect viewport height and keyboard overlap.
- Every panel must support overflow without clipping menus/modals.
- Use one spacing scale and one typography scale per breakpoint.

Breakpoint behavior:

- Mobile (<768):
  - Sidebar hidden by default.
  - Header controls condensed to icon actions.
  - Message bubbles max width 92%.
- Tablet (768-1024):
  - Sidebar toggle, default collapsed.
  - Message bubbles max width 80%.
- Desktop (>1024):
  - Sidebar visible, resizable.
  - Message bubbles max width 70%.

## 5. Suggested Execution Timeline

Sprint 1:

- Step 0, Step 1, Step 2

Sprint 2:

- Step 3, Step 4, Step 5

Sprint 3:

- Step 6, Step 7

Sprint 4:

- Step 8, Step 9, Step 10

## 6. Definition of Done (Final Chatbot Build-Ready)

All must be true:

- Stream contract standardized and stable.
- Chat UI modularized and fully responsive.
- Authorization pre-filter guaranteed for all retrieval paths.
- HITL action flow implemented with audits.
- Retrieval quality metrics meet agreed targets.
- Reindex workflow operational and documented.
- Staging validation complete with no open P0/P1 defects.

## 7. Immediate Next Actions

1. Approve this guide as baseline.
2. Create tracker issues using 10_chatbot_implementation_ticket_backlog.md.
3. Start Sprint 1 with UI decomposition and responsive shell.

## 8. Implementation Backlog Reference

- Ticket-ready backlog: 10_chatbot_implementation_ticket_backlog.md
