# Chapter 8: Deployment & Infrastructure

---

## 8.1 Containerisation Strategy

### 8.1.1 Multi-Stage Docker Build

The application uses a three-stage Docker build to minimise production image size and separate concerns:

```
┌──────────────────────────────────────────────────────────────┐
│  STAGE 1: frontend-builder (node:20-alpine)                  │
│  ─────────────────────────────────────────                   │
│  • npm ci --prefer-offline                                   │
│  • npm run build → /frontend/dist/                           │
│  • Output: Static HTML/JS/CSS bundle                         │
├──────────────────────────────────────────────────────────────┤
│  STAGE 2: python-deps (python:3.11-slim)                     │
│  ─────────────────────────────────────────                   │
│  • Install build deps (gcc, libpq-dev, libmagic1)            │
│  • pip install -r requirements.txt                           │
│  • Output: Compiled Python packages in site-packages         │
├──────────────────────────────────────────────────────────────┤
│  STAGE 3: production (python:3.11-slim)                      │
│  ─────────────────────────────────────────                   │
│  • Install runtime-only deps (libpq5, libmagic1, curl)       │
│  • Create non-root user (appuser:1001)                       │
│  • COPY site-packages from Stage 2                           │
│  • COPY frontend/dist from Stage 1                           │
│  • COPY application code                                     │
│  • HEALTHCHECK on /api/health/                               │
│  • ENTRYPOINT: entrypoint.sh → migrate → collectstatic       │
│  • CMD: gunicorn config.wsgi:application                     │
└──────────────────────────────────────────────────────────────┘
```

**Security**: The production image runs as non-root user `appuser` (UID 1001) to prevent container escape attacks.

### 8.1.2 Entrypoint Script

```bash
#!/bin/sh
set -e
echo "=== Kodezera Intelligence Suite ==="
echo "Running database migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput --clear

echo "Starting server..."
exec "$@"
```

**Design Decision**: Migrations run at startup (not build time) because the database container must be healthy first (enforced via `depends_on` with health checks). This guarantees schema consistency without requiring image rebuilds for schema changes.

---

## 8.2 Docker Compose — Production Architecture

The production `docker-compose.prod.yml` defines **7 services**:

```
┌──────────────────────────────────────────────────────────────────┐
│                    PRODUCTION STACK                               │
├──────────────┬───────────────────────────────────────────────────┤
│  nginx       │  Reverse proxy, TLS termination, static files     │
│              │  Port 80 → backend:8000                           │
├──────────────┼───────────────────────────────────────────────────┤
│  backend     │  Gunicorn (Django), port 8000                     │
│              │  Connected via PgBouncer, not directly to PG      │
├──────────────┼───────────────────────────────────────────────────┤
│  celery_     │  Celery worker (--queues=default, concurrency=4)  │
│  default     │  Handles: API tasks, chat queries, notifications  │
├──────────────┼───────────────────────────────────────────────────┤
│  celery_     │  Celery worker (--queues=embedding, concurrency=2)│
│  embedding   │  Handles: Document processing, vector embedding   │
├──────────────┼───────────────────────────────────────────────────┤
│  db          │  PostgreSQL 15 (Alpine), port 5432                │
│              │  Health: pg_isready every 10s                     │
├──────────────┼───────────────────────────────────────────────────┤
│  pgbouncer   │  Connection pooler (transaction mode)             │
│              │  MAX_CLIENT_CONN=200, DEFAULT_POOL_SIZE=20        │
├──────────────┼───────────────────────────────────────────────────┤
│  redis       │  Redis 7 (Alpine), maxmemory=256MB, LRU eviction  │
│              │  Health: redis-cli ping every 10s                 │
├──────────────┼───────────────────────────────────────────────────┤
│  qdrant      │  Qdrant v1.7.4, port 6333                        │
│              │  Health: curl /health every 10s                   │
└──────────────┴───────────────────────────────────────────────────┘
```

**Named Volumes**: `postgres_data`, `redis_data`, `qdrant_data`, `media_data`, `static_data`, `logs_data` — all persistent across container restarts.

**Celery Queue Isolation**: CPU-heavy embedding tasks are routed to a dedicated `embedding` queue with `concurrency=2` (to avoid overwhelming CPU). Real-time API tasks use the `default` queue with `concurrency=4`.

---

## 8.3 Gunicorn Configuration

