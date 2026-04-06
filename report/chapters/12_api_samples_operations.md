# Chapter 12: API Request/Response Samples & Error Catalogue

---

## 12.1 Authentication API Samples

### 12.1.1 Login — Success (No MFA)

**Request:**
```http
POST /api/auth/login/ HTTP/1.1
Content-Type: application/json

{
    "email": "john.doe@acme.com",
    "password": "SecurePass123!"
}
```

**Response (200 OK):**
```json
{
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiYTFiMmMz...",
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVm...",
    "user": {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "email": "john.doe@acme.com",
        "username": "john.doe",
        "first_name": "John",
        "last_name": "Doe",
        "tenant": {
            "id": "f0e1d2c3-b4a5-6789-0123-456789abcdef",
            "name": "Acme Corporation",
            "slug": "acme"
        },
        "is_tenant_admin": false,
        "is_superuser": false,
        "mfa_enabled": false,
        "clearance_level": 2
    }
}
```

### 12.1.2 Login — MFA Required

**Response (200 OK):**
```json
{
    "mfa_required": true,
    "mfa_session": "mfa_abc123def456",
    "mfa_methods": ["totp", "email"],
    "message": "Multi-factor authentication required"
}
```

### 12.1.3 Login — Account Locked

**Response (403 Forbidden):**
```json
{
    "error": "Account locked due to too many failed attempts. Try again later.",
    "code": "account_locked",
    "lockout_remaining": 1740
}
```

### 12.1.4 Login — Invalid Credentials

**Response (401 Unauthorized):**
```json
{
    "error": "Invalid email or password.",
    "code": "invalid_credentials"
}
```

### 12.1.5 Login — Tenant Deactivated

**Response (403 Forbidden):**
```json
{
    "error": "Your organization has been deactivated by the platform owner. Please contact support.",
    "code": "tenant_deactivated"
}
```

---

## 12.2 RAG Query API Samples

### 12.2.1 RAG Query — Streaming SSE

**Request:**
```http
POST /api/rag/query/ HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6...
Content-Type: application/json
Accept: text/event-stream

{
    "question": "What is the company's leave policy for new employees?",
    "session_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012"
}
```

**Response (200 OK, text/event-stream):**
```
data: {"type": "token", "content": "According"}

data: {"type": "token", "content": " to"}

data: {"type": "token", "content": " the"}

data: {"type": "token", "content": " company"}

data: {"type": "token", "content": " leave"}

...

data: {"type": "token", "content": " handbook,"}

data: {"type": "sources", "sources": [
    {
        "document_id": "c3d4e5f6-a7b8-9012-cdef-345678901234",
        "document_title": "Employee Handbook v3.2",
        "file_type": "pdf",
        "chunk_index": 14,
        "relevance_score": 0.9234,
        "text_preview": "New employees are entitled to 15 days of paid annual leave..."
    },
    {
        "document_id": "d4e5f6a7-b8c9-0123-def0-456789012345",
        "document_title": "HR Policy Updates 2026",
        "file_type": "docx",
        "chunk_index": 3,
        "relevance_score": 0.8712,
        "text_preview": "Effective January 2026, the probationary period for leave..."
    }
]}

data: {"type": "metadata", "metadata": {
    "chunks_retrieved": 5,
    "avg_confidence": 0.8821,
    "latency_ms": 2340,
    "tokens_in": 1450,
    "tokens_out": 285,
    "model_used": "gpt-4-turbo-preview",
    "is_follow_up": false,
    "citation_check": {
        "passed": true,
        "grounding_score": 0.4523,
        "valid_citations": [1, 2],
        "invalid_citations": []
    }
}}

data: {"type": "done"}
```

### 12.2.2 RAG Query — Quota Exceeded

**Response (429 Too Many Requests):**
```json
{
    "error": "quota_exceeded",
    "resource": "queries",
    "limit": 16,
    "used": 17,
    "reset_at": "2026-04-04"
}
```

### 12.2.3 RAG Query — No Relevant Documents

**Response (200 OK, SSE stream):**
```
data: {"type": "token", "content": "I could not find relevant information..."}

data: {"type": "sources", "sources": []}

data: {"type": "metadata", "metadata": {
    "chunks_retrieved": 0,
    "avg_confidence": 0,
    "latency_ms": 560
}}

data: {"type": "done"}
```

