# Chapter 4 (Continued): Middleware Pipeline, API Catalogue, and Frontend Architecture

---

## 4.3 Middleware Pipeline

The Django middleware pipeline processes every HTTP request/response in sequence. The Kodezera Intelligence Suite defines five custom middleware classes:

```
Request Flow:
  SecurityMiddleware → WhiteNoiseMiddleware → CorsMiddleware
  → SessionMiddleware → CommonMiddleware → CsrfViewMiddleware
  → AuthenticationMiddleware → MessageMiddleware → XFrameOptionsMiddleware
  → CorrelationMiddleware → TimingMiddleware → TenantIsolationMiddleware
  → QuotaEnforcementMiddleware → AuditLoggingMiddleware
  → [View/DRF Processing]
  → Reverse through all middleware (process_response)
```

### 4.3.1 CorrelationMiddleware

**Purpose**: Injects a unique `X-Request-ID` UUID into every request for end-to-end distributed tracing.

```python
class CorrelationMiddleware(MiddlewareMixin):
    def process_request(self, request):
        request_id = request.META.get('HTTP_X_REQUEST_ID')
        if not request_id:
            request_id = str(uuid.uuid4())
        request.META['request_id'] = request_id

    def process_response(self, request, response):
        request_id = getattr(request, 'META', {}).get('request_id', '')
        if request_id:
            response['X-Request-ID'] = request_id
        return response
```

**Behaviour**: If an upstream reverse proxy (Nginx, CloudFront) already supplies `X-Request-ID`, it is reused. Otherwise, a new UUID is generated. This ID propagates to all log entries and audit records, enabling full request tracing.

### 4.3.2 TimingMiddleware

**Purpose**: Measures end-to-end request latency and adds response headers for monitoring.

**Response Headers Added**:
- `X-Response-Time`: Request processing duration in milliseconds
- `X-Quota-Limit`: Tenant's daily query quota
- `X-Quota-Used`: Current day's query count
- `X-Quota-Remaining`: Remaining queries for the day

### 4.3.3 TenantIsolationMiddleware

**Purpose**: Enforces tenant-level access control at the HTTP layer.

**Behaviour**:
1. Attaches `request.tenant` from the authenticated user's tenant FK.
2. If the tenant's `is_active` flag is `False`, immediately returns `403 Forbidden` with a descriptive error message.
3. All downstream views and services read `request.tenant` to scope database queries.

### 4.3.4 QuotaEnforcementMiddleware

**Purpose**: Blocks RAG queries when the tenant has exceeded their daily plan quota.

**Behaviour**: Only activates on POST requests to `/api/rag/query/` paths. Calls `QuotaService.check_queries()` which reads the tenant's subscription plan limits and current-day usage from Redis. Returns `429 Too Many Requests` if quota is exceeded.

### 4.3.5 AuditLoggingMiddleware

**Purpose**: Automatically logs all write operations (POST, PUT, PATCH, DELETE) to both the `AuditEvent` and legacy `AuditLog` models.

**Key Design Decisions**:
- **JWT user resolution**: Falls back to `JWTAuthentication().authenticate()` for stateless API clients without Django sessions.
- **Dual-write**: Writes to both the new `AuditEvent` model (with hash chain) and the legacy `AuditLog` model for backward compatibility.
- **Non-blocking**: Uses try/except to prevent audit failures from breaking user requests.
- **Skip paths**: `/admin/`, `/static/`, `/media/` are excluded from audit logging.

---

## 4.4 Complete API Endpoint Catalogue

### 4.4.1 Authentication Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/api/auth/login/` | ✗ | Authenticate user; returns JWT tokens or MFA challenge |
| POST | `/api/auth/refresh/` | ✗ | Refresh access token using refresh token |
| POST | `/api/auth/logout/` | ✓ | Blacklist current refresh token |
| POST | `/api/auth/logout-all/` | ✓ | Revoke all sessions for current user |
| GET/PUT | `/api/auth/me/` | ✓ | Get or update own profile |
| POST | `/api/auth/change-password/` | ✓ | Change password (requires current password) |
| POST | `/api/auth/forgot-password/` | ✗ | Request password reset OTP |
| POST | `/api/auth/reset-password/` | ✗ | Verify OTP and set new password |

