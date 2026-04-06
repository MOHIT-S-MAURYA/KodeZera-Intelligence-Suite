# Chapter 5: Testing

---

## 5.1 Testing Strategy

### 5.1.1 Overview

The Kodezera Intelligence Suite employs a multi-layered testing strategy that validates the system across four dimensions: **unit correctness**, **integration behaviour**, **security compliance**, and **user experience**.

The testing philosophy is built on the Testing Pyramid model:

```
          ┌───────────┐
          │  E2E / UI  │    ← Manual browser tests, Stitch design reviews
         ┌┴───────────┴┐
         │ Integration  │   ← API endpoint tests, pipeline tests
        ┌┴─────────────┴┐
        │   Unit Tests   │  ← Service methods, model logic, utilities
       └────────────────┘
```

### 5.1.2 Test Environment Configuration

| Aspect | Configuration |
|--------|--------------|
| **Framework** | pytest 7.4.4 + pytest-django 4.7.0 |
| **Factory Library** | factory-boy 3.3.0 + faker 22.0.0 |
| **Database (Test)** | SQLite (in-memory) for speed; PostgreSQL for integration |
| **Vector DB (Test)** | Qdrant in-memory mode (`:memory:`) |
| **Cache (Test)** | Django LocMemCache (no Redis dependency) |
| **Celery (Test)** | CELERY_ALWAYS_EAGER = True (synchronous execution) |

---

## 5.2 Test Plan

### 5.2.1 Unit Test Plan

| ID | Module | Component | Test Objective | Method |
|----|--------|-----------|---------------|--------|
| UT-01 | core | Tenant model | Validate tenant creation with unique domain constraint | Model instantiation + constraint violation test |
| UT-02 | core | User model | Validate custom user manager, email normalisation, password hashing | Manager create_user() + create_superuser() |
| UT-03 | core | OrgUnit model | Validate depth limit (MAX_DEPTH=15) and cross-tenant parent rejection | Model.clean() with ValidationError assertion |
| UT-04 | rbac | RoleResolutionService | Verify closure-table ancestor expansion returns complete role set | Create 3-level hierarchy, assert all ancestors returned |
| UT-05 | rbac | PermissionService | Verify deny-first evaluation order | Create allow + deny for same resource, assert deny wins |
| UT-06 | rbac | ConditionEngine | Verify ABAC condition evaluation (department='own', classification_level lte) | Pass context dicts with boundary values |
| UT-07 | documents | DocumentAccessService | Verify 6-rule access resolution aggregation | Create grants of each type, assert correct ID set |
| UT-08 | documents | DocumentAccessService | Verify classification enforcement excludes over-classified docs | User clearance=2, doc classification=3, assert excluded |
| UT-09 | rag | DocumentProcessingService | Verify chunk count and overlap for known input | Input with 1200 tokens → expect 3 chunks with 50-token overlap |
| UT-10 | rag | RAGRetriever._rewrite_query | Verify referential query rewriting | "What about this?" with history → expect prepended context |
| UT-11 | rag | RAGRetriever._rerank_results | Verify hybrid score calculation | Known semantic + lexical inputs → assert combined score |
| UT-12 | rag | CitationVerifier | Verify grounding score and citation index validation | Known answer + sources → assert pass/fail |
| UT-13 | rag | EmbeddingService | Verify dimension validation and padding/truncation | Input 100-dim vector when 384 expected → assert padded |
| UT-14 | analytics | QueryAnalytics | Verify cost calculation from token counts and cost rates | Known input/output tokens + cost rate → assert cost_usd |
| UT-15 | core | PasswordService | Verify password history prevents reuse of last N passwords | Set password 3 times, attempt reuse → assert rejection |

### 5.2.2 Integration Test Plan

