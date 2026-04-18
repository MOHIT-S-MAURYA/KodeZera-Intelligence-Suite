# Kodezera Intelligence Suite Module Architecture Reference

Comprehensive design reference for all platform modules.
Each module document follows a consistent 13-section structure:
System Overview, Component Deep-Dive, SWOT, Gap Analysis, Advanced System Design,
Architecture, Data Model, API, Security, Scalability, Frontend, Migration, and Roadmap.

## Document Status

The module documents are architecture baselines.
For current implementation status, use:

- [VERIFIED_GAP_MATRIX_2026-03-13.md](VERIFIED_GAP_MATRIX_2026-03-13.md)

This matrix tracks verified implementation progress and post-design corrections.

---

## System Overview

The Kodezera Intelligence Suite is an **enterprise multi-tenant SaaS platform** for AI-powered document intelligence and retrieval-augmented generation (RAG). The platform enables organisations to upload documents, build knowledge bases, and query them using natural language — with full tenant isolation, role-based access control, and platform-level administration.

### Technology Stack

| Layer        | Technology                                     |
| ------------ | ---------------------------------------------- |
| **Backend**  | Django 5.0, Django REST Framework, Python 3.12 |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS       |
| **Database** | SQLite (dev), PostgreSQL (target production)   |
| **Cache**    | Redis (django-redis)                           |
| **Vectors**  | Qdrant (vector database)                       |
| **Async**    | Celery + Redis broker                          |
| **Auth**     | JWT (SimpleJWT) with rotation + blacklisting   |
| **AI**       | OpenAI / Anthropic / Ollama (hot-switchable)   |

---

## Module Index

