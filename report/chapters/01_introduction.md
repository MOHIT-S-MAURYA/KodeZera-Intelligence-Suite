# Chapter 1: Introduction

---

## 1.1 Company Profile / Institute Profile / Client Profile

### 1.1.1 Organisation Overview

**Kodezera** is a technology-driven software consultancy headquartered in India, specialising in the design, development, and deployment of enterprise-grade SaaS (Software as a Service) platforms. Founded with the mission of democratising artificial intelligence for mid-to-large enterprises, Kodezera focuses on building secure, scalable, and privacy-first knowledge management tools that leverage cutting-edge advances in Natural Language Processing (NLP), information retrieval, and generative AI.

### 1.1.2 Industry Context

The project sits at the intersection of three rapidly evolving domains:

1. **Enterprise Knowledge Management** — Organisations accumulate terabytes of unstructured documents (policies, SOPs, contracts, research papers) that remain inaccessible to most employees because traditional keyword search fails to capture semantic meaning.
2. **Retrieval-Augmented Generation (RAG)** — A paradigm introduced by Lewis et al. (2020) that combines the strengths of neural retrieval models with large language models (LLMs) to produce grounded, citation-backed answers from a private corpus rather than relying solely on the LLM's parametric memory.
3. **Enterprise Security & Compliance** — Regulated industries (finance, healthcare, government) require strict access control, audit trails, and data isolation guarantees that typical consumer-grade AI chatbots do not provide.

### 1.1.3 Client Requirements

The client is a multi-tenant SaaS provider serving diverse organisations (tenants). Each tenant operates as a fully isolated unit with its own users, roles, departments, documents, and AI query history. The platform must:

- Support **zero-trust document access** — a user can only query documents they are explicitly authorised to view.
- Provide **dynamic role-based access control (RBAC)** — no hardcoded roles; tenant administrators create custom roles with fine-grained permissions.
- Offer a **conversational AI chatbot** powered by RAG, with real-time streaming responses and source citations.
- Include a **Platform Owner dashboard** for SaaS operators to manage tenants, subscriptions, billing, and AI provider configurations.
- Deliver **comprehensive audit logging** for compliance with SOC 2, GDPR, and ISO 27001 frameworks.

### 1.1.4 Project Team

| Role | Responsibility |
|------|---------------|
| Mohit Shambhunath Maurya (Intern) | Full-stack development, system architecture, RAG pipeline implementation, RBAC engine design, frontend UI/UX, deployment infrastructure |
| Project Guide | Technical mentorship, architecture review, Sprint planning |
| Kodezera CTO | Product vision, feature prioritisation, security audit |

---

## 1.2 Abstract

The **Kodezera Intelligence Suite** is an enterprise multi-tenant Retrieval-Augmented Generation (RAG) platform that enables organisations to transform their unstructured document repositories into queryable knowledge bases powered by large language models. The system implements a novel security-first RAG architecture where every stage of the retrieval and generation pipeline enforces tenant isolation, role-based access control, and document-level classification filters, ensuring that AI-generated responses never leak information across organisational or departmental boundaries.

The platform employs a hybrid retrieval strategy combining dense vector similarity search (via Qdrant) with lexical re-ranking to achieve high-precision document chunk retrieval. Retrieved chunks are expanded with contextual windows (surrounding chunks) before being presented to the LLM, significantly improving answer coherence. The system supports multiple LLM backends — OpenAI, Anthropic Claude, HuggingFace Inference API, Ollama (local), and local Transformers pipelines — enabling organisations to choose between cloud-based and fully air-gapped deployments.

The RBAC subsystem implements a closure-table-backed role hierarchy with O(1) ancestor resolution, deny-first permission evaluation, Attribute-Based Access Control (ABAC) condition overlays, time-bound role assignments, and organisational unit scoping. This hybrid RBAC+ABAC model enables fine-grained policies such as "Department managers may read documents with classification level ≤ 3 within their own org unit subtree."

The frontend is built with React 19, TypeScript, Zustand state management, and a custom-designed component library featuring dark mode, glassmorphism aesthetics, gesture-based interactions, and real-time SSE-powered chat streaming. The backend follows a modular monolith architecture using Django 5.0 and Django REST Framework, with Celery for asynchronous document processing, Redis for caching and rate limiting, and PostgreSQL for persistent storage.

The platform has been validated through adversarial RBAC penetration testing, end-to-end RAG pipeline testing, and comprehensive UI/UX usability testing across desktop and mobile viewports.