| ID | Module | Scope | Test Objective | Method |
|----|--------|-------|---------------|--------|
| IT-01 | auth | Login flow | Verify JWT issuance and refresh token rotation | POST /api/auth/login/ → verify tokens → POST /api/auth/refresh/ → verify new access token |
| IT-02 | auth | MFA flow | Verify TOTP challenge and verification | Enable MFA → login → assert mfa_required=true → verify OTP → assert tokens issued |
| IT-03 | auth | Account lockout | Verify lockout after N failed attempts | Submit wrong password 5× → assert "Account locked" → admin unlock → assert login succeeds |
| IT-04 | rbac | Permission enforcement | Verify API endpoint returns 403 for unpermitted users | Create user with no 'document:upload' permission → POST /api/documents/upload/ → assert 403 |
| IT-05 | documents | Upload pipeline | Verify document processing from upload to 'completed' status | Upload PDF → assert status='pending' → run Celery task synchronously → assert status='completed', chunk_count > 0 |
| IT-06 | rag | Query pipeline | Verify end-to-end RAG query returns answer with sources | Upload + process document → query → assert answer contains relevant content, sources non-empty |
| IT-07 | rag | Tenant isolation | Verify RAG query does not return chunks from other tenants | Create doc in tenant A, query from tenant B → assert empty results |
| IT-08 | rag | Classification enforcement | Verify RAG query excludes over-classified documents | User clearance=1, doc classification=3 → query → assert doc not in results |
| IT-09 | documents | Access grant | Verify role-based document access grant | Create restricted doc → grant to role → assign role to user → assert user can access doc |
| IT-10 | analytics | Metric recording | Verify query analytics recorded after RAG query | Execute RAG query → assert QueryAnalytics record exists with correct latency and chunk count |

### 5.2.3 Security Test Plan

| ID | Category | Test Objective | Method | Expected Result |
|----|---------|---------------|--------|-----------------|
| ST-01 | Authentication | JWT without valid token | Call protected endpoint without Authorization header | 401 Unauthorized |
| ST-02 | Authentication | Expired JWT | Use token past ACCESS_TOKEN_LIFETIME | 401 Unauthorized |
| ST-03 | Tenant Isolation | Cross-tenant data access | Authenticate as tenant A, request tenant B's documents | 404 Not Found or empty list |
| ST-04 | Tenant Isolation | Cross-tenant user management | Authenticated as admin of tenant A, attempt to modify user in tenant B | 404 Not Found |
| ST-05 | RBAC | Privilege escalation | Regular user attempts to access admin endpoints | 403 Forbidden |
| ST-06 | RBAC | Permission bypass via direct URL | User without 'document:delete' permission sends DELETE request | 403 Forbidden |
| ST-07 | Input Validation | SQL injection | Submit `'; DROP TABLE users; --` as query parameter | Parameterised queries prevent execution; 400 Bad Request |
| ST-08 | Input Validation | XSS in document title | Upload document with `<script>alert(1)</script>` as title | Title stored as plain text, rendered escaped in frontend |
| ST-09 | Rate Limiting | Exceed tenant query limit | Send 201 queries in 1 minute (limit=200) | 429 Too Many Requests |
| ST-10 | Rate Limiting | Exceed user query limit | Send 31 queries in 1 minute (limit=30) | 429 Too Many Requests |
| ST-11 | File Upload | Malicious file type | Upload .exe file renamed to .pdf | Rejected by MIME type validation |
| ST-12 | File Upload | Oversized file | Upload 100MB file (limit=50MB) | 413 Payload Too Large |

### 5.2.4 UI/UX Test Plan

| ID | Page | Test Objective | Method |
|----|------|---------------|--------|
| UX-01 | Login | Verify form validation and error display | Enter invalid email → assert inline error; wrong password → assert toast notification |
| UX-02 | Dashboard | Verify stat card population and navigation | Assert all 4 stat cards render with correct numbers; click each action button → assert route change |
| UX-03 | Chat | Verify streaming response rendering | Send query → assert typing indicator → assert progressive markdown rendering → assert source cards appear |
| UX-04 | Chat | Verify session management | Create folder → move chat to folder → rename chat → delete chat → assert UI updates |
| UX-05 | Documents | Verify upload flow with progress | Select file → assert progress bar → assert status badge changes (pending → processing → completed) |
| UX-06 | Roles | Verify permission matrix interaction | Create role → toggle permissions → save → assert role appears in list with correct permission count |
| UX-07 | Analytics | Verify chart rendering and date filter | Change date range → assert charts re-render with updated data |
| UX-08 | Responsive | Verify mobile layout | Set viewport to 375px → assert sidebar collapses to hamburger menu → assert all pages render without overflow |
| UX-09 | Dark Mode | Verify theme consistency | Toggle dark mode → assert all pages use dark palette → refresh → assert preference persisted |
| UX-10 | Accessibility | Verify keyboard navigation | Tab through login form → assert focus indicators visible → Enter to submit → assert form submits |