```python
# Key production settings
bind = "0.0.0.0:8000"
workers = (2 × CPU_CORES) + 1    # Formula for I/O-bound Django
threads = 2                       # Per-worker threads for I/O concurrency
worker_class = "sync"             # Safest for Django + ORM
timeout = 120                     # Generous for RAG queries (embedding + LLM)
graceful_timeout = 30
keepalive = 5

# Security limits
limit_request_line = 4096
limit_request_fields = 100
limit_request_field_size = 8190

# Worker recycling (memory leak protection)
max_requests = 1000
max_requests_jitter = 50          # Random spread avoids thundering herd
```

---

## 8.4 Kubernetes Deployment

### 8.4.1 Pod Architecture

The Kubernetes manifests define **4 Deployments**:

| Deployment | Replicas | CPU Request | CPU Limit | Memory Limit | Purpose |
|-----------|:--------:|:-----------:|:---------:|:------------:|---------|
| `kodezera-backend` | 2 | 250m | 1000m | 1536Mi | Django API (Gunicorn) |
| `kodezera-celery-default` | 1 | 200m | 1000m | 1024Mi | Default task queue |
| `kodezera-celery-embedding` | 1 | 300m | 2000m | 2048Mi | Document processing |
| `kodezera-celery-beat` | 1 | — | — | — | Periodic task scheduler |

### 8.4.2 Health Probes

```yaml
readinessProbe:
  httpGet:
    path: /readyz
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 6

livenessProbe:
  httpGet:
    path: /healthz
    port: 8000
  initialDelaySeconds: 20
  periodSeconds: 15
  failureThreshold: 4
```

**Readiness vs Liveness**: The readiness probe gates traffic routing (pod must be able to serve requests), while the liveness probe detects stuck processes. Different thresholds ensure that slow-starting pods aren't killed prematurely.

### 8.4.3 Horizontal Pod Autoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef:
    kind: Deployment
    name: kodezera-backend
  minReplicas: 2
  maxReplicas: 8
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

**Scaling Policy**: The backend auto-scales between 2–8 replicas based on 70% average CPU utilisation. This handles traffic spikes (e.g., bulk RAG queries) without manual intervention.

### 8.4.4 Ingress Configuration

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/proxy-read-timeout: "120"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "120"
    nginx.ingress.kubernetes.io/proxy-body-size: "60m"
spec:
  rules:
    - host: kodezera.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: kodezera-backend
                port:
                  number: 80
```

**Timeout**: 120s read/send timeouts accommodate long-running RAG queries with LLM generation.
**Body Size**: 60MB limit supports document uploads up to the configured `MAX_UPLOAD_SIZE`.

---

## 8.5 Rate Limiting & Throttling Architecture

### 8.5.1 Multi-Layer Throttling

```
Layer 1: Nginx (connection-level)
  └── limit_conn_zone per IP

Layer 2: DRF Throttles (request-level)
  ├── TenantQueryThrottle     (all users share tenant bucket)
  │   Basic: 200/min → Pro: 400/min → Enterprise: 800/min
  ├── UserQueryThrottle       (per-user fine-grained limit)
  │   Basic: 30/min → Pro: 60/min → Enterprise: 120/min
  └── TenantUploadThrottle    (document upload limit)
      Basic: 50/hr → Pro: 100/hr → Enterprise: 200/hr

Layer 3: Quota Middleware (daily budget)
  └── QuotaEnforcementMiddleware → TENANT_DAILY_QUERY_LIMIT=500
```

### 8.5.2 Plan-Aware Throttle Resolution

```python
class PlanAwareUserRateThrottle(UserRateThrottle):
    def allow_request(self, request, view):
        # Dynamically resolve rate based on tenant's subscription plan
        plan_type = self._resolve_plan_type(request)  # basic|pro|enterprise
        self.rate = PLAN_THROTTLE_RATES[self.scope][plan_type]
        return super().allow_request(request, view)
```

### 8.5.3 Response Headers

Every API response includes rate-limit headers:
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Seconds until window resets
- `X-Quota-Limit`: Tenant daily quota
- `X-Quota-Used`: Queries consumed today
- `X-Quota-Remaining`: Queries remaining today

---

## 8.6 Audit Hash Chain (Tamper Detection)

### 8.6.1 Architecture

Each audit event stores a SHA-256 hash of its contents appended with the previous event's hash, forming an immutable blockchain-like chain:

```
Event 1:                        Event 2:                        Event 3:
┌─────────────────┐            ┌─────────────────┐            ┌─────────────────┐
│ previous_hash:  │            │ previous_hash:  │            │ previous_hash:  │
│  0000...0000    │────────────│  hash(Event 1)  │────────────│  hash(Event 2)  │
│ event_hash:     │            │ event_hash:     │            │ event_hash:     │
│  SHA256(payload)│            │  SHA256(payload)│            │  SHA256(payload)│
└─────────────────┘            └─────────────────┘            └─────────────────┘
    (Genesis)                      Chain Link                     Chain Link
