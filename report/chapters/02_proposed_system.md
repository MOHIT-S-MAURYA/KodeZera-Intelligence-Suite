# Chapter 2: Proposed System

---

## 2.1 Proposed System / Solution

### 2.1.1 System Overview

The **Kodezera Intelligence Suite (KIS)** is a multi-tenant, security-first, enterprise-grade Retrieval-Augmented Generation (RAG) platform. It enables organisations to upload domain-specific documents, process them into semantically searchable vector embeddings, and query them through a conversational AI chatbot that produces grounded, citation-backed answers.

The system is designed as a **SaaS platform** where multiple organisations (tenants) operate in complete data isolation. A Platform Owner (SaaS operator) manages the global infrastructure, AI provider configurations, tenant lifecycle, and subscription billing, while Tenant Administrators manage their own organisation's users, roles, departments, documents, and policies.

### 2.1.2 Core Architecture

The platform follows a **layered modular monolith** architecture:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                               │
│  React 19 + TypeScript + Vite + Tailwind CSS + Zustand + React Router   │
├─────────────────────────────────────────────────────────────────────────┤
│                          API LAYER                                      │
│  Django REST Framework — ViewSets, Serializers, Permissions, Throttling  │
├─────────────────────────────────────────────────────────────────────────┤
│                    APPLICATION SERVICES LAYER                           │
│  AuthenticationService    │  RoleResolutionService  │  RAGPipeline      │
│  DocumentAccessService    │  PermissionService      │  EmbeddingService │
│  SessionManagerService    │  ConditionEngine        │  LLMRunner        │
│  NotificationService      │  PasswordService        │  CitationVerifier │
├─────────────────────────────────────────────────────────────────────────┤
│                       DOMAIN LAYER (Models)                             │
│  Core: Tenant, User, Department, OrgUnit, AuditLog, AIProviderConfig    │
│  RBAC: Role, Permission, UserRole, RolePermission, RoleClosure          │
│  Documents: Document, DocumentVersion, DocumentAccess, DocumentFolder   │
│  RAG: VectorChunk, ChatSession, ChatMessage, ChatFolder                 │
│  Analytics: MetricHour, MetricMonth, QueryAnalytics, AlertRule          │
├─────────────────────────────────────────────────────────────────────────┤
│                     INFRASTRUCTURE LAYER                                │
│  PostgreSQL  │  Qdrant (Vector DB)  │  Redis (Cache)  │  Celery (Queue) │
│  Nginx       │  Docker / K8s        │  Object Storage  │  Sentry         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.1.3 RAG Pipeline Architecture

The RAG pipeline is the heart of the system. It operates in two phases:

**Phase A — Document Ingestion (Offline, Async):**
```
Document Upload → Celery Task → Text Extraction (PDF/DOCX/TXT)
    → Text Cleaning → Token-based Chunking (500 tokens, 50 overlap)
    → Embedding Generation (SentenceTransformers / OpenAI / HuggingFace)
    → Vector Storage (Qdrant with tenant_id + document_id metadata)
    → Django Model Update (VectorChunk records, Document.status = 'completed')
```

**Phase B — Query Execution (Online, Real-time):**
```
User Query → JWT Authentication → Tenant Isolation Check
    → RBAC Permission Check (has 'rag:query' permission?)
    → Document Access Resolution (which documents can this user see?)
    → Follow-up Query Rewriting (if referential: prepend prior context)
    → Embedding Generation (same model as ingestion)
    → Vector Search (Qdrant ANN with tenant + document filters)
    → Over-fetch (3× top_k candidates)
    → Hybrid Re-ranking (0.8 × semantic_score + 0.2 × lexical_overlap)
    → Context Window Expansion (fetch surrounding chunks ±1)
    → LLM Generation (system prompt + context + chat history + query)
    → Citation Verification (grounding score analysis)
    → Audit Log Entry (async, fire-and-forget)
    → Analytics Metrics Recording (async)
    → SSE Streaming Response to Client
```

### 2.1.4 Security-First Design Principles