| #   | Module                                                                   | Document                                                                           | Scope                                                                   |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 01  | [RAG & Chatbot](#01-rag--chatbot)                                        | [01_rag_and_chatbot.md](01_rag_and_chatbot.md)                                     | Vector search, LLM integration, chat sessions, embedding pipeline       |
| 02  | [Organisation & RBAC](#02-organisation--rbac)                            | [02_organisation_and_rbac.md](02_organisation_and_rbac.md)                         | Tenant hierarchy, departments, roles, permissions, access control       |
| 03  | [Authentication & Identity](#03-authentication--identity)                | [03_authentication_and_identity.md](03_authentication_and_identity.md)             | Login, JWT, MFA, SSO, session management, password policy               |
| 04  | [Document Management](#04-document-management)                           | [04_document_management.md](04_document_management.md)                             | Upload, processing, storage, classification, versioning, lifecycle      |
| 05  | [Platform Administration & SaaS](#05-platform-administration--saas)      | [05_platform_and_saas.md](05_platform_and_saas.md)                                 | Multi-tenancy, subscriptions, billing, feature flags, AI config         |
| 06  | [Notifications & Alerts](#06-notifications--alerts)                      | [06_notifications_and_alerts.md](06_notifications_and_alerts.md)                   | In-app, email, push notifications, templates, preferences, real-time    |
| 07  | [Audit, Logging & Compliance](#07-audit-logging--compliance)             | [07_audit_logging_and_compliance.md](07_audit_logging_and_compliance.md)           | Audit trail, change tracking, integrity, security detection, GDPR       |
| 08  | [Dashboard, Analytics & Reporting](#08-dashboard-analytics--reporting)   | [08_dashboard_analytics_and_reporting.md](08_dashboard_analytics_and_reporting.md) | Metrics collection, dashboards, charts, cost analytics, alerting        |
| 09  | [Infrastructure & Core Services](#09-infrastructure--core-services)      | [09_infrastructure_and_core_services.md](09_infrastructure_and_core_services.md)   | Middleware, caching, throttling, Celery, deployment, CI/CD              |
| 10  | [Chatbot System Development Guide](#10-chatbot-system-development-guide) | [10_chatbot_system_development_guide.md](10_chatbot_system_development_guide.md)   | Step-by-step implementation plan for responsive, secure chatbot rollout |

---

## Module Summaries

The summaries below are design-time snapshots for planning context.
Always cross-check with the verified matrix before making delivery commitments.

### 01 — RAG & Chatbot

**Current:** 14 files across backend/frontend implementing document embedding (Qdrant), vector search, LLM response generation, and multi-turn chat sessions.
**Key Gaps:** No hybrid search (BM25 + vector), no query rewriting, no multi-model routing, no citation verification, no conversation memory summarisation.
**Advanced Design:** 7 capabilities (C1–C7) including adaptive retrieval, hybrid search, query decomposition, citation-grounded responses, conversation memory management, multi-model orchestration, and feedback loop learning.

### 02 — Organisation & RBAC

**Current:** Adjacency list hierarchy for departments and roles, basic permission system, tenant-scoped access.
**Key Gaps:** No closure table (slow ancestor queries), no ABAC, no permission inheritance down hierarchy, no delegation or temporary elevation.
**Advanced Design:** Closure table pattern, ABAC engine, hierarchical permission inheritance, role delegation, audit trail for access decisions.

### 03 — Authentication & Identity

**Current:** Email/password JWT auth, profile management, password change.
**Key Gaps:** No MFA/TOTP, no SSO (SAML/OIDC), no session management, no account lockout, no password complexity policies.
**Advanced Design:** MFA with TOTP/WebAuthn, OAuth2/SAML SSO, session management with device tracking, progressive password policies, account lockout with exponential backoff.

### 04 — Document Management

**Current:** File upload with progress, async Celery processing, basic text extraction, access control via DocumentAccess model.
**Key Gaps:** No versioning, no folder hierarchy, no advanced classification, no chunked uploads, no virus scanning, no lifecycle management.
**Advanced Design:** Full version history with diff, virtual folder hierarchy, ML-powered classification, resumable chunked uploads, ClamAV virus scanning, configurable retention policies.

### 05 — Platform Administration & SaaS

**Current:** Tenant CRUD, 3-tier subscription plans, system health checks, AI provider configuration, support tickets.
**Key Gaps:** No payment integration, subscription limits not enforced, usage metrics not auto-collected, no feature flags, no per-tenant config.
**Advanced Design:** Stripe billing integration, real-time quota enforcement via Redis, feature flag system (plan-gated + per-tenant), tenant self-service portal, automated invoice generation.

### 06 — Notifications & Alerts

**Current:** Workday-inspired targeted notifications (user/department/role/tenant), priority levels, action URLs, read receipts.
**Key Gaps:** No multi-channel delivery, no real-time (WebSocket), no templates, no user preferences, no digest batching.
**Advanced Design:** Multi-channel dispatch (in-app + email + push + webhook), WebSocket real-time delivery, template engine, per-category user preferences, configurable digest frequency, materialized inbox for scale.

### 07 — Audit, Logging & Compliance

**Current:** Dual audit trail (tenant AuditLog + platform SystemAuditLog), middleware-captured write operations, background thread DB writes.
**Key Gaps:** No field-level change tracking, no failed operation logging, no hash chain integrity, no structured logging, no SIEM integration.
**Advanced Design:** Unified AuditEvent model with hash chain, field-level before/after diffs, security event detection rules, compliance framework (SOC 2/GDPR/HIPAA), structured JSON logging with request correlation.

### 08 — Dashboard, Analytics & Reporting

**Current:** Org dashboard (stat cards), platform analytics (4 Recharts charts), usage metrics model (manually seeded).
**Key Gaps:** No automatic metric collection, no real-time metrics, no per-user/department analytics, no cost analytics, no RAG quality metrics.
**Advanced Design:** Automatic Redis-based metric collection, multi-granularity aggregation (minute→hour→day→month), RAG quality analytics, cost attribution per query/tenant, threshold-based alerting, PDF/CSV report generation.

### 09 — Infrastructure & Core Services

**Current:** TenantIsolation + AuditLogging middleware, Redis cache, Celery with 2 queues, custom exceptions, Docker support.
**Key Gaps:** SQLite database, no request correlation, no structured logging, no circuit breakers, static throttle rates, no CI/CD pipeline.
**Advanced Design:** PostgreSQL with read replicas, request ID correlation, structured JSON logging, circuit breaker pattern, plan-aware dynamic throttling, Redis-based real-time quotas, Kubernetes deployment, GitHub Actions CI/CD.

### 10 — Chatbot System Development Guide

**Current:** Defines a practical step-by-step delivery sequence for evolving the existing chatbot implementation.
**Key Focus:** Contract-first streaming, frontend modularisation, adaptive responsive layout, RBAC-safe retrieval, observability, and rollout safety gates.
**Outcome:** A phased execution path from architecture baseline to production release with clear Definition of Done per phase.

---

## Architecture Diagram (System-Wide)

```
                              ┌─────────────────────────┐
                              │    React Frontend       │
                              │  (Module: All UI pages) │
                              └────────────┬────────────┘
                                           │ HTTPS + WebSocket
                              ┌────────────▼────────────┐
                              │    Nginx / ALB           │
                              │  (TLS, static files)    │
                              └────────────┬────────────┘
                                           │
┌──────────────────────────────────────────┼──────────────────────────────────────┐
│                          Django Application Server                              │
│                                                                                 │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ Module  │ │ Module   │ │ Module   │ │ Module   │ │ Module   │             │
│  │  01     │ │  02      │ │  03      │ │  04      │ │  05      │             │
│  │ RAG &   │ │ Org &    │ │ Auth &   │ │ Document │ │ Platform │             │
│  │ Chatbot │ │ RBAC     │ │ Identity │ │ Mgmt     │ │ Admin    │             │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘             │
│       │           │            │            │            │                    │
│  ┌────┴────┐ ┌────┴─────┐ ┌───┴──────┐                                      │
│  │ Module  │ │ Module   │ │ Module   │                                      │
│  │  06     │ │  07      │ │  08      │                                      │
│  │ Notif.  │ │ Audit &  │ │ Analytics│                                      │
│  │ & Alert │ │ Compliance│ │& Report  │                                      │
│  └────┬────┘ └────┬─────┘ └────┬─────┘                                      │
│       │           │            │                                             │
│  ┌────┴───────────┴────────────┴─────────────────────────────────────┐       │
│  │                Module 09 — Infrastructure & Core                   │       │
│  │  Middleware │ Cache │ Throttle │ Celery │ Exceptions │ Config     │       │
│  └───────────────────────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────────────────┘
         │              │              │
    ┌────▼────┐   ┌─────▼─────┐  ┌────▼─────┐
    │PostgreSQL│   │   Redis    │  │  Qdrant  │
    │(Primary  │   │ (Cache,   │  │ (Vector  │
    │+Replica) │   │  Broker)  │  │  Search) │
    └─────────┘   └───────────┘  └──────────┘
```

---

## Cross-Cutting Concerns

These themes appear across multiple modules and must be designed holistically:

| Concern                | Modules Involved     | Owner Module   |
| ---------------------- | -------------------- | -------------- |
| Tenant isolation       | All                  | 09 (Infra)     |
| Authentication         | All                  | 03 (Auth)      |
| Authorization / RBAC   | 01, 02, 04, 05, 07   | 02 (RBAC)      |
| Audit trail            | All write operations | 07 (Audit)     |
| Notifications          | 02, 04, 05, 07, 08   | 06 (Notif.)    |
| Metric collection      | 01, 04, 05           | 08 (Analytics) |
| Rate limiting / quotas | 01, 04               | 09 (Infra)     |
| Background tasks       | 01, 04, 06, 07, 08   | 09 (Infra)     |
| Error handling         | All                  | 09 (Infra)     |
| Feature flags          | All                  | 05 (Platform)  |

---

## Supporting Artefacts

| Artefact                                                                                                   | Purpose                                           |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [rag_architecture.drawio](rag_architecture.drawio)                                                         | Draw.io diagram of RAG pipeline architecture      |
| [../database_schema.md](../database_schema.md)                                                             | Current database schema reference                 |
| [../backend_architecture_principles.md](../backend_architecture_principles.md)                             | Backend architecture and security principles      |
| [../ui-spec-v2.md](../ui-spec-v2.md)                                                                       | UI specification (V2)                             |
| [../owner.md](../owner.md)                                                                                 | Platform owner design notes                       |
| [10_chatbot_implementation_ticket_backlog.md](10_chatbot_implementation_ticket_backlog.md)                 | Sprint-wise ticket backlog for chatbot rollout    |
| [10_chatbot_feature_implementation_and_test_guide.md](10_chatbot_feature_implementation_and_test_guide.md) | Feature implementation status and test procedures |

---

## Implementation Priority Matrix

Modules ranked by implementation priority (accounting for dependencies):

| Priority | Module            | Rationale                                       |
| -------- | ----------------- | ----------------------------------------------- |
| P0       | 09 Infrastructure | Foundation — all modules depend on this         |
| P0       | 03 Authentication | Security baseline — required before any feature |
| P0       | 02 Org & RBAC     | Access control — gates all data access          |
| P1       | 01 RAG & Chatbot  | Core product value — primary user feature       |
| P1       | 04 Documents      | Core product value — feeds RAG pipeline         |
| P1       | 07 Audit          | Compliance — required for enterprise customers  |
| P2       | 05 Platform       | SaaS operations — billing + tenant management   |
| P2       | 06 Notifications  | User experience — engagement + awareness        |
| P2       | 08 Analytics      | Business intelligence — data-driven decisions   |

---

> Generated: 10 March 2026
> Status: Design analyses complete; implementation progress is tracked in [VERIFIED_GAP_MATRIX_2026-03-13.md](VERIFIED_GAP_MATRIX_2026-03-13.md).
