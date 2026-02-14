Name of project - Kodezera intelligence suite

# 🔥 ENTERPRISE MULTI-TENANT RAG PLATFORM

# FINAL BACKEND IMPLEMENTATION SPECIFICATION (STRICT)

---

# SECTION 1 — CORE PRINCIPLES (MUST FOLLOW)

These principles override all other decisions.

---

## 1.1 Absolute Multi-Tenancy Isolation

Every model except global system tables MUST contain:

```
tenant_id (UUID, indexed)
```

Every database query MUST filter by:

```
tenant_id = request.user.tenant_id
```

No exceptions.

---

## 1.2 Zero Hardcoded Roles

Forbidden:

```
if role == "admin"
```

Allowed:

* Role table
* Permission table
* RolePermission table
* Dynamic evaluation only

---

## 1.3 Authorization Before Retrieval

RAG flow MUST:

1. Resolve user roles
2. Resolve accessible document IDs
3. Filter vector DB by document_id

Vector search without filtering is forbidden.

---

## 1.4 Backend Enforces All Security

Frontend visibility is cosmetic.
Backend is authoritative.

---

# SECTION 2 — SYSTEM ARCHITECTURE

Architecture Style: **Modular Monolith with Clear Service Boundaries**

```
API Layer (Django REST)
    ↓
Application Services Layer
    ↓
Domain Layer (Models + Business Rules)
    ↓
Infrastructure Layer
    ├── PostgreSQL
    ├── Qdrant (Vector DB)
    ├── Redis (Cache)
    ├── Celery (Async)
    └── Object Storage
```

---

# SECTION 3 — TECHNOLOGY STACK (FIXED)

Backend Framework: Django + Django REST Framework
Database: PostgreSQL
Vector Database: Qdrant
Async: Celery + Redis
Cache: Redis
Authentication: JWT
Deployment: Docker-ready

No deviation allowed.

---

# SECTION 4 — DATABASE SCHEMA (COMPLETE)

All IDs must be UUID.

---

## 4.1 Tenant

Fields:

* id (UUID, PK)
* name (string)
* slug (unique string)
* is_active (bool)
* created_at (datetime)

---

## 4.2 User

Fields:

* id (UUID, PK)
* tenant_id (FK)
* username
* email
* password
* department_id (FK nullable)
* is_tenant_admin (bool)
* is_active
* created_at

---

## 4.3 Department

Fields:

* id
* tenant_id
* name
* parent_id (nullable FK)

Hierarchy supported.

---

## 4.4 Role

Fields:

* id
* tenant_id
* name
* description
* parent_id (nullable FK)

Supports inheritance.

---

## 4.5 Permission (Global Table)

Fields:

* id
* name
* resource_type
* action

Example:

| name          | resource_type | action |
| ------------- | ------------- | ------ |
| view_document | document      | read   |

---

## 4.6 RolePermission

Fields:

* role_id
* permission_id

---

## 4.7 UserRole

Fields:

* user_id
* role_id

---

## 4.8 Document

Fields:

* id
* tenant_id
* title
* file_path
* uploaded_by
* department_id
* classification_level (int)
* visibility_type (public/restricted/private)
* created_at

---

## 4.9 DocumentAccess

Fields:

* id
* document_id
* access_type (role/department/user)
* access_id (UUID)

---

## 4.10 AuditLog

Fields:

* id
* tenant_id
* user_id
* action
* resource_type
* resource_id
* metadata (JSON)
* created_at

---

# SECTION 5 — ROLE RESOLUTION ALGORITHM

Input: user_id

Steps:

1. Get direct roles from UserRole.
2. For each role:

   * Add role
   * Traverse parent recursively
3. Return unique role set.

Example:

If assigned:
Team Lead

Hierarchy:
Team Lead → Manager → Director

Resolved roles:
Team Lead, Manager, Director

---

# SECTION 6 — DOCUMENT ACCESS RESOLUTION

Input: user

Steps:

1. Resolve roles (including inherited).
2. Get department chain (including parents).
3. Query DocumentAccess where:

```
(
 access_type = role AND access_id IN role_ids
)
OR
(
 access_type = department AND access_id IN dept_ids
)
OR
(
 access_type = user AND access_id = user.id
)
```