**Keywords:** Retrieval-Augmented Generation, Multi-Tenant Architecture, Role-Based Access Control, Vector Database, Enterprise AI, Knowledge Management, Natural Language Processing, Document Security.

---

## 1.3 Existing System and Need for System

### 1.3.1 Analysis of Existing Systems

The current landscape of enterprise knowledge management tools can be categorised into three generations:

#### Generation 1: Traditional Document Management Systems (DMS)

Systems such as SharePoint, Alfresco, and Documentum provide file storage, versioning, and basic metadata search. Their limitations include:

- **Keyword-only search**: Users must know exact terms; semantic meaning is lost.
- **No AI assistance**: Users must read entire documents to find answers.
- **Rigid access control**: Typically folder-level permissions; no per-document classification.
- **No conversational interface**: Each search is stateless; no follow-up capability.

#### Generation 2: Enterprise Search Engines

Tools such as Elasticsearch-based portals, Coveo, and Algolia improve upon DMS with full-text indexing, faceted search, and basic relevance scoring. However:

- **No generative answers**: Users still receive ranked document lists, not direct answers.
- **No contextual understanding**: Search engines match surface-level terms without understanding intent.
- **Limited personalisation**: No awareness of user's role, department, or clearance level.

#### Generation 3: Consumer AI Chatbots

ChatGPT, Google Gemini, and Copilot represent the state-of-the-art in conversational AI. However, they are fundamentally unsuitable for enterprise knowledge management because:

- **No access control**: All users see the same data; no tenant isolation.
- **No audit trail**: No record of who queried what; non-compliant with regulations.
- **Data leakage risk**: Documents uploaded to third-party services leave the organisation's security perimeter.
- **Hallucination**: Responses may fabricate information not present in any real document.
- **No citation verification**: Users cannot verify which source document supports a claim.

### 1.3.2 Gap Analysis

| Feature | Traditional DMS | Enterprise Search | Consumer AI | **KIS (Proposed)** |
|---------|:-:|:-:|:-:|:-:|
| Semantic search | ✗ | Partial | ✓ | ✓ |
| Generative answers | ✗ | ✗ | ✓ | ✓ |
| Source citations | N/A | ✗ | ✗ | ✓ |
| Multi-tenant isolation | ✗ | ✗ | ✗ | ✓ |
| Dynamic RBAC | Basic | ✗ | ✗ | ✓ |
| Document classification | ✗ | ✗ | ✗ | ✓ |
| Audit logging | Partial | ✗ | ✗ | ✓ |
| Conversational context | ✗ | ✗ | ✓ | ✓ |
| On-premise deployment | ✓ | Partial | ✗ | ✓ |
| Role hierarchy (closure table) | ✗ | ✗ | ✗ | ✓ |
| Time-bound access | ✗ | ✗ | ✗ | ✓ |

### 1.3.3 Need for the System

The Kodezera Intelligence Suite addresses the critical gap between **enterprise security requirements** and **modern AI capabilities**. Specifically:

1. **Information Silo Problem**: Organisations waste an estimated 20% of employee time searching for information across siloed repositories (McKinsey, 2022). A RAG-powered assistant reduces this by providing instant, contextualised answers.
2. **Compliance Mandate**: Industries such as finance (SOX, PCI-DSS), healthcare (HIPAA), and government (FedRAMP) require provable access control and audit trails, which no existing consumer AI tool provides.
3. **Model-Agnostic Flexibility**: Enterprises frequently change AI providers. The system's pluggable LLM architecture (supporting OpenAI, Anthropic, HuggingFace, Ollama, and local Transformers) prevents vendor lock-in.
4. **Cost Control**: Plan-based quotas, per-query token tracking, and configurable cost rates enable the SaaS operator to maintain profitability while offering transparent billing to tenants.

---

## 1.4 Scope of System

### 1.4.1 In Scope

The Kodezera Intelligence Suite encompasses the following functional modules:

1. **Multi-Tenant Core Engine**
   - Tenant provisioning, onboarding workflow (created → configured → active)
   - User management with organisational hierarchy (departments, org units)
   - Subscription and billing management (Basic, Pro, Enterprise plans)

2. **Dynamic RBAC Engine**
   - Role hierarchy with closure-table-backed O(1) ancestor resolution
   - Permission system with resource-type × action matrix
   - ABAC condition overlays (department scoping, classification-level enforcement)
   - Deny-first evaluation with explicit deny rules
   - Time-bound role assignments with automatic expiration
   - System roles (auto-created per tenant, non-deletable)

