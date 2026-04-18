# Chatbot Implementation Ticket Backlog

Date: 2026-04-14
Owner: Product + Engineering Managers
Status: Ready for issue creation
Source: 10_chatbot_system_development_guide.md

## 1. How to Use This Backlog

- Create one tracker issue per ticket ID.
- Keep acceptance criteria unchanged unless Product + Tech Lead approve edits.
- Do not pull Sprint N+1 tickets into current sprint until dependencies are done.
- If scope changes, update this file first, then sync issues.

## 2. Step-to-Ticket Mapping

| Guide Step                                 | Ticket IDs                |
| ------------------------------------------ | ------------------------- |
| Step 0 - Freeze Requirements and Contracts | CBT-001, CBT-002, CBT-003 |
| Step 1 - Decompose Chat UI Architecture    | CBT-004, CBT-005          |
| Step 2 - Adaptive and Dynamic Layout       | CBT-006, CBT-007          |
| Step 3 - Standardize Stream Protocol       | CBT-008, CBT-009, CBT-010 |
| Step 4 - Multimodal Rendering Blocks       | CBT-011, CBT-012          |
| Step 5 - Security Boundaries End-to-End    | CBT-013, CBT-014, CBT-015 |
| Step 6 - Retrieval and Synthesis Accuracy  | CBT-016, CBT-017, CBT-018 |
| Step 7 - Scalability and Performance       | CBT-019, CBT-020, CBT-021 |
| Step 8 - Action and HITL Flow              | CBT-022, CBT-023, CBT-024 |
| Step 9 - Reindex and Model Change Workflow | CBT-025                   |
| Step 10 - QA, Rollout, and Release Gate    | CBT-026, CBT-027          |

## 3. Sprint 1 Tickets (Step 0 to Step 2)

### CBT-001 - Freeze SSE stream event contract

- Teams: Backend, Frontend
- Labels: chatbot, sprint-1, api-contract
- Estimate: 3 points
- Dependencies: None
- Scope:
  - Define canonical SSE events: start, metadata, chunk, action_required, error, done.
  - Define required and optional fields for each event.
  - Publish valid and invalid payload examples.
- Acceptance criteria:
  - FE and BE leads approve one shared contract document.
  - Contract includes JSON examples for all event types.
  - Error and completion semantics are unambiguous.

### CBT-002 - Freeze responsive behavior matrix by breakpoint

- Teams: Frontend, Design
- Labels: chatbot, sprint-1, responsive-ui
- Estimate: 3 points
- Dependencies: None
- Scope:
  - Define exact behavior for mobile (<768), tablet (768-1024), desktop (>1024).
  - Define sidebar, composer, and message column behavior per breakpoint.
  - Document keyboard/safe-area handling requirements.
- Acceptance criteria:
  - Matrix reviewed and approved by Design + FE lead.
  - Includes spacing, typography, and max bubble width rules.
  - Covers landscape and portrait behavior on mobile and tablet.

### CBT-003 - Security boundaries and approval flow checklist

- Teams: Security, Backend, Product
- Labels: chatbot, sprint-1, security
- Estimate: 5 points
- Dependencies: None
- Scope:
  - Define non-negotiable boundaries: no LLM auth decisions, retrieval pre-filter required.
  - Define HITL approval requirements for all action flows.
  - Define audit evidence required for compliance.
- Acceptance criteria:
  - Checklist signed by Security and Backend leads.
  - Includes threat scenarios: prompt injection, action spoofing, unauthorized retrieval.
  - Includes required test evidence for release gate.

### CBT-004 - Split Chat page into feature modules

- Teams: Frontend
- Labels: chatbot, sprint-1, frontend-architecture
- Estimate: 8 points
- Dependencies: CBT-002
- Scope:
  - Extract ChatShell, ConversationSidebar, MessageViewport, MessageComposer, SourcesPanel, ActionApprovalModal, StreamStatusBar.
  - Keep current behavior unchanged while refactoring structure.
- Acceptance criteria:
  - Chat page is composition-first and behavior parity is maintained.
  - New modules are under frontend/src/features/chat/.
  - Main page file is below 300 lines.