---

## 12.3 Document Management API Samples

### 12.3.1 Upload Document

**Request:**
```http
POST /api/documents/ HTTP/1.1
Authorization: Bearer eyJ...
Content-Type: multipart/form-data

------boundary
Content-Disposition: form-data; name="file"; filename="handbook.pdf"
Content-Type: application/pdf

<binary PDF content>
------boundary
Content-Disposition: form-data; name="title"

Employee Handbook v3.2
------boundary
Content-Disposition: form-data; name="classification_level"

1
------boundary
Content-Disposition: form-data; name="visibility_type"

restricted
------boundary--
```

**Response (201 Created):**
```json
{
    "id": "c3d4e5f6-a7b8-9012-cdef-345678901234",
    "title": "Employee Handbook v3.2",
    "file_type": "pdf",
    "file_size": 2456789,
    "status": "pending",
    "classification_level": 1,
    "visibility_type": "restricted",
    "uploaded_by": {
        "id": "a1b2c3d4...",
        "email": "admin@acme.com"
    },
    "chunk_count": 0,
    "version": 1,
    "created_at": "2026-04-03T10:30:00Z"
}
```

### 12.3.2 Document List (Paginated)

**Response (200 OK):**
```json
{
    "count": 45,
    "next": "/api/documents/?page=2",
    "previous": null,
    "results": [
        {
            "id": "c3d4e5f6...",
            "title": "Employee Handbook v3.2",
            "file_type": "pdf",
            "status": "completed",
            "classification_level": 1,
            "visibility_type": "restricted",
            "chunk_count": 23,
            "created_at": "2026-04-03T10:30:00Z"
        }
    ]
}
```

---

## 12.4 RBAC API Samples

### 12.4.1 Create Role

**Request:**
```http
POST /api/roles/ HTTP/1.1
Authorization: Bearer eyJ...
Content-Type: application/json

{
    "name": "Department Manager",
    "description": "Can manage users and documents within their department",
    "parent_id": "e5f6a7b8-c9d0-1234-ef56-789012345678"
}
```

**Response (201 Created):**
```json
{
    "id": "f6a7b8c9-d0e1-2345-f678-901234567890",
    "name": "Department Manager",
    "description": "Can manage users and documents within their department",
    "parent": {
        "id": "e5f6a7b8...",
        "name": "Tenant Administrator"
    },
    "level": 1,
    "is_system_role": false,
    "permissions_count": 0,
    "users_count": 0,
    "created_at": "2026-04-03T10:35:00Z"
}
```

---

## 12.5 Error Code Catalogue

### 12.5.1 Authentication Errors (4xx)

| HTTP | Code | Message | Cause |
|:----:|------|---------|-------|
| 401 | `invalid_credentials` | Invalid email or password | Wrong email or password |
| 401 | `invalid_mfa_code` | Invalid MFA code | Wrong TOTP or email OTP |
| 401 | `mfa_session_expired` | MFA session expired | MFA not completed within timeout |
| 401 | `token_expired` | Token has expired | Access token past TTL |
| 401 | `token_invalid` | Token is invalid | Malformed or tampered JWT |
| 403 | `account_locked` | Account locked | Exceeded failed login threshold |
| 403 | `account_inactive` | Account is deactivated | User deactivated by admin |
| 403 | `tenant_deactivated` | Org has been deactivated | Tenant suspended by platform owner |
| 403 | `force_password_change` | Password change required | Admin-initiated forced reset |

### 12.5.2 Authorisation Errors (403)

| HTTP | Code | Message | Cause |
|:----:|------|---------|-------|
| 403 | `permission_denied` | You do not have permission | Missing RBAC permission |
| 403 | `classification_denied` | Insufficient clearance | User clearance < document classification |
| 403 | `tenant_mismatch` | Resource not found | Attempt to access another tenant's data |

### 12.5.3 Quota & Rate Limit Errors (429)

| HTTP | Code | Message | Cause |
|:----:|------|---------|-------|
| 429 | `quota_exceeded` | Quota exceeded for queries | Daily query limit reached |
| 429 | `quota_exceeded` | Quota exceeded for tokens | Daily token limit reached |
| 429 | `quota_exceeded` | Quota exceeded for storage | Storage limit reached |
| 429 | `quota_exceeded` | Quota exceeded for users | User count limit reached |
| 429 | `throttled` | Request was throttled | Rate limit exceeded |