### 4.4.2 MFA Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/api/auth/mfa/verify/` | ✗ | Verify MFA code during login |
| POST | `/api/auth/mfa/send-email/` | ✗ | Send email OTP for MFA |
| POST | `/api/auth/mfa/setup/` | ✓ | Start TOTP MFA setup; returns QR code |
| POST | `/api/auth/mfa/confirm/` | ✓ | Confirm TOTP setup with first code |
| GET | `/api/auth/mfa/devices/` | ✓ | List MFA devices |
| DELETE | `/api/auth/mfa/devices/{id}/` | ✓ | Remove an MFA device |
| POST | `/api/auth/mfa/disable/` | ✓ | Disable MFA (requires password) |

### 4.4.3 Session Management Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api/auth/sessions/` | ✓ | List all active sessions |
| POST | `/api/auth/sessions/{id}/revoke/` | ✓ | Revoke a specific session |

### 4.4.4 User & Admin Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET/POST | `/api/users/` | ✓ | List/create users (admin) |
| GET/PUT/DELETE | `/api/users/{id}/` | ✓ | Retrieve/update/deactivate user (admin) |
| POST | `/api/admin/users/{id}/force-reset/` | ✓ | Force password reset (admin) |
| POST | `/api/admin/users/{id}/unlock/` | ✓ | Unlock locked account (admin) |
| GET | `/api/admin/users/{id}/sessions/` | ✓ | View user sessions (admin) |
| POST | `/api/admin/users/{id}/revoke-all/` | ✓ | Revoke all user sessions (admin) |

### 4.4.5 RBAC Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET/POST | `/api/roles/` | ✓ | List/create roles |
| GET/PUT/DELETE | `/api/roles/{id}/` | ✓ | Manage a specific role |
| GET | `/api/permissions/` | ✓ | List all system permissions |
| GET/POST | `/api/user-roles/` | ✓ | List/assign user-role mappings |
| DELETE | `/api/user-roles/{id}/` | ✓ | Remove a user-role assignment |

### 4.4.6 Document Management Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET/POST | `/api/documents/` | ✓ | List accessible documents / upload new |
| GET/PUT/DELETE | `/api/documents/{id}/` | ✓ | Retrieve/update/soft-delete document |
| GET/POST | `/api/document-access/` | ✓ | List/create access grants |
| GET/POST | `/api/document-folders/` | ✓ | List/create document folders |
| GET/POST | `/api/document-tags/` | ✓ | List/create document tags |

### 4.4.7 RAG Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/api/rag/query/` | ✓ | Execute RAG query (streaming SSE) |
| GET/POST | `/api/rag/sessions/` | ✓ | List/create chat sessions |
| GET/PUT/DELETE | `/api/rag/sessions/{id}/` | ✓ | Manage a specific chat session |
| GET/POST | `/api/rag/folders/` | ✓ | List/create chat folders |

### 4.4.8 Organisation & Department Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET/POST | `/api/departments/` | ✓ | List/create departments |
| GET/POST | `/api/org-units/` | ✓ | List/create org units |
| GET/PUT/DELETE | `/api/org-units/{id}/` | ✓ | Manage a specific org unit |

### 4.4.9 Analytics Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api/dashboard/` | ✓ | Dashboard stats and quick overview |
| GET | `/api/dashboard/trends/` | ✓ | Time-series trend data |
| GET | `/api/dashboard/my-analytics/` | ✓ | Personal usage analytics |
| GET | `/api/analytics/tenant/` | ✓ | Tenant-wide analytics (admin) |
| GET/POST | `/api/analytics/alerts/rules/` | ✓ | Alert rule management |
| GET | `/api/analytics/alerts/` | ✓ | Triggered alert instances |

### 4.4.10 Notification Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api/notifications/` | ✓ | List user notifications |
| GET | `/api/notifications/unread-count/` | ✓ | Count of unread notifications |
| POST | `/api/notifications/{id}/read/` | ✓ | Mark notification as read |
| POST | `/api/notifications/read-all/` | ✓ | Mark all notifications as read |
| DELETE | `/api/notifications/{id}/` | ✓ | Dismiss a notification |
| GET/PUT | `/api/notifications/preferences/` | ✓ | Manage notification preferences |