### CBT-005 - Extract chat state orchestration into hooks/store

- Teams: Frontend
- Labels: chatbot, sprint-1, frontend-state
- Estimate: 5 points
- Dependencies: CBT-004
- Scope:
  - Implement useChatSessions, useChatMessages, useChatStream.
  - Move stream lifecycle and message mutation out of page component.
- Acceptance criteria:
  - State transitions are deterministic for start, chunk, error, done.
  - Unit tests cover critical transitions and reducer logic.
  - No regressions in session switching and message rendering.

### CBT-006 - Build adaptive shell (drawer, collapse, resize)

- Teams: Frontend
- Labels: chatbot, sprint-1, responsive-ui
- Estimate: 8 points
- Dependencies: CBT-002, CBT-004
- Scope:
  - Mobile drawer sidebar.
  - Tablet collapsible sidebar.
  - Desktop persistent resizable sidebar (min 260, max 360).
- Acceptance criteria:
  - Sidebar behavior matches matrix across breakpoints.
  - No overlap with header/composer on common viewport sizes.
  - Resize state is preserved during session lifecycle.

### CBT-007 - Finish adaptive viewport and visual QA pack

- Teams: Frontend, QA
- Labels: chatbot, sprint-1, qa
- Estimate: 5 points
- Dependencies: CBT-006
- Scope:
  - Apply 100dvh layout with sticky composer and safe-area support.
  - Enforce message column width clamp and composer alignment.
  - Produce screenshot pack for standard devices.
- Acceptance criteria:
  - No dead whitespace, clipping, or keyboard overlap in target devices.
  - Screenshot evidence added for mobile, tablet, desktop.
  - QA sign-off logged.

## 4. Sprint 2 Tickets (Step 3 to Step 5)

### CBT-008 - Implement canonical SSE event emission in backend

- Teams: Backend, RAG
- Labels: chatbot, sprint-2, backend-streaming
- Estimate: 8 points
- Dependencies: CBT-001
- Scope:
  - Update emission path in apps/rag/services/rag_pipeline.py.
  - Emit only canonical event types and required fields.
- Acceptance criteria:
  - Stream always starts with start and terminates with done.
  - Error path emits error then done.
  - Payloads validate against contract.

### CBT-009 - Refactor frontend stream parser to typed event model

- Teams: Frontend
- Labels: chatbot, sprint-2, frontend-streaming
- Estimate: 5 points
- Dependencies: CBT-001, CBT-005
- Scope:
  - Replace loose parser branches with typed event handlers.
  - Add strict interfaces for each event type.
- Acceptance criteria:
  - Parser has one deterministic path for all event types.
  - Invalid payloads are surfaced with typed errors.
  - Done and error terminal behavior is consistent.

### CBT-010 - Add contract tests for stream lifecycle

- Teams: Backend, Frontend, QA
- Labels: chatbot, sprint-2, testing
- Estimate: 5 points
- Dependencies: CBT-008, CBT-009
- Scope:
  - Add backend and frontend tests for start -> chunk\* -> done.
  - Add tests for error -> done and action_required sequences.
- Acceptance criteria:
  - Test suite covers happy path and failure path.
  - Any contract drift fails CI.
  - Test fixtures reflect production payload shape.

### CBT-011 - Implement multimodal block renderer registry

- Teams: Frontend
- Labels: chatbot, sprint-2, multimodal-ui
- Estimate: 8 points
- Dependencies: CBT-009
- Scope:
  - Add registry and renderers: text, table, chart, image, source_list, action_card.
  - Support mixed block rendering in one message.
- Acceptance criteria:
  - Each block type renders with graceful fallback.
  - Mixed block payload displays in one message render pass.
  - Unknown block type does not break message viewport.

### CBT-012 - Harden markdown and image rendering pipeline

- Teams: Frontend, Security
- Labels: chatbot, sprint-2, security-ui
- Estimate: 5 points
- Dependencies: CBT-011
- Scope:
  - Add markdown sanitization and safe HTML fallback.
  - Handle expiring image URLs with refresh strategy.