1. **Zero-Trust Retrieval**: Every vector search query includes mandatory `tenant_id` and `document_id` filters. Even if a malicious vector somehow exists in the database, it can never be returned to an unauthorised user.

2. **Deny-First Permission Evaluation**: The RBAC engine evaluates deny rules before allow rules. An explicit deny on any permission always wins, regardless of other role assignments.

3. **Classification Enforcement**: Users have a `clearance_level` (0–5). Documents have a `classification_level` (0–5). The system enforces `user.clearance_level >= document.classification_level` at the access resolution layer, not at the view layer.

4. **Time-Bound Access**: Role assignments and document access grants can have `expires_at` timestamps. Expired grants are automatically excluded from permission checks without requiring cleanup jobs.

5. **Cache Invalidation via Signals**: Django model signals on RBAC tables automatically bust the Redis permission cache, ensuring that permission changes take effect immediately.

---

## 2.2 Objectives of Proposed System

### 2.2.1 Primary Objectives

| # | Objective | Success Metric |
|---|-----------|---------------|
| O1 | Enable natural-language querying of enterprise documents | Users receive contextually relevant answers with source citations in < 5 seconds |
| O2 | Enforce strict multi-tenant data isolation | Zero cross-tenant data leakage under adversarial testing |
| O3 | Implement dynamic, hierarchical RBAC | Permission resolution in O(1) time using closure tables, with < 50ms cache-hit latency |
| O4 | Support multiple AI providers without code changes | Platform Owner can switch between OpenAI, Anthropic, HuggingFace, Ollama, and local models via the UI |
| O5 | Provide comprehensive audit logging | Every sensitive operation (query, upload, delete, permission change) is logged with user, tenant, IP, and timestamp |
| O6 | Deliver a premium, responsive UI/UX | Mobile-responsive design; dark mode; gesture controls; real-time streaming chat |
| O7 | Enable SaaS operator to manage tenants and billing | Platform Owner dashboard with subscription management, usage metrics, and cost tracking |

### 2.2.2 Secondary Objectives

| # | Objective | Success Metric |
|---|-----------|---------------|
| S1 | Minimise operational overhead | Single Docker image deployment; health-check endpoints for K8s probes |
| S2 | Support air-gapped deployments | Fully functional with local SentenceTransformers + Ollama + local Qdrant (no internet required) |
| S3 | Optimise retrieval quality | Hybrid re-ranking (semantic + lexical) improves top-5 precision by ≥ 15% over pure vector search |
| S4 | Control AI costs | Per-tenant, plan-based query quotas and per-query token/cost tracking |
| S5 | Enable self-service administration | Tenant admins can manage users, roles, departments, and documents without Platform Owner intervention |

---

## 2.3 Users of System

### 2.3.1 User Roles

The system defines four distinct user personas, each with different access levels and responsibilities:

#### 1. Platform Owner (Superuser)

**Profile**: The SaaS operator who owns and manages the entire platform.

**Responsibilities**:
- Create, suspend, and manage tenant organisations
- Configure AI providers (LLM + embedding settings) globally
- Manage subscription plans and billing
- Monitor system-wide usage metrics and health
- Handle support tickets from tenant users
- Perform emergency access operations

**Access Level**: Full access to all platform features and all tenant data.

#### 2. Tenant Administrator

**Profile**: The IT administrator or department head within a tenant organisation.

**Responsibilities**:
- Manage users within their tenant (create, deactivate, assign departments)
- Create and manage custom roles with granular permissions
- Configure organisational hierarchy (departments, org units)
- Upload documents and manage document access grants
- View tenant-specific analytics and audit logs
- Manage team notifications and policies

**Access Level**: Full access to all features within their tenant; no cross-tenant access.

#### 3. Regular User (Employee)

**Profile**: A knowledge worker who uses the platform to find answers from company documents.

**Responsibilities**:
- Query the AI chatbot with natural-language questions
- Browse and search accessible documents
- Manage personal chat sessions (rename, delete, organise into folders)
- View personal profile and notification preferences
- Upload documents (if permitted by their role)