```

### 8.6.2 Hash Computation Algorithm

```python
def compute_hash(action, user_id, tenant_id, resource_type,
                 resource_id, timestamp_str, changes):
    # Get last event's hash (genesis = 64 zeros)
    last_hash = AuditEvent.objects.order_by('-timestamp')
                .values_list('event_hash', flat=True).first()
    previous_hash = last_hash or '0' * 64

    # Canonical JSON payload (sorted keys for determinism)
    payload = json.dumps({
        'previous_hash': previous_hash,
        'action': action,
        'user_id': user_id,
        'tenant_id': tenant_id,
        'resource_type': resource_type,
        'resource_id': resource_id,
        'timestamp': timestamp_str,
        'changes': changes,
    }, sort_keys=True, default=str)

    event_hash = hashlib.sha256(payload.encode()).hexdigest()
    return previous_hash, event_hash
```

### 8.6.3 Chain Verification

The `/api/platform/audit/events/verify/` endpoint traverses the chain and recomputes hashes:

- **Result**: `{valid: true, checked: N, first_break_id: null}` if the chain is intact
- **On tampering**: `{valid: false, checked: N, first_break_id: "uuid"}` — identifies the exact event where the chain breaks

---

## 8.7 Notification System Architecture

### 8.7.1 Two-Phase Architecture

```
Phase 1: Fan-Out (Write Path)
  NotificationService.send(template_key, context, targets)
    → Resolve template → Render title/message
    → Resolve targets (user/department/role/tenant → user_ids)
    → Bulk create UserNotification records (materialised inbox)
    → Create DeliveryRecord per channel per user
    → Increment Redis unread count

Phase 2: Delivery (Async)
  DispatcherService processes pending DeliveryRecords:
    in_app   → Delivered immediately during fan-out
    email    → SMTP via Django email backend
    push     → Browser push notification (Web Push API)
    webhook  → HTTP POST to configured URL
```

### 8.7.2 Materialised Inbox Pattern

Rather than computing notification visibility at query time (expensive 4-way OR JOIN), the system pre-computes per-user notification records:

```
Source Notification (1 record)
    └── fan_out → UserNotification (N records, one per recipient)
                    ├── is_read: bool
                    ├── is_dismissed: bool
                    ├── priority: enum
                    ├── expires_at: timestamp
                    └── DeliveryRecord(s) per channel
```

**Performance**: Inbox queries are a simple `WHERE user_id = ? AND is_dismissed = false` filter — O(1) index lookup. The legacy 4-way OR query is maintained for backward compatibility only.

### 8.7.3 Preference-Aware Delivery

```python
for channel in channels:
    user_prefs = get_user_channel_prefs(user_id, category)
    if channel == 'in_app':
        # Always delivered
        DeliveryRecord(status='delivered')
    elif user_prefs.get(channel) or category in MANDATORY_CATEGORIES:
        # Respect user preferences; security is mandatory
        DeliveryRecord(status='pending')
```

**Mandatory Categories**: Notifications in the `security` category (login alerts, permission changes, account lockout) cannot be disabled by users.

---

## 8.8 Logging & Observability

### 8.8.1 Structured Logging

The application supports two log formats configurable via `LOG_FORMAT`:

**Text format** (development):
```
[INFO] 2026-04-01T12:00:00Z apps.rag.services.rag_pipeline rag_pipeline:42 — Query executed in 1234ms
```

**JSON format** (production):
```json
{
  "level": "INFO",
  "logger": "apps.rag.services.rag_pipeline",
  "message": "Query executed in 1234ms",
  "module": "rag_pipeline",
  "line": 42,
  "time": "2026-04-01T12:00:00.000Z"
}
```

### 8.8.2 Error Tracking (Sentry)

Optional Sentry integration captures unhandled exceptions with Django context:

```python
sentry_sdk.init(
    dsn=SENTRY_DSN,
    integrations=[DjangoIntegration()],
    traces_sample_rate=0.0,    # Configurable via SENTRY_TRACES_SAMPLE_RATE
    send_default_pii=False,    # No PII in error reports
    environment="production",
)
```

### 8.8.3 Observability Headers

Every HTTP response includes:
- `X-Request-ID`: Correlation UUID for distributed tracing
- `X-Response-Time`: Server-side processing duration in milliseconds

---