AND

```
document.tenant_id = user.tenant_id
```

Return distinct document IDs.

---

# SECTION 7 — RAG PIPELINE (MANDATORY FLOW)

Input:
User + Query

Flow:

1. Authenticate user.
2. Verify tenant active.
3. Resolve accessible documents.
4. Query vector DB:

Filter:

```
{
  "tenant_id": user.tenant_id,
  "document_id": { "$in": accessible_doc_ids }
}
```

5. Retrieve top_k chunks.
6. Build context.
7. Send to LLM.
8. Return answer + document references.
9. Log audit entry.

---

# SECTION 8 — VECTOR DB REQUIREMENTS

Each chunk MUST contain metadata:

```
tenant_id
document_id
department_id
classification_level
```

Never insert embedding without metadata.

---

# SECTION 9 — DOCUMENT PROCESSING PIPELINE

Trigger: Document uploaded

Async Task Steps:

1. Extract text.
2. Clean text.
3. Chunk (max 500 tokens, overlap 50).
4. Generate embeddings.
5. Batch insert into Qdrant.
6. Log success/failure.

If document deleted:
→ Remove all embeddings by document_id.

---

# SECTION 10 — PERMISSION CHECK SYSTEM

Algorithm:

1. Resolve roles.
2. Get all RolePermissions.
3. Check if any permission matches:
   resource_type + action.

If no match → deny.

---

# SECTION 11 — API ENDPOINTS

Auth:

* POST /auth/login
* POST /auth/refresh

Tenant Admin:

* POST /roles
* POST /permissions/assign
* POST /departments
* POST /documents
* POST /documents/{id}/access

RAG:

* POST /rag/query

Response:

```
{
  "answer": "...",
  "sources": [
    {
      "document_id": "...",
      "title": "..."
    }
  ]
}
```

---

# SECTION 12 — SECURITY REQUIREMENTS

* JWT authentication
* HTTPS only
* Rate limit RAG queries
* Log all queries
* No vector search without filter
* No raw SQL without tenant filter
* Enforce DB indexes on:

  * tenant_id
  * document_id
  * role_id

---

# SECTION 13 — CACHING STRATEGY

Cache:

* Role resolution
* Permission resolution
* Document access list

Cache key format:

```
tenant:{tenant_id}:user:{user_id}:roles
```

Invalidate on:

* Role update
* UserRole update
* DocumentAccess change

---

# SECTION 14 — FAILURE HANDLING

If:

* Vector DB fails → return graceful error.
* LLM fails → return retryable error.
* Embedding fails → mark document processing failed.

Never expose internal errors to user.

---

# SECTION 15 — EDGE CASES

Must handle:

* User without roles → zero access.
* Circular role hierarchy → prevent creation.
* Deleted parent role → reassign children.
* Tenant disabled → block login.
* Role renamed → permissions intact.

---

# SECTION 16 — PERFORMANCE CONSTRAINTS

Target:

* RAG response < 3 seconds
* Role resolution < 50ms (cached)
* Document resolution < 100ms
* Vector search < 500ms

---

# SECTION 17 — AUDIT REQUIREMENTS

Log:

* Document upload
* Document access change
* Role creation/update
* Permission assignment
* RAG query

---

# SECTION 18 — CODING STANDARDS

* Service layer only contains business logic.
* Views contain no business logic.
* No duplicate access logic.
* All access checks via centralized service.
* No circular imports.

---

# SECTION 19 — NON-NEGOTIABLE INVARIANTS

1. No cross-tenant data leakage.
2. No hardcoded role logic.
3. No unrestricted vector search.
4. All document access resolved before retrieval.
5. All operations logged.

Violation of any invariant = critical system flaw.

---

# FINAL INSTRUCTION TO AI IMPLEMENTER

You must:

* Implement exactly as specified.
* Not simplify dynamic RBAC.
* Not remove tenant filters.
* Not embed business logic in views.
* Not bypass document access resolution.
* Not assume default roles.
* Not skip metadata in vector DB.
* Not ignore audit logging.

System must be:

* Secure
* Scalable
* Deterministic
* Enterprise-grade