### 12.5.4 Validation Errors (400)

| HTTP | Code | Message | Cause |
|:----:|------|---------|-------|
| 400 | `validation_error` | Field-specific errors | Invalid request payload |
| 400 | `invalid_file_type` | Unsupported file type | Non-allowed MIME type |
| 413 | `file_too_large` | File exceeds maximum size | File > MAX_UPLOAD_SIZE |

### 12.5.5 System Errors (5xx)

| HTTP | Code | Message | Cause |
|:----:|------|---------|-------|
| 500 | `internal_error` | An unexpected error occurred | Unhandled exception |
| 502 | `llm_provider_error` | AI provider unavailable | LLM API returned error |
| 503 | `service_unavailable` | Service temporarily unavailable | Circuit breaker open |

---

# Chapter 13: Installation & Operations Guide

---

## 13.1 Prerequisites

| Component | Version | Purpose |
|-----------|---------|---------|
| Python | 3.11+ | Backend runtime |
| Node.js | 20+ | Frontend build |
| PostgreSQL | 15+ | Primary database |
| Redis | 7+ | Cache, message broker, rate limiting |
| Docker | 24+ | Containerisation |
| Docker Compose | 2.20+ | Multi-container orchestration |

## 13.2 Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/kodezera/intelligence-suite.git
cd intelligence-suite

# 2. Create Python virtual environment
python3.11 -m venv venv
source venv/bin/activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env: set SECRET_KEY, DATABASE_URL, REDIS_URL

# 5. Start infrastructure services
docker-compose up -d db redis qdrant

# 6. Run database migrations
python manage.py migrate

# 7. Create initial superuser (Platform Owner)
python manage.py createsuperuser

# 8. Seed default data (roles, permissions, plans)
python manage.py seed_data   # If available

# 9. Start Django development server
python manage.py runserver

# 10. Frontend setup (separate terminal)
cd frontend
npm install
npm run dev

# Access:
#   Backend API:  http://localhost:8000/api/
#   Frontend UI:  http://localhost:5173/
```

## 13.3 Production Deployment

```bash
# 1. Build the Docker image
docker build -t kodezera:latest .

# 2. Configure production environment
cp .env.example .env
# Edit .env:
#   DEBUG=False
#   SECRET_KEY=<generate with: python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())">
#   DATABASE_URL=postgresql://kodezera:<password>@pgbouncer:5432/kodezera_db
#   REDIS_PASSWORD=<strong password>
#   ALLOWED_HOSTS=kodezera.example.com
#   CORS_ALLOWED_ORIGINS=https://kodezera.example.com

# 3. Launch the full production stack
docker-compose -f docker-compose.prod.yml up -d

# 4. Create the first superuser
docker-compose -f docker-compose.prod.yml run --rm backend \
    python manage.py createsuperuser

# 5. Verify deployment
curl http://localhost:8000/api/health/
# Expected: {"status": "healthy", "database": "ok", "redis": "ok", "qdrant": "ok"}
```

## 13.4 Kubernetes Deployment

```bash
# 1. Create namespace
kubectl create namespace kodezera

# 2. Create secrets (from .env file)
kubectl create secret generic kodezera-secrets \
    --from-env-file=.env \
    -n kodezera

# 3. Apply Kubernetes manifests
kubectl apply -f infra/k8s/ -n kodezera

# 4. Verify pods are running
kubectl get pods -n kodezera
# Expected: backend (2/2), celery-default (1/1), celery-embedding (1/1), celery-beat (1/1)

# 5. Run initial migration
kubectl exec -it deployment/kodezera-backend -n kodezera -- \
    python manage.py migrate

# 6. Create superuser
kubectl exec -it deployment/kodezera-backend -n kodezera -- \
    python manage.py createsuperuser