3. **Document Management System**
   - Multi-format document upload (PDF, DOCX, TXT, CSV, XLSX, PPTX, Markdown)
   - Asynchronous document processing pipeline (extract → clean → chunk → embed → store)
   - Document versioning with immutable version snapshots
   - Classification levels (0–5) with clearance-level enforcement
   - Visibility types (public, restricted, private)
   - Folder organisation and tagging system
   - Soft delete with configurable retention policies

4. **RAG Pipeline**
   - Multi-provider embedding generation (SentenceTransformers, OpenAI, HuggingFace)
   - Vector storage and retrieval via Qdrant with tenant-scoped filtering
   - Hybrid re-ranking (semantic score × lexical overlap fusion)
   - Context window expansion (surrounding-chunk retrieval)
   - Conversational context management with follow-up query rewriting
   - Citation verification with grounding score analysis
   - Multi-provider LLM generation (OpenAI, Anthropic, HuggingFace, Ollama, Local Transformers)
   - Real-time Server-Sent Events (SSE) streaming

5. **Chat Interface**
   - Session management with folder organisation
   - Drag-and-drop session reordering
   - Inline rename, bulk delete, bulk move operations
   - Markdown rendering with syntax highlighting
   - Source citation cards with confidence indicators
   - Export to Markdown functionality

6. **Analytics & Monitoring**
   - Multi-granularity metric storage (hourly, daily, monthly)
   - Per-query analytics (latency, tokens, relevance, cost)
   - Configurable alert rules with cooldown periods
   - Real-time dashboard with chart visualisations

7. **Notification System**
   - Template-based notification dispatching
   - Multi-channel delivery (in-app, email, browser push, webhook)
   - Per-user delivery preferences with digest modes
   - Materialised inbox for fast queries

8. **Platform Owner Module**
   - Global tenant and subscription management
   - AI provider configuration (LLM + embeddings) via UI
   - System-level audit logging
   - Support ticket management
   - Usage metrics and cost tracking

9. **Security & Authentication**
   - JWT-based authentication with refresh token rotation
   - Multi-factor authentication (TOTP + email OTP)
   - Session management with device tracking
   - Password policy enforcement (complexity, history, forced reset)
   - Account lockout after failed attempts
   - Rate limiting (tenant-level and user-level)

10. **Infrastructure & DevOps**
    - Multi-stage Docker builds
    - Docker Compose configurations (dev, prod)
    - Kubernetes manifests (deployment, service, ingress, HPA)
    - CI/CD pipeline (GitHub Actions)
    - Health check endpoints (liveness, readiness)
    - Environment-based settings management

### 1.4.2 Out of Scope

- Real-time collaborative document editing (Google Docs-style)
- OCR for scanned/image-based PDFs
- Video and audio document processing
- Native mobile applications (iOS/Android)
- Payment gateway integration (Stripe, PayPal)
- SSO integration (SAML, OIDC) — planned for Phase 2

---

## 1.5 Operating Environment — Hardware and Software

### 1.5.1 Development Environment

| Component | Specification |
|-----------|--------------|
| **Operating System** | macOS Sequoia 15.x (Apple Silicon M-series) |
| **Python** | 3.11.x |
| **Node.js** | 20.x (LTS) |
| **Database** | SQLite 3.x (development), PostgreSQL 16.x (staging/production) |
| **Vector Database** | Qdrant 1.7.x (local persistent mode or Docker) |
| **Cache** | Redis 7.x |
| **Task Queue** | Celery 5.3.x |
| **IDE** | VS Code with Python, ESLint, TypeScript extensions |
| **Version Control** | Git 2.x, GitHub |

### 1.5.2 Production Environment (Recommended)

| Component | Specification |
|-----------|--------------|
| **Compute** | 4 vCPU, 16 GB RAM (minimum) |
| **Operating System** | Ubuntu 22.04 LTS or Alpine Linux |
| **Container Runtime** | Docker 24.x, Kubernetes 1.28+ |
| **Application Server** | Gunicorn (4 workers, pre-fork) behind Nginx reverse proxy |
| **Database** | PostgreSQL 16.x (managed — AWS RDS, GCP Cloud SQL, or Azure Database) |
| **Vector Database** | Qdrant Cloud (managed) or self-hosted Qdrant 1.7+ cluster |
| **Cache/Queue** | Redis 7.x (managed — AWS ElastiCache or GCP Memorystore) |
| **Object Storage** | S3-compatible storage for document files |
| **TLS** | Let's Encrypt or AWS Certificate Manager |
| **Monitoring** | Sentry (error tracking), Prometheus + Grafana (metrics) |
| **DNS** | Cloudflare or Route 53 |

### 1.5.3 Client-Side Requirements

