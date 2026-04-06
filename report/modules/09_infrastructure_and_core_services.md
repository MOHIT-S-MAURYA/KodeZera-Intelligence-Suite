# Infrastructure & Core Services — Complete Analysis & System Design

**Date:** 10 March 2026
**Scope:** Full analysis of middleware, caching, throttling, async tasks, error handling, configuration, deployment
**Principle:** Analyse current → Identify gaps → Design enterprise-grade infrastructure layer

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Deep-Dive](#2-component-deep-dive)
3. [SWOT Analysis](#3-swot-analysis)
4. [Gap Analysis — Current vs Enterprise-Grade](#4-gap-analysis)
5. [Advanced System Design](#5-advanced-system-design)
6. [Architecture Design](#6-architecture-design)
7. [Data Model Design](#7-data-model-design)
8. [API Design](#8-api-design)
9. [Security Design](#9-security-design)
10. [Scalability & Reliability Design](#10-scalability--reliability-design)
11. [Frontend Design](#11-frontend-design)
12. [Migration Strategy](#12-migration-strategy)
13. [Implementation Roadmap](#13-implementation-roadmap)

---

## 1. System Overview

### 1.1 Current Architecture Summary

The infrastructure layer spans **12+ files** providing cross-cutting concerns:

| Layer            | Files                                      | Purpose                                        |
| ---------------- | ------------------------------------------ | ---------------------------------------------- |
| **Middleware**   | `core/middleware.py` (2 classes)           | Tenant isolation + audit logging               |
| **Throttling**   | `core/throttle.py` (3 classes)             | Per-tenant + per-user rate limiting            |
| **Quota**        | `core/quota.py` (1 function)               | Daily query quota enforcement                  |
| **Exceptions**   | `core/exceptions.py` (6 classes + handler) | Custom exceptions + safe error responses       |
| **Celery**       | `config/celery.py`                         | Async task queue configuration                 |
| **Settings**     | `config/settings.py`                       | Django config, REST, JWT, caching, logging     |
| **Docker**       | `Dockerfile`, `docker-compose.yml`         | Containerization + multi-service orchestration |
| **Requirements** | `requirements.txt`                         | Python dependency management                   |
| **ASGI**         | `config/asgi.py`                           | ASGI application entry point                   |
| **WSGI**         | `config/wsgi.py`                           | WSGI application entry point                   |
| **URLs**         | `config/urls.py`                           | URL routing                                    |
| **Management**   | `core/management/commands/`                | Custom management commands                     |

### 1.2 Current Infrastructure Stack

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (React)                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│                     Django 5.0 + DRF                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ CORS (corsheaders)              │  │ WhiteNoise   │       │
│  ├──────────────┤  ├──────────────┤  │ (static)     │       │
│  │ Tenant       │  │ Audit        │  └──────────────┘       │
│  │ Isolation    │  │ Logging      │                          │
│  │ Middleware   │  │ Middleware   │                          │
│  ├──────────────┤  ├──────────────┤                          │
│  │ JWT Auth     │  │ Throttle     │  ┌──────────────┐       │
│  │ (SimpleJWT)  │  │ (DRF)       │  │ Quota Check  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
┌──────────▼──┐  ┌────────▼────┐  ┌───────▼───────┐
│   SQLite    │  │   Redis     │  │   Qdrant      │
│   (dev DB)  │  │   (cache,   │  │   (vectors)   │
│             │  │    broker)  │  │               │
└─────────────┘  └──────┬──────┘  └───────────────┘
                        │
               ┌────────▼────────┐
               │     Celery      │
               │   (2 queues:    │
               │    default,     │
               │    embedding)   │
               └─────────────────┘
```

---

## 2. Component Deep-Dive

### 2.1 Middleware Stack

**TenantIsolationMiddleware:**

- Attaches `request.tenant` from authenticated user
- Blocks requests if tenant is inactive (403 with structured error)
- Falls through for unauthenticated requests (tenant=None)

**AuditLoggingMiddleware:**

- Intercepts POST/PUT/PATCH/DELETE responses
- Dual auth resolution (session + JWT fallback)
- Background thread DB write
- Extracts resource_type from URL path

**Issues:**

- No RequestID middleware (no request correlation)
- No timing middleware (no request latency capture)
- No response compression middleware
- No security headers middleware (relies on settings only)
- Middleware ordering is hard-coded (no dynamic middleware)
- Audit middleware background thread can silently fail

### 2.2 Throttling (core/throttle.py)

**Current Classes:**

- `TenantQueryThrottle`: Rate-limit queries by tenant_id (200/minute)
- `TenantUploadThrottle`: Rate-limit uploads by tenant_id (50/hour)
- `UserQueryThrottle`: Rate-limit queries by user (30/minute)

**Strengths:**

- Multi-level throttling (tenant + user)
- Redis-backed via DRF's cache-based throttling
- Configurable rates via settings

**Issues:**

- Rates are static (same for all plans — Basic/Pro/Enterprise)
- No dynamic rate adjustment based on subscription plan
- No burst allowance (strict rate, no token bucket)
- No circuit breaker pattern (downstream failures)
- No per-endpoint throttling (all endpoints same rate)
- Upload throttle not wired into global REST_FRAMEWORK defaults
- No IP-based anonymous throttling

### 2.3 Quota Enforcement (core/quota.py)

**Current:** `check_tenant_query_quota(user)` — checks daily query count against `TENANT_DAILY_QUERY_LIMIT`.

**Issues:**

- Reads from UsageMetrics table (which is manually populated!)
- Single global limit (not per-plan differentiation)
- Checks count in DB (no real-time Redis counter)
- No storage quota enforcement
- No token quota enforcement
- No user-level quotas
- No graceful degradation (hard 403, no warning)

### 2.4 Exception Handling (core/exceptions.py)

**Current:** 6 custom exceptions + `custom_exception_handler`.

**Strengths:**

- Semantic exceptions (TenantInactiveError, VectorSearchError, etc.)
- Safe handler never leaks internals
- Catch-all for unhandled exceptions returns generic 500

**Issues:**

- No error tracking integration (Sentry)
- No error categorization for monitoring
- No retry guidance in error responses (Retry-After header)
- No problem+json RFC 7807 format
- No error rate monitoring

### 2.5 Celery Configuration

**Current:**

- Broker: Redis (localhost:6379/1)
- Result backend: Redis (localhost:6379/2)
- 2 queues: `default`, `embedding`
- 30-minute task time limit
- Task route: document processing → embedding queue

**Issues:**

- No priority queue support (CELERY_TASK_QUEUES_MAX_PRIORITY defined but no priority-aware queues configured)
- No dead letter queue
- No task retry configuration (no autoretry_for, max_retries)
- No result expiration (results accumulate in Redis)
- No task monitoring (Flower not configured)
- No Celery beat schedule defined (needed for metric aggregation, health checks)
- No task rate limiting
- Hardcoded localhost broker URL (not env-configurable in docker)

### 2.6 Caching (Redis)

**Current:**

- django_redis as cache backend
- `KEY_PREFIX: kodezera`, 1-hour default TTL
- Used for: DRF throttling, role resolution cache, permission cache

**Issues:**

- No cache invalidation strategy documentation
- No cache warming on startup
- No cache metrics (hit/miss ratio)
- Same Redis instance for cache, broker, and result backend
- No cache namespacing by tenant (potential cross-tenant cache collision)
- No distributed lock mechanism (for concurrent operations)

### 2.7 Settings & Configuration

**Strengths:**

- Environment-configurable via `os.environ.get()` with defaults
- Production-only security hardening (HSTS, SSL redirect, secure cookies)
- Proper CORS configuration
- Custom exception handler wired

**Issues:**

- SQLite as default database (not production-ready)
- `SECRET_KEY` has hardcoded fallback (security risk)
- `DEBUG` defaults to True (dev-mode by default)
- No environment-specific settings files (dev/staging/prod)
- No secrets management (Vault/AWS Secrets Manager)
- `CORS_ALLOWED_ORIGINS` hardcoded to localhost
- No health check endpoint for load balancers
- No graceful shutdown handling
- No feature flag support in settings

### 2.8 Docker / Deployment

**Current:** Dockerfile + docker-compose.yml presence.

**Issues:**

- Single-stage Dockerfile (larger image)
- No multi-process management (gunicorn workers)
- No nginx reverse proxy in compose
- No production docker-compose variant
- No Kubernetes manifests
- No CI/CD pipeline definition
- No blue-green or canary deployment support
- No health check in Dockerfile

---

## 3. SWOT Analysis

### Strengths (8)

1. **Multi-layer tenant isolation** — middleware enforced at every request
2. **3-tier throttling** — tenant + user + upload rate limits
3. **Redis caching** — proper production cache with key prefixing
4. **Celery task queues** — queue separation (default + embedding)
5. **Safe error handling** — custom exceptions + handler never leak internals
6. **JWT authentication** — standard bearer token with rotation + blacklisting
7. **Security hardening** — HSTS, SSL, secure cookies in production
8. **Docker support** — containerized deployment ready

### Weaknesses (16)

1. SQLite development database (not sharable, not production-ready)
2. No request correlation IDs
3. No structured logging (JSON)
4. No error tracking (Sentry)
5. No circuit breaker for downstream services
6. No dynamic throttle rates per subscription plan
7. Quota enforcement reads stale DB data (not real-time)
8. No Celery beat schedule configured
9. No task retry policies
10. No dead letter queue
11. No cache namespacing by tenant
12. No health check endpoint
13. No environment-specific settings
14. Hardcoded SECRET_KEY fallback
15. No secrets management integration
16. No CI/CD pipeline defined

### Opportunities (6)

1. PostgreSQL migration (production-grade)
2. Kubernetes deployment with auto-scaling
3. Distributed tracing (OpenTelemetry)
4. Service mesh for inter-service communication
5. Infrastructure-as-Code (Terraform)
6. GitOps with ArgoCD

### Threats (4)

1. Data loss with SQLite under concurrent writes
2. Redis as single point of failure (no sentinel/cluster)
3. Secret exposure via hardcoded fallback
4. No observable monitoring in production

---

## 4. Gap Analysis — Current vs Enterprise-Grade

| Capability              | Current State           | Enterprise Target                     | Gap    |
| ----------------------- | ----------------------- | ------------------------------------- | ------ |
| Database                | ⚠️ SQLite (dev only)    | ✅ PostgreSQL + read replicas         | Large  |
| Request correlation     | ❌ None                 | ✅ Request ID in all logs + responses | Medium |
| Structured logging      | ❌ Console text         | ✅ JSON + aggregation (ELK/CW)        | Large  |
| Error tracking          | ❌ None                 | ✅ Sentry with user context           | Medium |
| Circuit breaker         | ❌ None                 | ✅ Per-service circuit breakers       | Medium |
| Dynamic throttling      | ❌ Static rates         | ✅ Plan-based dynamic rates           | Medium |
| Real-time quotas        | ❌ DB-read quotas       | ✅ Redis counter quotas               | Medium |
| Task monitoring         | ❌ None                 | ✅ Flower + dead letter queue         | Medium |
| Task retry policies     | ❌ None                 | ✅ Per-task retry with backoff        | Medium |
| Health checks           | ❌ No standard endpoint | ✅ /healthz + /readyz endpoints       | Small  |
| Secrets management      | ❌ Env vars + hardcoded | ✅ Vault / AWS Secrets Manager        | Large  |
| CI/CD                   | ❌ None                 | ✅ GitHub Actions + auto-deploy       | Large  |
| Container orchestration | ⚠️ Basic docker-compose | ✅ Kubernetes + Helm charts           | Large  |
| Distributed tracing     | ❌ None                 | ✅ OpenTelemetry                      | Medium |
| Cache strategy          | ⚠️ Basic with prefix    | ✅ Tenant-namespaced + metrics        | Medium |
| Database migrations     | ✅ Django migrations    | ✅ + zero-downtime migration strategy | Small  |

---

## 5. Advanced System Design

### 5.1 Design Principles

1. **12-Factor App** — strict environment-based configuration, one codebase, many deploys
2. **Observable** — every component emits metrics, logs, and traces
3. **Resilient** — circuit breakers, retries, fallbacks for all external dependencies
4. **Horizontally scalable** — stateless app servers, shared-nothing architecture
5. **Secure by default** — no hardcoded secrets, minimal permissions, encrypted at rest

### 5.2 Request Lifecycle (Redesigned)

```
Client Request
    │
    ▼
[Nginx / ALB]  ← TLS termination, rate limiting, static files
    │
    ▼
[Gunicorn / Uvicorn]  ← Process management, graceful shutdown
    │
    ▼
Middleware Pipeline:
    1. RequestIDMiddleware         → Generate/propagate X-Request-ID
    2. TimingMiddleware            → Start timer
    3. SecurityMiddleware          → HSTS, X-Frame, CSP headers
    4. CORSMiddleware              → Cross-origin handling
    5. TenantIsolationMiddleware   → Attach tenant, block inactive
    6. RateLimitMiddleware         → Plan-aware throttling
    7. QuotaCheckMiddleware        → Real-time quota from Redis
    │
    ▼
View / Serializer
    │
    ▼
Middleware Pipeline (response):
    7. QuotaHeaderMiddleware       → X-Quota-Remaining headers
    6. RateLimitHeaderMiddleware   → X-RateLimit-* headers
    5. AuditMiddleware             → Async event to Celery
    2. TimingMiddleware            → X-Response-Time header
    1. RequestIDMiddleware         → X-Request-ID in response
    │
    ▼
Response to Client
```

### 5.3 Circuit Breaker Pattern

```python
# For each external dependency:

class CircuitBreaker:
    """
    States: CLOSED → OPEN → HALF_OPEN → CLOSED

    CLOSED:    requests pass through normally
    OPEN:      requests fail fast (after failure_threshold breaches)
    HALF_OPEN: allow 1 request through after cool_down; if success → CLOSED, else → OPEN
    """

Dependencies with circuit breakers:
    ├── Qdrant (vector search)     — failure_threshold: 5, cool_down: 30s
    ├── LLM Provider (OpenAI/etc.) — failure_threshold: 3, cool_down: 60s
    ├── Redis (cache)              — failure_threshold: 10, cool_down: 10s
    └── Email Service              — failure_threshold: 3, cool_down: 120s

Fallback behaviors:
    ├── Qdrant down    → return "Search temporarily unavailable" (503)
    ├── LLM down       → return cached response if available, else 503
    ├── Redis down     → bypass cache, query DB directly (degraded mode)
    └── Email down     → queue for retry in dead letter queue
```

### 5.4 Dynamic Throttling

```
Plan-based rate limits:
    ┌──────────┬─────────────┬────────────────┬────────────────┐
    │ Scope    │ Basic       │ Pro            │ Enterprise     │
    ├──────────┼─────────────┼────────────────┼────────────────┤
    │ Queries  │ 30/min      │ 100/min        │ 500/min        │
    │ Uploads  │ 10/hour     │ 50/hour        │ 200/hour       │
    │ API calls│ 100/min     │ 500/min        │ 2000/min       │
    └──────────┴─────────────┴────────────────┴────────────────┘

Implementation:
    class PlanAwareThrottle(UserRateThrottle):
        def get_rate(self):
            user = self.request.user
            plan = user.tenant.subscription.plan
            return PLAN_RATES[plan.tier][self.scope]
```

### 5.5 Configuration Management

```
Configuration hierarchy (highest priority wins):
    1. Environment variables (runtime override)
    2. Secrets manager (Vault / AWS SSM)
    3. config/settings/{env}.py (environment-specific)
    4. config/settings/base.py (defaults)

Files:
    config/
      settings/
        __init__.py           # Detects DJANGO_ENV, imports correct module
        base.py               # Shared defaults (all environments)
        development.py        # DEBUG=True, SQLite, verbose logging, CORS open
        staging.py            # PostgreSQL, Redis cluster, reduced logging
        production.py         # PostgreSQL, Redis sentinel, Sentry, strict CORS
        testing.py            # In-memory DB, mocked externals, fast settings
```

### 5.6 Database Strategy

```
Current: SQLite (development only)

Target:
    Development:   PostgreSQL (Docker, matches production)
    Staging:       PostgreSQL (managed, shared instance)
    Production:    PostgreSQL (managed, read replicas)

    ┌──────────────┐     ┌──────────────┐
    │   Primary    │────→│  Read Replica │
    │  (writes)    │     │   (reads)     │
    └──────┬───────┘     └──────────────┘
           │
           ▼
    ┌──────────────┐
    │  Backup      │
    │  (daily, S3) │
    └──────────────┘

Django database router:
    - Write operations → primary
    - Read operations → replica (with staleness tolerance)
    - Audit reads → replica (archive queries)
    - Analytics → replica (heavy queries)
```

---

## 6. Architecture Design

### 6.1 Module Structure

```
config/
  settings/
    __init__.py
    base.py                       # Shared configuration
    development.py                # Dev overrides
    staging.py                    # Staging overrides
    production.py                 # Production overrides
    testing.py                    # Test overrides
  celery.py                       # Enhanced Celery config + beat schedule
  urls.py
  asgi.py                         # Channels-aware ASGI
  wsgi.py

apps/
  core/
    middleware/
      __init__.py
      tenant.py                   # TenantIsolationMiddleware (refined)
      audit.py                    # AuditMiddleware (Celery-based)
      correlation.py              # RequestIDMiddleware
      timing.py                   # TimingMiddleware
      rate_limit.py               # PlanAwareRateLimitMiddleware
      quota.py                    # QuotaCheckMiddleware
    services/
      __init__.py
      cache_service.py            # Tenant-namespaced cache operations
      circuit_breaker.py          # CircuitBreaker implementation
      health_service.py           # Health check service
    exceptions/
      __init__.py
      handlers.py                 # Enhanced exception handler (RFC 7807)
      custom.py                   # Custom exception classes

infra/                            # NEW top-level infrastructure directory
  docker/
    Dockerfile                    # Multi-stage build
    docker-compose.yml            # Development compose
    docker-compose.prod.yml       # Production compose
    nginx.conf                    # Reverse proxy config
  k8s/
    deployment.yaml               # Kubernetes deployment
    service.yaml                  # Kubernetes service
    ingress.yaml                  # Ingress controller
    hpa.yaml                      # Horizontal pod autoscaler
    configmap.yaml                # Non-secret config
    sealed-secret.yaml            # Encrypted secrets
  ci/
    .github/workflows/
      ci.yml                      # Test + lint
      cd-staging.yml              # Deploy to staging
      cd-production.yml           # Deploy to production
```

### 6.2 Dependency Graph

```
Infrastructure layer (provides to ALL modules):
    ├── Middleware → every request/response
    ├── Caching (Redis) → all services
    ├── Celery → documents, RAG, notifications, analytics, audit
    ├── Exception handling → all views/services
    ├── Throttling/quota → all API endpoints
    └── Configuration → entire application
```

---

## 7. Data Model Design

Infrastructure modules typically don't have many models, but some supporting structures are needed:

```python
# ── CircuitBreakerState ────────────────────────────────
# Stored in Redis, not DB — transient state
# Key: circuit:{service_name}
# Value: {"state": "closed", "failure_count": 0, "last_failure": null, "opened_at": null}

# ── ScheduledTask (Celery beat DB scheduler) ──────────
# Using django-celery-beat for DB-backed schedules
# Models: PeriodicTask, IntervalSchedule, CrontabSchedule
# (provided by django-celery-beat package)

# ── CacheMetrics (optional, for observability) ────────
# Stored in Redis sorted sets
# Key: cache_metrics:{date}
# Score: timestamp, Value: {operation: "hit|miss", key_prefix: "..."}
```

No new Django models needed — infrastructure state lives in Redis and external systems.

---

## 8. API Design

### 8.1 Health & Status Endpoints

| Endpoint       | Method | Auth | Purpose                                        |
| -------------- | ------ | ---- | ---------------------------------------------- |
| `/healthz`     | GET    | None | Liveness probe (returns 200 if process alive)  |
| `/readyz`      | GET    | None | Readiness probe (checks DB + Redis + Qdrant)   |
| `/api/status/` | GET    | Auth | Detailed system status for authenticated users |

### 8.2 Response Headers (added by middleware)

| Header                  | Value                   | Purpose               |
| ----------------------- | ----------------------- | --------------------- |
| `X-Request-ID`          | UUID                    | Request correlation   |
| `X-Response-Time`       | milliseconds            | Request latency       |
| `X-RateLimit-Limit`     | max requests per period | Rate limit info       |
| `X-RateLimit-Remaining` | remaining requests      | Rate limit info       |
| `X-RateLimit-Reset`     | UTC timestamp           | Rate limit reset time |
| `X-Quota-Remaining`     | remaining daily queries | Quota info            |

### 8.3 Error Response Format (RFC 7807)

```json
{
  "type": "https://kodezera.io/errors/quota-exceeded",
  "title": "Daily Query Quota Exceeded",
  "status": 429,
  "detail": "Your organization has used 500/500 daily queries. Quota resets at midnight UTC.",
  "instance": "/api/rag/query/",
  "request_id": "abc-123-def",
  "extensions": {
    "quota_limit": 500,
    "quota_used": 500,
    "reset_at": "2026-03-11T00:00:00Z"
  }
}
```

---

## 9. Security Design

### 9.1 Infrastructure Security Measures

| Layer                   | Measure                                                    |
| ----------------------- | ---------------------------------------------------------- |
| **Secrets**             | Environment variables only, no hardcoded fallbacks         |
| **TLS**                 | End-to-end encryption, TLS 1.2+, strong ciphers            |
| **CORS**                | Strict origin allowlist, credentials=True                  |
| **CSP**                 | Content-Security-Policy header                             |
| **Rate limiting**       | Multi-tier: gateway + application + per-tenant             |
| **Dependency scanning** | `pip-audit` / Dependabot for CVE detection                 |
| **Container security**  | Non-root user, minimal base image, no unnecessary packages |
| **Network**             | Private VPC, security groups, no public DB access          |
| **Backup encryption**   | AES-256 encrypted database backups                         |
| **Audit**               | All infrastructure changes logged                          |

### 9.2 Security Headers

```python
# Middleware-applied headers:
SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '0',             # Modern browsers don't need this
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
}
```

---

## 10. Scalability & Reliability Design

### 10.1 Performance Targets

| Metric                    | Target        | Current      |
| ------------------------- | ------------- | ------------ |
| API response time (p50)   | < 100ms       | ~150ms       |
| API response time (p95)   | < 500ms       | ~400ms       |
| API response time (p99)   | < 2000ms      | unknown      |
| Concurrent requests       | 1000+         | ~50 (SQLite) |
| Uptime                    | 99.9%         | N/A          |
| Database query time (p95) | < 50ms        | varies       |
| Cache hit ratio           | > 90%         | unknown      |
| Celery task throughput    | 100 tasks/min | ~10          |

### 10.2 Horizontal Scaling Architecture

```
                         ┌──────────────────┐
                         │  Load Balancer   │
                         │  (ALB / Nginx)   │
                         └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────▼────┐ ┌─────▼────┐ ┌─────▼────┐
              │ Gunicorn │ │ Gunicorn │ │ Gunicorn │
              │ Worker 1 │ │ Worker 2 │ │ Worker 3 │
              │ (4 procs)│ │ (4 procs)│ │ (4 procs)│
              └─────┬────┘ └─────┬────┘ └─────┬────┘
                    │             │             │
                    └─────────────┼─────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
        ┌─────▼─────┐     ┌──────▼──────┐     ┌──────▼──────┐
        │ PostgreSQL │     │  Redis      │     │   Qdrant    │
        │ Primary    │     │  Sentinel   │     │  (clustered)│
        │ + Replica  │     │  (3 nodes)  │     │             │
        └────────────┘     └─────────────┘     └─────────────┘

        ┌─────────────────────────────────────────────────┐
        │              Celery Workers                      │
        │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
        │  │ default  │  │ embedding│  │   beat   │      │
        │  │ queue    │  │ queue    │  │ scheduler│      │
        │  │ (3 procs)│  │ (2 procs)│  │ (1 proc) │      │
        │  └──────────┘  └──────────┘  └──────────┘      │
        └─────────────────────────────────────────────────┘
```

### 10.3 Celery Beat Schedule (Proposed)

```python
CELERY_BEAT_SCHEDULE = {
    # Metric aggregation
    'flush-minute-metrics': {
        'task': 'apps.analytics.tasks.flush_minute_metrics',
        'schedule': 300.0,  # every 5 minutes
    },
    'aggregate-hourly-metrics': {
        'task': 'apps.analytics.tasks.aggregate_hourly',
        'schedule': crontab(minute=5),  # every hour at :05
    },
    'aggregate-daily-metrics': {
        'task': 'apps.analytics.tasks.aggregate_daily',
        'schedule': crontab(hour=0, minute=15),  # daily at 00:15
    },
    'aggregate-monthly-metrics': {
        'task': 'apps.analytics.tasks.aggregate_monthly',
        'schedule': crontab(day_of_month=1, hour=1, minute=0),  # 1st of month
    },

    # Health monitoring
    'health-check': {
        'task': 'apps.platform.tasks.health_check',
        'schedule': 60.0,  # every minute
    },

    # Maintenance
    'cleanup-expired-notifications': {
        'task': 'apps.notifications.tasks.cleanup_expired',
        'schedule': crontab(hour=3, minute=0),  # daily at 3 AM
    },
    'cleanup-old-metrics': {
        'task': 'apps.analytics.tasks.cleanup_old_metrics',
        'schedule': crontab(hour=3, minute=30),  # daily at 3:30 AM
    },
    'verify-audit-chain': {
        'task': 'apps.audit.tasks.verify_hash_chain',
        'schedule': crontab(hour=4, minute=0),  # daily at 4 AM
    },
    'archive-old-audits': {
        'task': 'apps.audit.tasks.archive_old_events',
        'schedule': crontab(hour=4, minute=30),  # daily at 4:30 AM
    },

    # Notifications
    'process-hourly-digests': {
        'task': 'apps.notifications.tasks.process_hourly_digests',
        'schedule': crontab(minute=0),  # every hour
    },
    'process-daily-digests': {
        'task': 'apps.notifications.tasks.process_daily_digests',
        'schedule': crontab(hour=9, minute=0),  # daily at 9 AM
    },

    # Alert evaluation
    'evaluate-metric-alerts': {
        'task': 'apps.analytics.tasks.evaluate_alert_rules',
        'schedule': crontab(minute='*/15'),  # every 15 minutes
    },
}
```

### 10.4 Redis Architecture

```
Current: Single Redis instance (3 DBs: cache/broker/results)

Target: Redis Sentinel cluster (production)
    ├── DB 0: Application cache (tenant-namespaced)
    │         Key format: kodezera:{tenant_id}:{scope}:{key}
    │
    ├── DB 1: Celery broker
    │         Queues: default, embedding, notifications, analytics
    │
    ├── DB 2: Celery results (with TTL: 1 hour)
    │
    ├── DB 3: Metric counters (INCR/INCRBY)
    │         Key format: metric:{tenant_id}:{...}:{timestamp}
    │
    ├── DB 4: Rate limit counters
    │         Key format: throttle:{scope}:{tenant_or_user_id}
    │
    └── DB 5: Circuit breaker states + distributed locks
              Key format: circuit:{service} / lock:{resource}
```

---

## 11. Frontend Design

### 11.1 Development Infrastructure

```
Current:
    ├── React 19 + TypeScript + Vite
    ├── Tailwind CSS + PostCSS
    ├── ESLint
    └── No test framework configured

Target additions:
    ├── Vitest (unit tests)
    ├── Playwright (E2E tests)
    ├── Storybook (component library)
    ├── Husky + lint-staged (pre-commit hooks)
    ├── Bundle analyzer (vite-plugin-visualizer)
    └── Error boundary (React Error Boundary + Sentry)
```

### 11.2 Frontend Infrastructure Components

| Component             | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| `ErrorBoundary`       | Global error handling + Sentry reporting        |
| `LoadingProvider`     | Global loading state management                 |
| `WebSocketProvider`   | WebSocket connection management (notifications) |
| `TenantThemeProvider` | Dynamic theming based on tenant config          |
| `FeatureFlagProvider` | Client-side feature flag checking               |
| `OfflineIndicator`    | Network status detection + offline mode         |

---

## 12. Migration Strategy

### Phase 1: Database & Configuration

- Switch from SQLite to PostgreSQL (Docker)
- Split settings into base/development/staging/production
- Remove hardcoded SECRET_KEY fallback
- Add environment variable validation on startup
- Add /healthz and /readyz endpoints

### Phase 2: Observability

- Add RequestIDMiddleware (X-Request-ID)
- Add TimingMiddleware (X-Response-Time)
- Switch to structured JSON logging (structlog)
- Add Sentry SDK integration
- Add cache hit/miss metrics

### Phase 3: Resilience

- Implement CircuitBreaker for external services
- Add Celery task retry policies
- Configure dead letter queue
- Add Celery Flower monitoring
- Define Celery beat schedule

### Phase 4: Enhanced Throttling & Quotas

- Implement PlanAwareThrottle
- Move quota enforcement to Redis counters
- Add response headers (X-RateLimit-_, X-Quota-_)
- Implement RFC 7807 error format

### Phase 5: Deployment Pipeline

- Create multi-stage Dockerfile
- Create production docker-compose
- Add nginx reverse proxy
- Create CI/CD pipeline (GitHub Actions)
- Create Kubernetes manifests
- Configure auto-scaling (HPA)

---

## 13. Implementation Roadmap

| #   | Task                                       | Phase | Depends On | Priority |
| --- | ------------------------------------------ | ----- | ---------- | -------- |
| 1   | PostgreSQL migration                       | 1     | —          | Critical |
| 2   | Split settings (base/dev/staging/prod)     | 1     | —          | Critical |
| 3   | Remove hardcoded SECRET_KEY                | 1     | 2          | Critical |
| 4   | Env var validation on startup              | 1     | 2          | High     |
| 5   | Add /healthz + /readyz endpoints           | 1     | —          | High     |
| 6   | RequestIDMiddleware                        | 2     | —          | High     |
| 7   | TimingMiddleware                           | 2     | —          | High     |
| 8   | Structured JSON logging (structlog)        | 2     | 6          | High     |
| 9   | Sentry SDK integration                     | 2     | —          | High     |
| 10  | Cache hit/miss metrics                     | 2     | —          | Medium   |
| 11  | CircuitBreaker implementation              | 3     | —          | High     |
| 12  | Wire circuit breakers (Qdrant, LLM, Redis) | 3     | 11         | High     |
| 13  | Celery task retry policies                 | 3     | —          | High     |
| 14  | Dead letter queue                          | 3     | —          | Medium   |
| 15  | Celery Flower setup                        | 3     | —          | Medium   |
| 16  | Celery beat schedule                       | 3     | —          | High     |
| 17  | PlanAwareThrottle                          | 4     | —          | Medium   |
| 18  | Redis-based quota enforcement              | 4     | —          | Medium   |
| 19  | Response rate limit headers                | 4     | 17         | Medium   |
| 20  | RFC 7807 error format                      | 4     | —          | Medium   |
| 21  | Multi-stage Dockerfile                     | 5     | —          | High     |
| 22  | Production docker-compose                  | 5     | 21         | High     |
| 23  | Nginx reverse proxy                        | 5     | 22         | High     |
| 24  | GitHub Actions CI (test + lint)            | 5     | —          | High     |
| 25  | GitHub Actions CD (staging deploy)         | 5     | 24         | Medium   |
| 26  | Kubernetes manifests + Helm                | 5     | 21         | Medium   |
| 27  | HPA auto-scaling                           | 5     | 26         | Low      |

---

> **Status:** Analysis complete. Implementation ON HOLD until design review and approval.