### 4.4.11 Audit & Compliance Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api/audit/events/` | ✓ | List audit events (tenant admin) |
| GET | `/api/audit/events/{id}/` | ✓ | Audit event detail |
| GET | `/api/audit/events/export/` | ✓ | Export audit events |
| GET | `/api/audit/events/stats/` | ✓ | Audit statistics |
| GET | `/api/audit/security-alerts/` | ✓ | Security alerts |
| GET | `/api/audit/compliance/` | ✓ | Compliance records |
| GET | `/api/audit/compliance/report/` | ✓ | Compliance report |

### 4.4.12 Platform Owner Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api/platform/overview/` | ✓★ | Platform-wide overview (superuser only) |
| GET/POST | `/api/platform/tenants/` | ✓★ | List/create tenants |
| GET/PUT/DELETE | `/api/platform/tenants/{id}/` | ✓★ | Manage specific tenant |
| GET | `/api/platform/system-health/` | ✓★ | System health check |
| GET/PUT | `/api/platform/ai-config/` | ✓★ | AI provider configuration |
| GET | `/api/platform/ai-config/available-models/` | ✓★ | Available LLM/embedding models |
| GET/POST | `/api/platform/subscriptions/plans/` | ✓★ | Subscription plan management |
| GET/POST | `/api/platform/feature-flags/` | ✓★ | Feature flag management |
| GET | `/api/platform/analytics/enhanced/` | ✓★ | Enhanced analytics |
| GET | `/api/platform/analytics/quality/` | ✓★ | RAG quality metrics |
| GET | `/api/platform/analytics/forecast/` | ✓★ | Usage forecasting |

★ = Superuser (Platform Owner) only

### 4.4.13 Health & Infrastructure

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api/health/` | ✗ | Application health check |
| GET | `/healthz` | ✗ | Kubernetes liveness probe |
| GET | `/readyz` | ✗ | Kubernetes readiness probe |

**Total endpoints: 80+**

---

## 4.5 Frontend Architecture

### 4.5.1 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| UI Framework | React 19.2 | Component-based rendering |
| Language | TypeScript 5.9 | Static type safety |
| Build Tool | Vite 7.3 | HMR, ESBuild bundling |
| Routing | React Router 7.13 | Client-side SPA routing |
| State Management | Zustand 5.0 | Lightweight global state (auth, UI) |
| HTTP Client | Axios 1.13 | JWT interceptor, error handling |
| Forms | React Hook Form 7.71 + Zod 4.3 | Form state + schema validation |
| Charts | Recharts 2.15 | Analytics visualisations |
| Icons | Lucide React 0.564 | SVG icon library |
| Styling | Tailwind CSS 3.4 | Utility-first CSS framework |

### 4.5.2 Page Component Map

| Page Component | Route | Description |
|---------------|-------|-------------|
| `Login.tsx` | `/login` | Email/password + MFA login |
| `ForgotPassword.tsx` | `/forgot-password` | Password reset request |
| `ResetPassword.tsx` | `/reset-password` | OTP verification + new password |
| `Dashboard.tsx` | `/dashboard` | Tenant admin dashboard |
| `Chat.tsx` | `/chat` | AI chatbot with session management |
| `Documents.tsx` | `/documents` | Document upload, browse, manage |
| `Users.tsx` | `/users` | User management (admin) |
| `Roles.tsx` | `/roles` | Role and permission management |
| `Departments.tsx` | `/departments` | Department/org unit management |
| `AuditLogs.tsx` | `/audit` | Audit log viewer |
| `Settings.tsx` | `/settings` | AI config and tenant settings |
| `Profile.tsx` | `/profile` | User profile and MFA management |
| `Notifications.tsx` | `/notifications` | Notification inbox |
| `MyAnalytics.tsx` | `/my-analytics` | Personal usage analytics |
| `PlatformDashboard.tsx` | `/platform` | Platform owner dashboard |

### 4.5.3 State Management Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Zustand Stores                        │
├────────────────────┬────────────────────────────────────┤
│  useAuthStore      │  useUIStore                         │
│  ─────────────     │  ──────────                         │
│  • user            │  • sidebarCollapsed                 │
│  • tokens          │  • theme (dark/light)               │
│  • isAuthenticated │  • notifications[]                  │
│  • login()         │  • toggleSidebar()                  │
│  • logout()        │  • setTheme()                       │
│  • refreshToken()  │  • addNotification()                │
└────────────────────┴────────────────────────────────────┘
```