**Access Level**: Determined by their assigned roles and permissions. Can only access documents granted to them via role, org-unit, or user-level grants.

#### 4. Guest / External Collaborator (Future Scope)

**Profile**: An external partner or contractor with limited, time-bound access.

**Access Level**: Read-only access to specific documents, with automatic expiration.

### 2.3.2 User Permission Matrix

| Feature | Platform Owner | Tenant Admin | Regular User |
|---------|:-:|:-:|:-:|
| Create Tenant | ✓ | ✗ | ✗ |
| Manage Subscriptions | ✓ | ✗ | ✗ |
| Configure AI Providers | ✓ | ✗ | ✗ |
| Create Users | ✓ | ✓ | ✗ |
| Create Roles | ✗ | ✓ | ✗ |
| Assign Permissions | ✗ | ✓ | ✗ |
| Upload Documents | ✓ | ✓ | Role-dependent |
| Query AI Chat | ✗* | ✓ | ✓ |
| View Audit Logs | ✓ (system-level) | ✓ (tenant-level) | ✗ |
| View Analytics | ✓ (platform-wide) | ✓ (tenant-only) | ✓ (personal only) |

*Platform Owner uses the admin panel, not the chat interface.

---

## 2.4 Workflow Diagram

### 2.4.1 User Authentication Workflow

```
┌──────────┐    ┌───────────────┐    ┌──────────────┐    ┌──────────────────┐
│  User     │───▶│  Login Form   │───▶│  Backend     │───▶│  Check Lockout   │
│  Browser  │    │  (email+pass) │    │  /api/auth/  │    │  (Failed attempts│
└──────────┘    └───────────────┘    │  login/      │    │   < threshold?)  │
                                      └──────┬───────┘    └────────┬─────────┘
                                             │                     │
                                      ┌──────▼───────┐     ┌──────▼─────────┐
                                      │  Validate    │     │  Return Error  │
                                      │  Credentials │     │  "Account      │
                                      │  (bcrypt)    │     │   Locked"      │
                                      └──────┬───────┘     └────────────────┘
                                             │
                                    ┌────────▼────────┐
                              ┌─────┤  MFA Enabled?   ├─────┐
                              │ No  └─────────────────┘ Yes │
                              │                             │
                       ┌──────▼──────┐              ┌───────▼───────┐
                       │  Issue JWT  │              │  Return MFA   │
                       │  (access +  │              │  Challenge    │
                       │   refresh)  │              │  (session     │
                       │  Create     │              │   token)      │
                       │  Session    │              └───────┬───────┘
                       └──────┬──────┘                      │
                              │                      ┌──────▼──────┐
                       ┌──────▼──────┐               │  Verify OTP │
                       │  Return     │               │  (TOTP or   │
                       │  to Client  │               │   Email)    │
                       │  + Audit    │               └──────┬──────┘
                       │  Log Entry  │                      │
                       └─────────────┘               ┌──────▼──────┐
                                                     │  Issue JWT  │
                                                     │  + Session  │
                                                     └─────────────┘
```

### 2.4.2 Document Upload and Processing Workflow