- Acceptance criteria:
  - XSS payload tests are blocked.
  - Expired image URLs recover without page reload.
  - Security review approval recorded.

### CBT-013 - Enforce retrieval pre-filter guarantees

- Teams: Backend, RAG, Security
- Labels: chatbot, sprint-2, security-retrieval
- Estimate: 8 points
- Dependencies: CBT-003
- Scope:
  - Verify every retrieval path includes allowed doc metadata filter.
  - Add guardrails that reject unfiltered retrieval queries.
- Acceptance criteria:
  - Integration tests fail on missing filter injection.
  - Unauthorized retrieval attempts are blocked and audited.
  - Red-team replay confirms safe behavior.

### CBT-014 - Add approval-token enforcement for action execution

- Teams: Backend, Security
- Labels: chatbot, sprint-2, hitl-security
- Estimate: 5 points
- Dependencies: CBT-003
- Scope:
  - Require signed approval token for action execution endpoints.
  - Reject execution without valid explicit user decision.
- Acceptance criteria:
  - Action endpoints cannot execute without approval token.
  - Reject path logs actor, timestamp, reason.
  - Replay or tampered token attempts are denied.

### CBT-015 - Build adversarial security test suite for chatbot flow

- Teams: Security, QA
- Labels: chatbot, sprint-2, security-testing
- Estimate: 5 points
- Dependencies: CBT-012, CBT-013, CBT-014
- Scope:
  - Add test scenarios for prompt injection, unauthorized retrieval, action spoofing.
  - Add expected-safe outcome assertions.
- Acceptance criteria:
  - All adversarial tests pass in staging.
  - Failures produce actionable logs and traces.
  - Security team signs off on residual risk.

## 5. Sprint 3 Tickets (Step 6 to Step 7)

### CBT-016 - Add retrieval quality control policies

- Teams: RAG
- Labels: chatbot, sprint-3, retrieval-quality
- Estimate: 8 points
- Dependencies: CBT-013
- Scope:
  - Implement score thresholds, chunk diversity, and context compression.
  - Add confidence tagging for final synthesis.
- Acceptance criteria:
  - Low-quality retrieval is filtered before synthesis.
  - Policies are configurable and documented.
  - Regression tests confirm expected behavior.

### CBT-017 - Improve query rewrite and follow-up handling

- Teams: RAG
- Labels: chatbot, sprint-3, query-understanding
- Estimate: 5 points
- Dependencies: CBT-016
- Scope:
  - Add rewrite pipeline for underspecified queries.
  - Improve follow-up question grounding to prior turns.
- Acceptance criteria:
  - Follow-up accuracy improves on benchmark set.
  - Rewrite pipeline does not degrade direct queries.
  - Behavior is measurable via offline eval outputs.

### CBT-018 - Build retrieval evaluation dataset and quality dashboard

- Teams: RAG, Analytics
- Labels: chatbot, sprint-3, metrics
- Estimate: 8 points
- Dependencies: CBT-016, CBT-017
- Scope:
  - Curate eval set and measurement scripts.
  - Publish hit@k, citation validity, low-confidence rate dashboard.
- Acceptance criteria:
  - Eval runs are repeatable and versioned.
  - Dashboard updates from latest eval artifacts.
  - Product approves threshold targets.

### CBT-019 - Frontend performance hardening for long conversations

- Teams: Frontend
- Labels: chatbot, sprint-3, frontend-performance
- Estimate: 8 points
- Dependencies: CBT-011
- Scope:
  - Virtualize long message lists.
  - Lazy load historical messages.
  - Memoize expensive block renderers.
- Acceptance criteria:
  - Message scroll remains smooth on long threads.
  - Memory use does not grow unbounded.
  - User-visible behavior remains unchanged.

### CBT-020 - Backend streaming resilience and budget controls

- Teams: Backend, Infra
- Labels: chatbot, sprint-3, backend-performance
- Estimate: 8 points
- Dependencies: CBT-008
- Scope:
  - Add stream heartbeat for long responses.
  - Isolate ingestion and query queues.
  - Enforce context and token budgets per request.
- Acceptance criteria:
  - Long streams no longer drop without heartbeat.
  - Queue contention does not starve query traffic.
  - Budget violations fail gracefully with clear error payload.