### 4.5.4 Axios Interceptor Pattern

```typescript
// JWT auto-attach + refresh token rotation
axiosInstance.interceptors.request.use((config) => {
    const token = useAuthStore.getState().tokens?.access;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401 && !error.config._retry) {
            error.config._retry = true;
            const newTokens = await refreshTokenAPI();
            error.config.headers.Authorization = `Bearer ${newTokens.access}`;
            return axiosInstance(error.config);
        }
        return Promise.reject(error);
    }
);
```

---

## 4.6 Additional Service-Layer Components

### 4.6.1 Core Services Catalogue

| Service | File | Purpose |
|---------|------|---------|
| `AuthenticationService` | `core/services/authentication.py` | Login, MFA verification, JWT issuance, logout |
| `MFAService` | `core/services/mfa.py` | TOTP setup/verify, email OTP, device management |
| `SessionManagerService` | `core/services/session_manager.py` | Active session tracking, device fingerprinting, revocation |
| `PasswordService` | `core/services/password.py` | Password complexity validation, history enforcement |
| `PasswordResetService` | `core/services/password_reset.py` | OTP generation, email dispatch, reset verification |
| `LockoutService` | `core/services/lockout.py` | Failed attempt tracking, account lockout/unlock |
| `QuotaService` | `core/services/quota.py` | Plan-based quota checking, daily usage tracking |
| `AuditService` | `core/services/audit_service.py` | Structured audit event creation, hash chain integrity |
| `OrgHierarchyService` | `core/services/org_hierarchy.py` | Closure table maintenance for org units |
| `NotificationService` | `core/services/notifications.py` | Template rendering, fan-out, delivery dispatch |
| `DispatcherService` | `core/services/dispatcher.py` | Multi-channel notification delivery |
| `FeatureFlagService` | `core/services/feature_flags.py` | Tenant-level feature flag evaluation |
| `CircuitBreaker` | `core/services/circuit_breaker.py` | External service failure protection |
| `HashChainService` | `core/services/hash_chain.py` | Tamper-evident audit log chain |
| `SecurityDetectionService` | `core/services/security_detection.py` | Anomaly detection for security alerts |
| `ComplianceService` | `core/services/compliance.py` | GDPR/SOC 2 compliance record management |
| `HealthService` | `core/services/health.py` | System component health checks |

### 4.6.2 RBAC Services

| Service | File | Purpose |
|---------|------|---------|
| `RoleResolutionService` | `rbac/services/authorization.py` | Closure-table role inheritance resolution |
| `PermissionService` | `rbac/services/authorization.py` | Deny-first permission evaluation with ABAC |
| `ConditionEngine` | `rbac/services/authorization.py` | ABAC condition evaluation |
| `RoleHierarchyService` | `rbac/services/role_hierarchy.py` | Closure table CRUD for role trees |

### 4.6.3 RAG Services

| Service | File | Purpose |
|---------|------|---------|
| `RAGPipeline` | `rag/services/rag_pipeline.py` | Orchestration of retrieval + generation |
| `RAGRetriever` | `rag/services/retriever.py` | Vector search, re-ranking, context expansion |
| `EmbeddingService` | `rag/services/embeddings.py` | Multi-provider embedding generation |
| `VectorStoreService` | `rag/services/vector_store.py` | Qdrant CRUD with tenant-scoped filters |
| `LLMRunner` | `rag/services/llm_runner.py` | Multi-provider LLM inference (sync + stream) |
| `CitationVerifier` | `rag/services/citation_verifier.py` | Grounding score and citation index validation |
| `DocumentProcessingService` | `rag/services/document_processing.py` | Text extraction, cleaning, chunking |

### 4.6.4 Document Services

| Service | File | Purpose |
|---------|------|---------|
| `DocumentAccessService` | `documents/services/access.py` | 6-rule document access resolution |

---
