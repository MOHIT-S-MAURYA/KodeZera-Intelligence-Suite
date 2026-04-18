# Chatbot Feature Implementation and Test Guide

Date: 2026-04-15
Owner: Product + Frontend + Backend + QA
Status: Active and verified

## 1. What Was Verified First

The following checks were executed before adding new implementation work:

1. Backend unit tests (RAG module)
   - Command: /Users/mohitmaurya/dev/internship/.venv/bin/python manage.py test apps.rag.tests -v 2
   - Result: PASS (3 tests)
2. Frontend production build
   - Command: npm run build (from frontend)
   - Result: PASS

## 2. Implemented Features and How To Test Each One

## Feature A: Canonical streaming event contract

Implemented in:

- apps/rag/services/rag_pipeline.py
- frontend/src/services/rag.service.ts

Behavior:

- Stream event envelope is explicit and typed: start, metadata, chunk, heartbeat, error, done.
- Stream ends deterministically with done on success and on failure paths.

How to test:

1. Open chat and send a normal question.
2. In browser network tools, inspect /api/v1/rag/query/ stream payloads.
3. Verify first event is start.
4. Verify metadata appears before chunks.
5. Verify terminal done event is present.

Expected result:

- Client does not hang waiting for completion.
- StreamStatusBar transitions to completed or error.

## Feature B: Frontend typed stream parser with compatibility fallback

Implemented in:

- frontend/src/services/rag.service.ts
- frontend/src/features/chat/hooks/useChatStream.ts

Behavior:

- Parser handles canonical envelope and keeps fallback support for legacy payload shapes.
- Parse failures emit typed error and terminal done.

How to test:

1. Send a normal query and verify response streams as text.
2. Force a backend stream error (for example, temporary retrieval failure) and verify error bubble appears.
3. Confirm stream status transitions to error and does not stay loading.

Expected result:

- No ambiguous parser branch behavior.
- UI always reaches a terminal state.

## Feature C: Modular chat architecture and responsive shell

Implemented in:

- frontend/src/pages/Chat.tsx
- frontend/src/features/chat/hooks/useChatSessions.ts
- frontend/src/features/chat/hooks/useChatMessages.ts
- frontend/src/features/chat/hooks/useChatStream.ts
- frontend/src/features/chat/components/ChatShell.tsx
- frontend/src/features/chat/components/ConversationSidebar.tsx
- frontend/src/features/chat/components/MessageViewport.tsx
- frontend/src/features/chat/components/MessageComposer.tsx
- frontend/src/features/chat/components/StreamStatusBar.tsx

Behavior:

- Chat page is composition-first with hooks and feature components.
- Responsive behavior:
  - Mobile: sidebar drawer
  - Tablet: collapsible sidebar
  - Desktop: resizable sidebar (260-360)
- Message and composer column width follows clamp(320px, 72vw, 980px).

How to test:

1. Open chat on mobile viewport (<768): verify sidebar opens as overlay drawer.
2. Open chat on tablet viewport (768-1024): verify collapse toggle works.
3. Open chat on desktop (>1024): verify sidebar can be resized and stays in limits.
4. Verify composer stays usable and visible when chat grows.

Expected result:

- No clipping and minimal wasted whitespace.
- Stable send/stream behavior across breakpoints.

## Feature D: Multimodal block rendering foundation

Implemented in:

- frontend/src/features/chat/components/BlockRenderer.tsx
- frontend/src/services/rag.service.ts

Behavior:

- Renderer supports text, table, chart, image, source_list, action_card blocks.
- Sources render safely as structured panel.

How to test:

1. Trigger messages with block payloads (dev fixtures or backend payload injection).
2. Verify each block type renders without crashing viewport.
3. Verify unknown or missing data fails gracefully.

Expected result:

- Mixed content message renders in one pass.
- No hard crash in chat viewport.

## Feature E: HITL action-required pause and token-gated decision

Implemented in:

- apps/rag/services/rag_pipeline.py
- apps/rag/services/rag_query.py
- apps/api/views/rag.py
- apps/api/urls.py
- frontend/src/features/chat/hooks/useChatStream.ts
- frontend/src/features/chat/components/ActionApprovalModal.tsx
- frontend/src/services/rag.service.ts

Behavior:

- Explicit action prompts (action:, /action, execute:) emit action_required event.
- Backend issues signed approval token bound to user/tenant/session and caches pending action state.
- Decision endpoint requires approval_token and validates integrity and ownership.
- Approve/reject appends assistant confirmation message and audit event.