| Component | Specification |
|-----------|--------------|
| **Browser** | Chrome 120+, Firefox 120+, Safari 17+, Edge 120+ |
| **Screen Resolution** | 1024×768 minimum; 1440×900 recommended |
| **Network** | HTTPS (TLS 1.2+); WebSocket/SSE support for streaming |
| **JavaScript** | ES2022+ (transpiled by Vite) |

---

## 1.6 Brief Description of Technology Used

### 1.6.1 Backend Technologies

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Django** | 5.0.1 | Web framework — ORM, migrations, admin, middleware pipeline |
| **Django REST Framework** | 3.14.0 | RESTful API layer — serialisation, authentication, throttling |
| **SimpleJWT** | 5.3.1 | JWT-based stateless authentication with refresh token rotation |
| **Celery** | 5.3.6 | Distributed task queue for async document processing |
| **Redis** | 5.0.1 | In-memory cache (RBAC permission cache, document access cache) and Celery broker |
| **PostgreSQL** | 16.x | Primary relational database (multi-tenant data, RBAC, audit logs) |
| **Qdrant** | 1.7.3 | Vector database for ANN (Approximate Nearest Neighbour) search over document embeddings |
| **SentenceTransformers** | 2.3.1 | Local embedding generation (all-MiniLM-L6-v2, 384 dimensions) |
| **OpenAI SDK** | 1.10.0 | Cloud-based embedding and LLM inference (GPT-4, text-embedding-3-small) |
| **PyPDF2** | 3.0.1 | PDF text extraction |
| **python-docx** | 1.1.0 | DOCX text extraction |
| **tiktoken** | 0.5.2 | Token counting for chunk size management (cl100k_base encoding) |
| **pyotp** | 2.9.0 | TOTP (Time-based One-Time Password) generation and verification |
| **Gunicorn** | 21.2.0 | Production WSGI server (pre-fork worker model) |
| **WhiteNoise** | 6.6.0 | Static file serving in production |
| **Sentry SDK** | 2.23.1 | Error tracking and performance monitoring |

### 1.6.2 Frontend Technologies

| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 19.2.0 | Component-based UI framework |
| **TypeScript** | 5.9.3 | Static type checking for JavaScript |
| **Vite** | 7.3.1 | Build tool with HMR (Hot Module Replacement) |
| **React Router** | 7.13.0 | Client-side routing and navigation |
| **Zustand** | 5.0.11 | Lightweight state management (auth store, UI store) |
| **Axios** | 1.13.5 | HTTP client with JWT interceptor |
| **Recharts** | 2.15.0 | Charting library for analytics dashboards |
| **Lucide React** | 0.564.0 | Icon library |
| **React Hook Form** | 7.71.1 | Form management with validation |
| **Zod** | 4.3.6 | Schema validation for form inputs |
| **Tailwind CSS** | 3.4.1 | Utility-first CSS framework |

### 1.6.3 Infrastructure Technologies

| Technology | Purpose |
|-----------|---------|
| **Docker** | Containerisation (multi-stage builds) |
| **Docker Compose** | Multi-container orchestration (dev and prod profiles) |
| **Kubernetes** | Production orchestration (deployments, services, HPA, ingress) |
| **Nginx** | Reverse proxy, TLS termination, static file serving |
| **GitHub Actions** | CI/CD pipeline (lint, test, build, deploy) |

### 1.6.4 Key Architectural Patterns

1. **Modular Monolith**: The application is structured as a single deployable unit with strictly bounded modules (`apps.core`, `apps.rbac`, `apps.documents`, `apps.rag`, `apps.analytics`, `apps.api`). This provides the organisational clarity of microservices without the operational complexity of distributed systems.

2. **Closure Table Pattern**: Used for both the role hierarchy (`RoleClosure`) and the organisational unit hierarchy (`OrgUnitClosure`). This enables O(1) ancestor/descendant queries, which are critical for permission resolution in high-traffic scenarios.

3. **Materialised Inbox Pattern**: Notifications are fan-out from a source `Notification` record to per-user `UserNotification` records, enabling fast inbox queries without expensive runtime JOIN operations.

4. **Singleton Configuration Pattern**: The `AIProviderConfig` model uses a singleton (enforced via `get_or_create(id=1)`) to store platform-wide AI settings. This allows runtime configuration changes without server restarts.

5. **Event-Driven Cache Invalidation**: Django signals on `UserRole`, `Role`, and `RolePermission` models automatically invalidate the Redis permission cache whenever the RBAC graph changes, ensuring zero-stale-data permission checks.

---