### CBT-021 - Load test and latency target validation

- Teams: QA, Infra, Backend
- Labels: chatbot, sprint-3, load-testing
- Estimate: 5 points
- Dependencies: CBT-019, CBT-020
- Scope:
  - Run load baseline and post-optimization runs.
  - Validate P95 first-token and full-response latency targets.
- Acceptance criteria:
  - Report includes before/after comparison and bottlenecks.
  - If target missed, remediation tasks are filed.
  - Results approved by Engineering Manager.

## 6. Sprint 4 Tickets (Step 8 to Step 10)

### CBT-022 - Add action_required event and resume workflow APIs

- Teams: Backend, RAG
- Labels: chatbot, sprint-4, hitl-backend
- Estimate: 5 points
- Dependencies: CBT-008, CBT-014
- Scope:
  - Emit action_required payloads with clear action summary.
  - Implement approve/reject resume endpoints.
- Acceptance criteria:
  - Action workflow pauses and resumes deterministically.
  - Resume endpoints validate user and tenant context.
  - Event payloads follow frozen contract.

### CBT-023 - Implement approval modal and action card wiring

- Teams: Frontend
- Labels: chatbot, sprint-4, hitl-frontend
- Estimate: 5 points
- Dependencies: CBT-011, CBT-022
- Scope:
  - Render action cards from stream events.
  - Build approve/reject modal with reason capture.
- Acceptance criteria:
  - Users can approve or reject with clear UX feedback.
  - Submission states and retries are handled safely.
  - UI remains responsive on mobile/tablet/desktop.

### CBT-024 - Add complete audit trail for HITL decisions

- Teams: Backend, Audit/Compliance
- Labels: chatbot, sprint-4, audit
- Estimate: 3 points
- Dependencies: CBT-022
- Scope:
  - Log action decision, actor, tenant, timestamp, reason, outcome.
  - Correlate logs to request/session/message identifiers.
- Acceptance criteria:
  - Every decision is queryable in audit logs.
  - Missing reason is rejected where required by policy.
  - Compliance lead validates retained evidence.

### CBT-025 - Operationalize embedding reindex workflow

- Teams: Backend, Platform
- Labels: chatbot, sprint-4, reindex
- Estimate: 8 points
- Dependencies: CBT-020
- Scope:
  - Formalize model-change to reindex-required state flow.
  - Wire admin progress visibility and rollout runbook.
- Acceptance criteria:
  - Model changes cannot bypass reindex-required flag.
  - Reindex command status is visible to operators.
  - Runbook validated in staging dry run.

### CBT-026 - Execute release QA matrix and regressions

- Teams: QA, Frontend, Backend, Security
- Labels: chatbot, sprint-4, release-qa
- Estimate: 8 points
- Dependencies: CBT-015, CBT-021, CBT-023, CBT-025
- Scope:
  - Execute full checklist: stream, multimodal, responsive layouts, access controls, HITL.
  - Run regression and smoke tests for critical paths.
- Acceptance criteria:
  - No P0/P1 defects remain open for staging sign-off.
  - Blocking P2 defects have approved mitigation plans.
  - QA lead signs release readiness record.

### CBT-027 - Tenant-cohort rollout and production release gate

- Teams: Product, Ops, Backend, Frontend, Security
- Labels: chatbot, sprint-4, rollout
- Estimate: 5 points
- Dependencies: CBT-026
- Scope:
  - Roll out by tenant cohorts with monitoring checkpoints.
  - Enforce release gate criteria and rollback triggers.
- Acceptance criteria:
  - Pilot tenants pass monitoring window without critical incidents.
  - Rollback playbook is verified and on-call owners assigned.
  - Final release approval is signed by FE, BE, Security, QA.

## 7. Release Gate Checklist Snapshot

- Contract frozen and versioned.
- Responsive UI behavior approved and validated.
- Security boundaries verified with adversarial tests.
- Retrieval quality targets met.
- Performance targets met.
- HITL flow and audit trail validated.
- Reindex workflow documented and tested.
- Staging and pilot rollout sign-offs complete.