---

## 5.3 Test Cases (Detailed)

### TC-01: Closure-Table Role Resolution

| Field | Value |
|-------|-------|
| **ID** | TC-01 |
| **Objective** | Verify that `resolve_user_roles()` returns all ancestor roles via the closure table |
| **Preconditions** | Three roles exist: CEO → VP → Manager (parent chain). User assigned to "Manager" role only. |
| **Steps** | 1. Create roles: CEO (level=0), VP (level=1, parent=CEO), Manager (level=2, parent=VP). 2. Auto-generate RoleClosure entries: CEO-CEO(0), VP-VP(0), VP-CEO(1), Manager-Manager(0), Manager-VP(1), Manager-CEO(2). 3. Assign user to "Manager" role. 4. Call `RoleResolutionService.resolve_user_roles(user)`. |
| **Expected Result** | Returned set contains all three role IDs: {CEO.id, VP.id, Manager.id} |
| **Status** | ✅ Pass |

### TC-02: Deny-First Permission Evaluation

| Field | Value |
|-------|-------|
| **ID** | TC-02 |
| **Objective** | Verify that an explicit deny rule overrides an allow rule |
| **Preconditions** | Role "Viewer" has allow permission for `document:read`. Role "Restricted" has deny permission for `document:read`. User assigned both roles. |
| **Steps** | 1. Create allow permission: `document:read` (is_deny=False). 2. Create deny permission: `document:read` (is_deny=True). 3. Assign allow to "Viewer", deny to "Restricted". 4. Assign both roles to user. 5. Call `PermissionService.has_permission(user, 'document', 'read')`. |
| **Expected Result** | Returns `False` (deny wins) |
| **Status** | ✅ Pass |

### TC-03: Cross-Tenant RAG Isolation

| Field | Value |
|-------|-------|
| **ID** | TC-03 |
| **Objective** | Verify that a RAG query in tenant A never returns chunks from tenant B |
| **Preconditions** | Tenant A has document D1 (processed, public). Tenant B has user U2. D1's chunks are stored in Qdrant with tenant_id=A. |
| **Steps** | 1. Upload and process document in tenant A. 2. Authenticate as user in tenant B. 3. Execute RAG query that would match D1's content. 4. Inspect retrieved chunks. |
| **Expected Result** | Retrieved chunks list is empty. Response: "I could not find relevant information." |
| **Status** | ✅ Pass |

### TC-04: Classification-Level Enforcement

| Field | Value |
|-------|-------|
| **ID** | TC-04 |
| **Objective** | Verify that users cannot access documents above their clearance level |
| **Preconditions** | User with clearance_level=1. Document with classification_level=3 (Confidential). Public visibility. Same tenant. |
| **Steps** | 1. Create document with classification_level=3, visibility='public'. 2. Process document. 3. Call `DocumentAccessService.get_accessible_document_ids(user)`. |
| **Expected Result** | Document ID is NOT in the returned set despite public visibility |
| **Status** | ✅ Pass |

### TC-05: Time-Bound Role Expiration

| Field | Value |
|-------|-------|
| **ID** | TC-05 |
| **Objective** | Verify that expired role assignments are excluded from resolution |
| **Preconditions** | User assigned role with `expires_at` = 1 hour ago. |
| **Steps** | 1. Create UserRole with expires_at = now() - 1 hour. 2. Call `RoleResolutionService.resolve_user_roles(user)`. |
| **Expected Result** | Returned set is empty (expired role excluded) |
| **Status** | ✅ Pass |

---