How to test:

1. In chat, send: action: revoke access for document X.
2. Verify stream status becomes awaiting approval and modal appears.
3. Approve with reason.
4. Verify assistant confirmation is appended and chat session updates.
5. Repeat with reject and verify rejection confirmation.
6. Retry same decision request with same token (replay) and verify request is rejected.

Expected result:

- No action decision succeeds without valid approval token.
- Replay attempts are denied.

## 3. Next Implementation Completed

Next items implemented:

1. Added automated backend tests for action-required stream flow and approval-token decision lifecycle.
2. Added API-level tests for rag/action-decision authentication, invalid token rejection, success path, and replay denial.
3. Added API-level stream contract tests for /api/v1/rag/query/ lifecycle ordering across success, failure, and awaiting-action paths.
4. Added frontend test tooling (Vitest + jsdom + React Testing Library) and project test scripts.
5. Added frontend integration tests for awaiting_action hook transitions and action approval modal decision handling.
6. Added frontend service-level integration tests for parser/runtime stream failure terminal fallbacks.
7. Added browser-level Playwright E2E coverage for HITL action flow with request payload assertions (approve + reject paths).
8. Added CI workflow wiring so frontend unit tests and Playwright E2E tests run on pull requests.
9. Added browser-level E2E coverage for invalid and expired approval-token 403 paths with modal-stays-open and error-toast assertions.
10. Added CI artifact upload for Playwright traces/screenshots on failures.

Implemented test coverage in:

- apps/rag/tests.py
- apps/api/tests.py
- frontend/src/features/chat/hooks/useChatStream.test.tsx
- frontend/src/features/chat/components/ActionApprovalModal.test.tsx
- frontend/src/services/rag.service.test.ts
- frontend/e2e/hitl-action-flow.spec.ts
- .github/workflows/ci.yml

Automated tests added:

1. test_stream_emits_action_required_for_explicit_action_prompt
2. test_action_decision_approve_and_replay_protection
3. test_action_decision_reject_requires_valid_token
4. test_action_decision_requires_authentication
5. test_action_decision_rejects_invalid_token
6. test_action_decision_success_returns_resumed_payload
7. test_action_decision_replay_is_denied
8. test_query_stream_success_emits_ordered_terminal_events
9. test_query_stream_generation_failure_emits_error_then_done
10. test_query_stream_action_request_emits_awaiting_action_terminal_state
11. test_query_stream_retrieval_failure_emits_error_then_done
12. transitions to awaiting_action when action_required stream event is received
13. submits approve decision and resets pending state after resume
14. does not render content when there is no pending action
15. submits trimmed reason on approve
16. submits trimmed reason on reject
17. keeps pending action when decision submission fails
18. emits parse_error and done fallback when SSE payload cannot be parsed
19. emits stream_runtime_error and done fallback when fetch throws
20. emits missing_terminal_event fallback when stream closes without done
21. shows approval modal and resumes conversation after approve (E2E)
22. submits rejection decision and appends rejection assistant message (E2E)
23. keeps approval modal open when decision fails with invalid token (E2E)
24. keeps approval modal open when decision fails with expired token (E2E)

Execution:

1. /Users/mohitmaurya/dev/internship/.venv/bin/python manage.py test apps.rag.tests -v 2
   - Result: PASS (6 tests)
2. /Users/mohitmaurya/dev/internship/.venv/bin/python manage.py test apps.api.tests apps.rag.tests -v 2
   - Result: PASS (14 tests)
3. /Users/mohitmaurya/dev/internship/.venv/bin/python manage.py check
   - Result: PASS
4. npm run test (from frontend)
   - Result: PASS (3 files, 9 tests)
5. npm run build (from frontend)
   - Result: PASS
6. npm run test:e2e (from frontend)
   - Result: PASS (4 tests)
7. npm run test && npm run test:e2e && npm run lint && npm run build (from frontend)
   - Result: PASS

## 4. Current Next Implementation Queue

The next engineering item to implement after this verified block:

1. Add E2E coverage for missing approval_token client-side guard path (no network decision call and explicit local error toast).
2. Refactor Playwright mocks into shared helpers/fixtures to reduce duplication across HITL E2E scenarios.

This document should be updated after each new implementation slice with commands and outcomes.