```

## 13.5 Backup & Disaster Recovery

### 13.5.1 Backup Strategy

| Component | Method | Frequency | Retention |
|-----------|--------|:---------:|:---------:|
| PostgreSQL | `pg_dump` → S3 | Daily | 30 days |
| PostgreSQL WAL | Continuous archiving | Real-time | 7 days |
| Qdrant | Snapshot API | Daily | 14 days |
| Redis | RDB snapshot | Every 60s (1000 changes) | 7 days |
| Media files | rsync → S3 | Daily | 90 days |
| Application code | Git repository | Continuous | Permanent |

### 13.5.2 Recovery Procedures

**Database Recovery:**
```bash
# Point-in-time recovery (PostgreSQL)
pg_restore --clean --if-exists -d kodezera_db latest_backup.dump

# Or restore from WAL archive
recovery_target_time = '2026-04-03 10:00:00'
```

**Vector Store Recovery:**
```bash
# Option A: Restore from Qdrant snapshot
curl -X POST "http://localhost:6333/collections/kodezera_documents/snapshots/recover"

# Option B: Re-embed from source documents
python manage.py reprocess_all_documents
```

### 13.5.3 SLA Targets

| Metric | Target |
|--------|:------:|
| Uptime | 99.9% |
| RPO (Recovery Point Objective) | 1 hour |
| RTO (Recovery Time Objective) | 4 hours |
| API response time (p95) | < 200ms (non-RAG) |
| RAG query time (p95) | < 8 seconds |

---

## 13.6 Compliance Mapping

### 13.6.1 GDPR Compliance

| GDPR Article | Requirement | KIS Implementation |
|:------------:|-------------|-------------------|
| Art. 5 | Data minimisation | Query hashes stored instead of raw queries; minimal PII in logs |
| Art. 6 | Lawful basis | Consent at registration; legitimate interest for analytics |
| Art. 15 | Right of access | User profile endpoint (`/api/auth/me/`) returns all stored data |
| Art. 17 | Right to erasure | Data deletion request endpoint; cascading soft-delete |
| Art. 25 | Privacy by design | Tenant isolation; classification levels; role-based access |
| Art. 30 | Records of processing | Audit log with hash chain integrity |
| Art. 32 | Security of processing | MFA, JWT rotation, encryption at rest, RBAC |
| Art. 33 | Breach notification | Security alerts with automatic detection |
| Art. 35 | DPIA | Classification levels enforce data sensitivity awareness |

### 13.6.2 SOC 2 Trust Service Criteria

| Criteria | Category | KIS Implementation |
|----------|----------|-------------------|
| CC1 | Control Environment | Role hierarchy, separation of duties, platform owner oversight |
| CC2 | Communication | Notification system, audit logs, security alerts |
| CC3 | Risk Assessment | Security detection rules, alert rules with thresholds |
| CC5 | Control Activities | RBAC enforcement, quota limits, rate limiting |
| CC6 | Access Controls | MFA, JWT, session management, clearance levels |
| CC7 | System Operations | Health checks, Celery monitoring, structured logging |
| CC8 | Change Management | Audit events for config changes, version tracking |
| A1 | Availability | HPA auto-scaling, health probes, graceful degradation |
| C1 | Confidentiality | Classification levels, tenant isolation, encryption |
| PI1 | Processing Integrity | Citation verification, hash chain, input validation |

### 13.6.3 ISO 27001 (Annex A Controls)

| Control | Description | KIS Implementation |
|---------|-------------|-------------------|
| A.5.1 | Information security policies | RBAC with deny-first evaluation |
| A.6.1 | Organisation of information security | Multi-tenant isolation, platform owner oversight |
| A.8.1 | Asset management | Document classification (0–5 levels) |
| A.9.1 | Access control | RBAC + ABAC + closure table hierarchy |
| A.9.4 | System access control | JWT authentication, MFA, account lockout |
| A.10.1 | Cryptographic controls | SHA-256 hash chain, bcrypt/Argon2 passwords |
| A.12.1 | Operational procedures | Docker/K8s deployment manifests, health checks |
| A.12.4 | Logging and monitoring | Audit events, Sentry, structured JSON logs |
| A.13.1 | Network security | TLS, CORS, rate limiting, ingress rules |
| A.14.1 | System development | Environment-specific settings, migration scripts |
| A.16.1 | Incident management | Security detection rules, alert lifecycle |
| A.18.1 | Compliance | Compliance reporting endpoint, data retention policies |

---
