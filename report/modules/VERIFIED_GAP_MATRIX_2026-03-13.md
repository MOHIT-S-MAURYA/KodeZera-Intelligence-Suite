# Verified Gap Matrix (13 March 2026)

This file is the reality-check companion to the module design documents.
It records what is already implemented in code, what was corrected, and what still remains.

## Summary

- Many advanced items from modules 02-09 are now implemented in code (MFA, feature flags, audit hash chain, notification preferences, analytics models, infra split settings, CI, k8s manifests).
- Critical runtime correctness fixes applied in this pass:
  - RAG endpoint now uses DRF throttles (plan-aware) and QuotaService checks.
  - Quota middleware now covers both `/api/rag/query/` and `/api/v1/rag/query/`.
  - Legacy `apps/core/quota.py` now delegates to real-time QuotaService.
  - RoleClosure sync is now maintained on Role save/delete.

## Module Status

### 01 RAG & Chatbot

Implemented:

- Tenant-filtered retrieval, chat sessions, provider abstraction, SSE streaming.
- Query rewriting for referential follow-up prompts.
- Hybrid ranking via semantic score + lexical overlap fusion reranking.
- Citation verification metadata in RAG responses.
  Remaining:
- Deeper retrieval-quality evaluation/tuning.

### 02 Organisation & RBAC

Implemented:

- Role hierarchy, RoleClosure, ABAC-ready permission conditions, org-unit closure.
  Corrected now:
- RoleClosure auto-sync on role changes.
  Remaining:
- Permission matrix UX polish, bulk admin operations.

### 03 Authentication & Identity

Implemented:

- JWT, MFA (totp/email/webauthn), session/device flows, admin session controls.
  Remaining:
- Optional SSO integration and stronger browser token hardening strategy.

### 04 Document Management

Implemented:

- Soft delete, versions, folders, tags, fine-grained access grants.
  Implemented check:
- Classification-level filtering exists in DocumentAccessService.
  Remaining:
- OCR/table extraction and malware scanning pipeline hardening.

### 05 Platform & SaaS

Implemented:

- Subscription plans, tenant subscription, feature flags, billing event/invoice models.
  Corrected now:
- Quota path now enforced on active RAG endpoints.
  Remaining:
- Full payment provider integration and invoice PDF generation.

### 06 Notifications & Alerts

Implemented:

- In-app inbox, preferences, admin send, digest queue model, dispatcher scaffolding.
  Remaining:
- Production browser-push/webhook delivery handlers and websocket push UX.

### 07 Audit Logging & Compliance

Implemented:

- Unified audit events, security alerts, retention policies, compliance endpoints, hash-chain verify.
  Remaining:
- Optional SIEM forwarding and extended change-diff coverage on all write paths.

### 08 Dashboard Analytics & Reporting

Implemented:

- Query analytics, metric aggregates, alert rules, platform analytics endpoints.
  Remaining:
- Expand metric instrumentation coverage and richer report exports.

### 09 Infrastructure & Core Services

Implemented:

- Correlation + timing middleware, RFC7807-style exceptions, plan-aware throttles,
  environment settings split, health endpoints, nginx routes, CI workflow, k8s starter manifests.
  Corrected now:
- Runtime RAG throttle/quota consistency between middleware and view.
  Remaining:
- Production deployment hardening (CD, secret manager integration, autoscaling tuning).

## Next Recommended Execution Order

1. RAG retrieval-quality tuning and benchmark expansion.
2. Notification real-time delivery (websocket/browser push).
3. Payment and billing execution path (stripe/webhook/invoices).
4. Final production hardening (CD pipelines + secret management).