```
┌──────────┐    ┌───────────────┐    ┌──────────────┐    ┌──────────────────┐
│  User    │───▶│  Upload Form  │───▶│  API View    │───▶│  Permission      │
│          │    │  (file +      │    │  POST /api/  │    │  Check           │
│          │    │   metadata)   │    │  documents/  │    │  (has 'document: │
│          │    │               │    │  upload/     │    │   upload'?)      │
└──────────┘    └───────────────┘    └──────┬───────┘    └────────┬─────────┘
                                            │                     │
                                     ┌──────▼───────┐     ┌──────▼─────────┐
                                     │  Save File   │     │  403 Forbidden │
                                     │  to Storage  │     └────────────────┘
                                     │  (media/)    │
                                     └──────┬───────┘
                                            │
                                     ┌──────▼───────┐
                                     │  Create      │
                                     │  Document    │
                                     │  Record      │
                                     │  status=     │
                                     │  'pending'   │
                                     └──────┬───────┘
                                            │
                                     ┌──────▼───────┐
                                     │  Dispatch    │
                                     │  Celery Task │
                                     │  (async)     │
                                     └──────┬───────┘
                                            │
                              ┌─────────────▼─────────────┐
                              │  CELERY WORKER             │
                              │                            │
                              │  1. Extract Text           │
                              │     (PDF → PyPDF2,         │
                              │      DOCX → python-docx,   │
                              │      TXT → file read)      │
                              │                            │
                              │  2. Clean Text             │
                              │     (whitespace, specials) │
                              │                            │
                              │  3. Chunk Text             │
                              │     (500 tokens, 50 overlap│
                              │      using tiktoken)       │
                              │                            │
                              │  4. Generate Embeddings    │
                              │     (SentenceTransformers  │
                              │      or OpenAI or HF)      │
                              │                            │
                              │  5. Store in Qdrant        │
                              │     (with tenant_id,       │
                              │      document_id,          │
                              │      dept_id, class_level) │
                              │                            │
                              │  6. Update Document        │
                              │     status='completed'     │
                              │     chunk_count=N          │
                              └───────────────────────────┘
```

### 2.4.3 RAG Query Execution Workflow

```
┌──────────┐    ┌───────────────────────────────────────────────────────┐
│  User    │───▶│  Chat Interface → POST /api/rag/query-stream/        │
│  Query   │    │  { "query": "...", "session_id": "..." }             │
└──────────┘    └──────────────────────┬────────────────────────────────┘
                                       │
                  ┌────────────────────▼────────────────────┐
                  │  1. JWT Authentication + Tenant Check    │
                  │  2. Get/Create ChatSession               │
                  │  3. Save User Message to DB              │
                  │  4. Load Chat History (last 20 messages)  │
                  └────────────────────┬────────────────────┘
                                       │
                  ┌────────────────────▼────────────────────┐
                  │  5. Resolve Accessible Document IDs      │
                  │     • Public docs (visibility='public')  │
                  │     • Own uploads                        │
                  │     • Role-based grants (via FK)         │
                  │     • Org-unit grants (with descendants) │
                  │     • User-direct grants                 │
                  │     • Classification enforcement          │
                  │     • Time-bound filtering                │
                  └────────────────────┬────────────────────┘
                                       │
                  ┌────────────────────▼────────────────────┐
                  │  6. Follow-up Query Rewriting            │
                  │     (if referential: "what about this?") │
                  │     → prepend prior user message          │
                  └────────────────────┬────────────────────┘
                                       │
                  ┌────────────────────▼────────────────────┐
                  │  7. Generate Query Embedding             │
                  │     (same model as ingestion)            │
                  └────────────────────┬────────────────────┘
                                       │
                  ┌────────────────────▼────────────────────┐
                  │  8. Vector Search (Qdrant ANN)           │
                  │     • Filter: tenant_id + document_ids   │
                  │     • Over-fetch: 3× top_k candidates    │
                  └────────────────────┬────────────────────┘
                                       │
                  ┌────────────────────▼────────────────────┐
                  │  9. Hybrid Re-ranking                    │
                  │     combined = 0.8×semantic + 0.2×lexical│
                  │     → Take top_k results                 │
                  └────────────────────┬────────────────────┘
                                       │
                  ┌────────────────────▼────────────────────┐
                  │  10. Context Window Expansion             │
                  │      Fetch chunks at index ±1             │
                  │      Reconstruct contiguous passage       │
                  └────────────────────┬────────────────────┘
                                       │
                  ┌────────────────────▼────────────────────┐
                  │  11. LLM Generation (SSE Streaming)      │
                  │      System prompt + Context + History    │
                  │      + User query → stream tokens         │
                  └────────────────────┬────────────────────┘
                                       │
                  ┌────────────────────▼────────────────────┐
                  │  12. Post-Processing                      │
                  │      • Save assistant message to DB       │
                  │      • Citation verification (grounding)  │
                  │      • Audit log (async, fire-and-forget) │
                  │      • Analytics metrics (async)          │
                  └────────────────────────────────────────┘
```

---
