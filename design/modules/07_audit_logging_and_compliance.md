# Audit, Logging & Compliance — Complete Analysis & System Design

**Date:** 10 March 2026
**Scope:** Full analysis of audit trails, logging infrastructure, compliance controls, and data governance
**Principle:** Analyse current → Identify gaps → Design enterprise-grade audit & compliance platform

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

Audit and logging spans **8+ files** across backend, middleware, and frontend:

| Layer              | Files                                           | Purpose                                     |
| ------------------ | ----------------------------------------------- | ------------------------------------------- |
| **Models**         | `core/models.py` (AuditLog, SystemAuditLog)     | Tenant-level + platform-level audit storage |
| **Middleware**     | `core/middleware.py` (AuditLoggingMiddleware)   | Automatic capture of all write operations   |
| **Views**          | `api/views/admin.py` (AuditLogViewSet)          | Tenant admin audit log query                |
| **Platform Views** | `api/views/platform_owner.py` (audit_logs_list) | Platform owner system audit log query       |
| **Exceptions**     | `core/exceptions.py` (custom_exception_handler) | Structured error responses + error logging  |
| **Settings**       | `config/settings.py` (LOGGING config)           | Console logger with verbose formatter       |
| **Frontend Page**  | `pages/admin/AuditLogs.tsx`                     | Audit log viewer with filters               |
| **Frontend Page**  | `pages/platform/PlatformAuditLogs.tsx`          | Platform audit log viewer                   |

### 1.2 Current Audit Architecture

```
Request Flow → AuditLoggingMiddleware → AuditLog DB write (background thread)
                                              │
                                              ▼
Two parallel audit trails:
    ┌─────────────────────────┐    ┌──────────────────────────────┐
    │  AuditLog (per-tenant)  │    │  SystemAuditLog (platform)   │
    │  11 action types        │    │  11 action types              │
    │  tenant-scoped          │    │  cross-tenant                 │
    │  auto-captured (middleware)│  │  manually created in views    │
    │  viewed by tenant admin │    │  viewed by platform owner     │
    └─────────────────────────┘    └──────────────────────────────┘
```

---

## 2. Component Deep-Dive

### 2.1 AuditLog Model

**Current Fields:**

- `id` (UUID), `tenant` (FK, nullable), `user` (FK, nullable)
- `action` — 11 types: create, update, delete, read, login, logout, upload, download, query, grant_access, revoke_access
- `resource_type` — extracted from URL path (e.g., "departments", "documents")
- `resource_id` (UUID, optional), `metadata` (JSONField)
- `ip_address`, `user_agent`, `created_at`

**Indexes:** tenant+created_at, user+created_at, resource_type+resource_id, action

**Strengths:**

- Comprehensive action coverage (11 types)
- IP address and user agent captured
- Metadata JSONField for extensible context
- Proper indexing for common query patterns
- Background thread DB write (non-blocking to request)

**Issues:**

- `resource_type` extracted by URL parsing — unreliable (returns first path segment after `api/v1/`)
- `resource_id` rarely populated — middleware doesn't extract it from request body or URL params
- No structured changes payload (no before/after field-level diff)
- No audit log for read operations (only writes captured by middleware)
- Background thread with bare `except: pass` — silently drops audit failures
- No audit log retention policy (grows unbounded)
- No audit log export capability
- Logs stored in same DB as application data (no separation)
- No tamper detection (no hash chain or digital signatures)
- No compliance-specific metadata (regulation, data classification)

### 2.2 SystemAuditLog Model

**Current Fields:**

- `action` — 11 platform action types (tenant CRUD, plan changes, config updates, emergency access)
- `performed_by` (FK User), `tenant_affected` (FK Tenant, nullable)
- `details` (JSONField), `ip_address`, `user_agent`, `timestamp`

**Strengths:**

- Captures platform owner actions specifically
- Links actions to affected tenant
- Separate from tenant audit logs (proper isolation)

**Issues:**

- Manually created in view code (easy to miss new endpoints)
- No consistency enforcement (some platform actions not logged)
- Same DB as application data
- No export or archival

### 2.3 AuditLoggingMiddleware

**Current Logic:**

1. Intercepts response for write methods (POST, PUT, PATCH, DELETE)
2. Skips `/admin/`, `/static/`, `/media/` paths
3. Skips 4xx/5xx responses (only logs successful operations)
4. Resolves user via session auth first, then falls back to JWT authentication
5. Extracts action from HTTP method, resource_type from URL path
6. Writes AuditLog in a daemon background thread

**Strengths:**

- Dual auth resolution (session + JWT fallback)
- Non-blocking (background thread)
- Clean separation from business logic

**Issues:**

- No request body logging (no "what changed")
- No response body logging (no "what was the result")
- URL-based resource extraction is fragile
- Background thread loses context on crash
- No retry on write failure
- Skips failed operations — missed security events (e.g., 403 = unauthorized access attempt)

### 2.4 Application Logging (LOGGING config)

**Current:**

- Console-only handler with verbose format
- Root: DEBUG in dev, INFO in prod
- Django: WARNING in prod, INFO in dev
- Django.request: ERROR
- App loggers (`apps.*`): configurable via env
- Celery: same level as app loggers

**Issues:**

- Console-only — no persistent log storage
- No structured logging (JSON format)
- No log correlation (request_id tracing)
- No log aggregation (ELK/Datadog/CloudWatch)
- No PII scrubbing in logs
- No separate security log channel

### 2.5 Exception Handling

**Current:** `custom_exception_handler` in `core/exceptions.py`

- Maps 6 custom exceptions to safe HTTP responses
- Generic 500 for unhandled exceptions (no internals leaked)
- Logs unhandled exceptions

**Strengths:**

- No internal error details leaked to client
- Custom exceptions provide semantic meaning

**Issues:**

- No error tracking service (Sentry)
- No error rate monitoring
- No error correlation with request context

---

## 3. SWOT Analysis

### Strengths (8)

1. **Dual audit trail** — tenant-level (AuditLog) + platform-level (SystemAuditLog)
2. **Automatic capture** — middleware intercepts all writes without per-view code
3. **JWT-aware middleware** — correctly attributes API-only requests
4. **Non-blocking** — background thread doesn't slow requests
5. **Flexible metadata** — JSONField for arbitrary context
6. **IP + user-agent tracking** — forensic value
7. **Proper indexes** — fast querying by tenant, user, resource, time
8. **Safe error responses** — custom exception handler never leaks internals

### Weaknesses (15)

1. No field-level change tracking (before/after diff)
2. Resource type extraction from URL is fragile
3. Resource ID rarely populated
4. Failed operations not logged (missed security events)
5. Background thread silently drops failures
6. No audit log retention/archival policy
7. No audit log export (CSV/PDF/SIEM)
8. No tamper detection (hash chain)
9. Console-only logging (no persistent storage)
10. No structured (JSON) logging
11. No request correlation IDs
12. No log aggregation integration
13. No compliance metadata
14. No PII scrubbing in logs
15. No error tracking service integration

### Opportunities (6)

1. SOC 2 Type II compliance readiness
2. GDPR Article 30 processing records
3. HIPAA audit log requirements (healthcare tenants)
4. Real-time security event detection (SIEM integration)
5. Compliance dashboard for tenant admins
6. Automated compliance reporting

### Threats (4)

1. Audit compliance violations without tamper detection
2. Data breach forensics impossible without change tracking
3. Regulatory penalties without proper data governance
4. Silent audit log loss via dropped background threads

---

## 4. Gap Analysis — Current vs Enterprise-Grade

| Capability                  | Current State          | Enterprise Target                       | Gap    |
| --------------------------- | ---------------------- | --------------------------------------- | ------ |
| Write operation logging     | ✅ Middleware-captured | ✅ Complete                             | None   |
| Read operation logging      | ❌ Not captured        | ✅ Configurable read logging            | Medium |
| Field-level change tracking | ❌ None                | ✅ Before/after diff on updates         | Large  |
| Failed operation logging    | ❌ Only successful ops | ✅ All ops including failures           | Medium |
| Audit log retention         | ❌ Unbounded growth    | ✅ Configurable retention + archival    | Large  |
| Audit log export            | ❌ None                | ✅ CSV/PDF/SIEM feed                    | Medium |
| Tamper detection            | ❌ None                | ✅ Hash chain / digital signatures      | Large  |
| Structured logging          | ❌ Console text only   | ✅ JSON structured + aggregation        | Large  |
| Request correlation         | ❌ None                | ✅ Request ID across all layers         | Medium |
| Error tracking              | ❌ None                | ✅ Sentry/similar integration           | Medium |
| Compliance metadata         | ❌ None                | ✅ Regulation tags, data classification | Medium |
| PII scrubbing               | ❌ None                | ✅ Automatic PII detection + redaction  | Large  |
| SIEM integration            | ❌ None                | ✅ Real-time event streaming            | Large  |
| Security event detection    | ❌ None                | ✅ Anomaly detection + alerting         | Large  |

---

## 5. Advanced System Design

### 5.1 Design Principles

1. **Immutability** — audit records are append-only, never updated or deleted (except by retention policy)
2. **Completeness** — every state change, access attempt, and security event is captured
3. **Integrity** — hash chain ensures tamper detection
4. **Separation** — audit storage independent from application data
5. **Real-time** — security events trigger immediate alerts
6. **Compliance-by-design** — metadata and controls satisfying SOC 2, GDPR, HIPAA

### 5.2 Unified Audit Event Model

```
AuditEvent (unified):
    ├── who:    user_id, tenant_id, ip_address, user_agent, session_id
    ├── what:   action, resource_type, resource_id, changes (before/after)
    ├── when:   timestamp (server), client_timestamp (optional)
    ├── where:  endpoint, http_method, request_id
    ├── why:    trigger (manual/automated/system/schedule)
    ├── result: outcome (success/failure/denied), status_code, error_message
    ├── compliance: regulation_tags, data_classification, retention_class
    └── integrity: previous_hash, event_hash (SHA-256 chain)
```

### 5.3 Change Tracking System

```python
# Before/after tracking on model updates:

class AuditedModelMixin:
    """Mixin for Django models that tracks field-level changes."""

    def save(self, *args, **kwargs):
        if self.pk:
            try:
                old = type(self).objects.get(pk=self.pk)
                changes = {}
                for field in self._meta.fields:
                    old_val = getattr(old, field.attname)
                    new_val = getattr(self, field.attname)
                    if old_val != new_val:
                        changes[field.name] = {
                            'old': str(old_val),
                            'new': str(new_val)
                        }
                self._audit_changes = changes
            except type(self).DoesNotExist:
                self._audit_changes = {}
        else:
            self._audit_changes = {'_created': True}
        super().save(*args, **kwargs)

# Middleware captures self._audit_changes and includes in AuditEvent.changes
```

### 5.4 Hash Chain Integrity

```
Event 1:  hash_1 = SHA-256(event_1_data + "genesis")
Event 2:  hash_2 = SHA-256(event_2_data + hash_1)
Event 3:  hash_3 = SHA-256(event_3_data + hash_2)
  ...
Event N:  hash_N = SHA-256(event_N_data + hash_{N-1})

Verification:
    - Recompute chain from genesis
    - Any mismatch indicates tampering at that point
    - Hash includes: action, user_id, tenant_id, resource, timestamp, changes
    - Does NOT include: metadata (allows future annotation without breaking chain)

Storage:
    - Previous hash stored with each event
    - Daily chain checkpoints stored separately
    - Chain verification runs as Celery task (nightly)
```

### 5.5 Security Event Detection

```
Real-time detection rules:
    ┌────────────────────────────────────────────────────────────┐
    │ Rule                    │ Trigger              │ Severity  │
    ├─────────────────────────┼──────────────────────┼───────────┤
    │ Brute force login       │ 5+ failed logins/5m  │ HIGH      │
    │ Privilege escalation    │ Permission grant      │ MEDIUM    │
    │ Mass data access        │ 50+ reads/1m         │ HIGH      │
    │ Off-hours activity      │ Login 12AM-6AM       │ LOW       │
    │ Admin action burst      │ 10+ admin ops/5m     │ MEDIUM    │
    │ Cross-tenant attempt    │ Any cross-tenant req │ CRITICAL  │
    │ Bulk delete             │ 10+ deletes/5m       │ HIGH      │
    │ Config change           │ Any system config    │ MEDIUM    │
    │ New device login        │ Unknown user_agent   │ LOW       │
    │ Geo-anomaly             │ Login from new country│ HIGH     │
    └─────────────────────────┴──────────────────────┴───────────┘

Detection pipeline:
    AuditEvent → Redis Stream → SecurityEventProcessor (Celery worker)
        → Match rules → Create SecurityAlert → Notify (email/push/webhook)
```

### 5.6 Compliance Framework

```
Regulation support matrix:
    ┌──────────┬────────────────────────┬──────────────────────────────┐
    │ Standard │ Requirement            │ How fulfilled                │
    ├──────────┼────────────────────────┼──────────────────────────────┤
    │ SOC 2    │ CC6.1 Logical Access   │ AuditEvent captures all      │
    │          │                        │ access + auth events         │
    │ SOC 2    │ CC7.2 Monitoring       │ SecurityEventDetection       │
    │ SOC 2    │ CC8.1 Change Mgmt     │ Field-level change tracking  │
    │          │                        │                              │
    │ GDPR     │ Art 30 Processing Rec  │ ComplianceLog for data ops   │
    │ GDPR     │ Art 17 Right to Erasure│ DataDeletionLog              │
    │ GDPR     │ Art 33 Breach Notify   │ SecurityAlert → auto-notify  │
    │          │                        │                              │
    │ HIPAA    │ §164.312(b) Audit      │ Complete audit trail per PHI │
    │ HIPAA    │ §164.308(a)(5) SETA    │ Security training tracking   │
    └──────────┴────────────────────────┴──────────────────────────────┘
```

### 5.7 Structured Logging Architecture

```
Application Logging (redesigned):
    ┌───────────────────┐
    │ Django Application │
    │   structured log  │
    │   (JSON format)   │
    └────────┬──────────┘
             │
    ┌────────▼──────────┐
    │ CorrelationMiddleware │
    │   adds request_id  │
    │   to every log    │
    └────────┬──────────┘
             │
    ┌────────▼──────────────────────────────────────────────────┐
    │ Log Output (JSON):                                         │
    │ {                                                          │
    │   "timestamp": "2026-03-10T14:30:00Z",                     │
    │   "level": "INFO",                                         │
    │   "request_id": "abc-123-def",                             │
    │   "tenant_id": "uuid-...",                                  │
    │   "user_id": "uuid-...",                                    │
    │   "module": "apps.rag.services",                            │
    │   "message": "RAG query executed",                          │
    │   "duration_ms": 342,                                       │
    │   "extra": {"query_length": 45, "results": 5}               │
    │ }                                                          │
    └────────┬──────────────────────────────────────────────────┘
             │
     ┌───────┴───────┐
     │    stdout      │ ──→ Container logs ──→ CloudWatch / ELK
     │    (JSON)      │
     └───────────────┘
```

---

## 6. Architecture Design

### 6.1 Module Structure

```
apps/
  audit/                          # NEW dedicated audit app
    __init__.py
    models.py                     # AuditEvent, SecurityAlert, ComplianceLog,
                                  # DataDeletionLog, AuditRetentionPolicy
    services/
      __init__.py
      audit_service.py            # Core: create events, query, export
      change_tracking.py          # AuditedModelMixin, field-level diffs
      hash_chain.py               # Hash chain + integrity verification
      security_detection.py       # Rule-based anomaly detection
      compliance_service.py       # Compliance report generation
      export_service.py           # CSV/PDF/SIEM export
      retention_service.py        # Archival + cleanup by retention policy
    middleware/
      __init__.py
      audit_middleware.py         # Enhanced AuditLoggingMiddleware
      correlation_middleware.py   # Request ID injection
    views/
      __init__.py
      tenant_audit.py            # Tenant admin audit views
      platform_audit.py          # Platform owner audit views
      compliance.py              # Compliance dashboard endpoints
      export.py                  # Export endpoints
    admin.py
    urls.py
    migrations/
```

### 6.2 Dependency Graph

```
audit module
    ├── core.models (User, Tenant — existing)
    ├── notifications module (for security alerts)
    ├── django.core.cache (Redis — counters for detection rules)
    ├── celery (background chain verification, retention, export)
    └── External:
        ├── hashlib (SHA-256 chain)
        ├── structlog (structured JSON logging)
        └── sentry-sdk (error tracking)
```

---

## 7. Data Model Design

### 7.1 Models

```python
# ── AuditEvent (replaces AuditLog + SystemAuditLog) ────
class AuditEvent(models.Model):
    """Unified, immutable audit event with hash chain integrity."""
    SCOPES = [('tenant','Tenant'), ('platform','Platform'), ('system','System')]
    OUTCOMES = [('success','Success'), ('failure','Failure'), ('denied','Denied')]
    TRIGGERS = [('manual','Manual'), ('automated','Automated'), ('system','System'), ('schedule','Scheduled')]

    id               = UUIDField(primary_key=True)
    scope            = CharField(max_length=10, choices=SCOPES)
    # Who
    tenant           = ForeignKey(Tenant, SET_NULL, null=True, blank=True)
    user             = ForeignKey(User, SET_NULL, null=True, blank=True)
    ip_address       = GenericIPAddressField(null=True)
    user_agent       = TextField(blank=True)
    session_id       = CharField(max_length=100, blank=True)
    # What
    action           = CharField(max_length=50)           # create, update, delete, read, login, ...
    resource_type    = CharField(max_length=100)           # document, user, role, tenant, ...
    resource_id      = UUIDField(null=True, blank=True)
    changes          = JSONField(default=dict, blank=True)  # {"field": {"old": "x", "new": "y"}}
    # Where
    request_id       = CharField(max_length=64, blank=True)
    endpoint         = CharField(max_length=500, blank=True)
    http_method      = CharField(max_length=10, blank=True)
    # Result
    outcome          = CharField(max_length=10, choices=OUTCOMES, default='success')
    status_code      = IntegerField(null=True)
    error_message    = TextField(blank=True)
    # Context
    trigger          = CharField(max_length=15, choices=TRIGGERS, default='manual')
    metadata         = JSONField(default=dict, blank=True)
    # Compliance
    regulation_tags  = JSONField(default=list, blank=True)  # ['SOC2', 'GDPR']
    data_classification = CharField(max_length=20, blank=True)  # public, internal, confidential, restricted
    retention_class  = CharField(max_length=20, default='standard')  # standard, extended, permanent
    # Integrity
    previous_hash    = CharField(max_length=64, blank=True)
    event_hash       = CharField(max_length=64, blank=True)
    # Time
    timestamp        = DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_events'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['tenant', '-timestamp']),
            models.Index(fields=['user', '-timestamp']),
            models.Index(fields=['scope', '-timestamp']),
            models.Index(fields=['action', '-timestamp']),
            models.Index(fields=['resource_type', 'resource_id']),
            models.Index(fields=['request_id']),
            models.Index(fields=['outcome', '-timestamp']),
        ]

# ── SecurityAlert ───────────────────────────────────────
class SecurityAlert(models.Model):
    SEVERITIES = [('low','Low'), ('medium','Medium'), ('high','High'), ('critical','Critical')]
    STATUSES = [('open','Open'), ('acknowledged','Acknowledged'), ('resolved','Resolved'), ('false_positive','False Positive')]

    id               = UUIDField(primary_key=True)
    tenant           = ForeignKey(Tenant, SET_NULL, null=True, blank=True)
    rule_key         = CharField(max_length=100)            # brute_force_login, mass_data_access
    severity         = CharField(max_length=10, choices=SEVERITIES)
    title            = CharField(max_length=300)
    description      = TextField()
    source_events    = JSONField(default=list)               # List of AuditEvent IDs that triggered
    status           = CharField(max_length=20, choices=STATUSES, default='open')
    resolved_by      = ForeignKey(User, SET_NULL, null=True, blank=True, related_name='resolved_alerts')
    resolved_at      = DateTimeField(null=True)
    resolution_notes = TextField(blank=True)
    created_at       = DateTimeField(auto_now_add=True)

# ── ComplianceLog ───────────────────────────────────────
class ComplianceLog(models.Model):
    """Record of compliance-relevant data processing activities (GDPR Art 30)."""
    id               = UUIDField(primary_key=True)
    tenant           = ForeignKey(Tenant, CASCADE)
    processing_purpose = CharField(max_length=200)
    data_categories  = JSONField(default=list)               # ['personal', 'financial', 'health']
    data_subjects    = CharField(max_length=100)             # employees, customers, visitors
    recipients       = JSONField(default=list)               # who has access
    retention_period = CharField(max_length=100)
    legal_basis      = CharField(max_length=100)             # consent, contract, legitimate_interest
    created_at       = DateTimeField(auto_now_add=True)
    updated_at       = DateTimeField(auto_now=True)

# ── DataDeletionLog ─────────────────────────────────────
class DataDeletionLog(models.Model):
    """GDPR Art 17 Right to Erasure — tracks all data deletion requests and execution."""
    STATUSES = [('requested','Requested'), ('in_progress','In Progress'), ('completed','Completed'), ('denied','Denied')]

    id               = UUIDField(primary_key=True)
    tenant           = ForeignKey(Tenant, CASCADE)
    requested_by     = ForeignKey(User, SET_NULL, null=True)
    subject_user     = ForeignKey(User, SET_NULL, null=True, related_name='deletion_requests')
    data_scope       = JSONField(default=dict)               # what to delete
    legal_basis      = CharField(max_length=100)
    status           = CharField(max_length=20, choices=STATUSES, default='requested')
    completed_at     = DateTimeField(null=True)
    deletion_proof   = JSONField(default=dict)               # confirmation of what was deleted
    created_at       = DateTimeField(auto_now_add=True)

# ── AuditRetentionPolicy ───────────────────────────────
class AuditRetentionPolicy(models.Model):
    """Configurable retention per tenant or globally."""
    tenant           = ForeignKey(Tenant, CASCADE, null=True, blank=True)  # null = global
    retention_class  = CharField(max_length=20)             # standard, extended, permanent
    retention_days   = IntegerField()                        # 90, 365, 2555 (7 years)
    archive_to       = CharField(max_length=100, blank=True) # s3://bucket/path (cold storage)
    is_active        = BooleanField(default=True)
```

### 7.2 ERD

```
┌─────────────────────────┐       ┌───────────────────────┐
│      AuditEvent         │       │    SecurityAlert      │
│ scope, action, resource │──────→│ rule, severity, status│
│ changes (before/after)  │       │ source_events (IDs)   │
│ outcome, status_code    │       └───────────────────────┘
│ event_hash, prev_hash   │
│ regulation_tags         │
└─────────────────────────┘

┌─────────────────────────┐       ┌───────────────────────┐
│    ComplianceLog        │       │   DataDeletionLog     │
│ purpose, categories     │       │ subject, scope, status│
│ legal_basis, retention  │       │ deletion_proof        │
└─────────────────────────┘       └───────────────────────┘

┌─────────────────────────┐
│ AuditRetentionPolicy    │
│ class, days, archive_to │
└─────────────────────────┘
```

---

## 8. API Design

### 8.1 Tenant Admin Endpoints

| Endpoint                           | Method | Auth  | Purpose                                |
| ---------------------------------- | ------ | ----- | -------------------------------------- |
| `/api/audit/events/`               | GET    | Admin | Query tenant audit events (filterable) |
| `/api/audit/events/{id}/`          | GET    | Admin | Single event detail                    |
| `/api/audit/events/export/`        | POST   | Admin | Export filtered events (CSV/PDF)       |
| `/api/audit/security-alerts/`      | GET    | Admin | List security alerts for tenant        |
| `/api/audit/security-alerts/{id}/` | PATCH  | Admin | Acknowledge/resolve alert              |
| `/api/audit/compliance/`           | GET    | Admin | Compliance dashboard data              |
| `/api/audit/compliance/report/`    | POST   | Admin | Generate compliance report             |

### 8.2 Platform Owner Endpoints

| Endpoint                                           | Method   | Auth     | Purpose                           |
| -------------------------------------------------- | -------- | -------- | --------------------------------- |
| `/api/platform/audit/events/`                      | GET      | Platform | Cross-tenant audit event query    |
| `/api/platform/audit/events/verify/`               | POST     | Platform | Hash chain integrity verification |
| `/api/platform/audit/security-alerts/`             | GET      | Platform | All security alerts               |
| `/api/platform/audit/retention-policies/`          | GET/POST | Platform | Manage retention policies         |
| `/api/platform/audit/retention-policies/{id}/`     | PATCH    | Platform | Update retention policy           |
| `/api/platform/audit/data-deletion-requests/`      | GET      | Platform | GDPR erasure request queue        |
| `/api/platform/audit/data-deletion-requests/{id}/` | PATCH    | Platform | Process deletion request          |

---

## 9. Security Design

### 9.1 Audit Security Measures

| Measure               | Implementation                                              |
| --------------------- | ----------------------------------------------------------- |
| Immutability          | No UPDATE/DELETE endpoints; DB user with INSERT+SELECT only |
| Tamper detection      | SHA-256 hash chain, nightly verification                    |
| Access control        | Admin sees own tenant only; Platform sees all               |
| Audit of audits       | Audit event queries themselves are logged                   |
| PII in audit logs     | Sensitive fields redacted (password, tokens)                |
| Retention enforcement | Celery job archives + deletes per policy                    |
| Export security       | Signed export files with checksum                           |
| Transport             | TLS-only for all audit endpoints                            |

### 9.2 PII Scrubbing Rules

```python
SCRUB_FIELDS = {
    'password', 'new_password', 'old_password', 'current_password',
    'token', 'access_token', 'refresh_token',
    'api_key', 'secret', 'secret_key',
    'credit_card', 'ssn', 'social_security',
}

def scrub_audit_data(data: dict) -> dict:
    """Recursively redact sensitive fields from audit metadata."""
    for key in data:
        if key.lower() in SCRUB_FIELDS:
            data[key] = '***REDACTED***'
        elif isinstance(data[key], dict):
            scrub_audit_data(data[key])
    return data
```

---

## 10. Scalability & Reliability Design

### 10.1 Performance Targets

| Metric                   | Target         | Current |
| ------------------------ | -------------- | ------- |
| Audit write latency      | < 5ms (async)  | ~10ms   |
| Audit query (filtered)   | < 200ms        | ~100ms  |
| Hash chain verification  | < 30s per 100K | N/A     |
| Security event detection | < 1s           | N/A     |
| Export 100K events (CSV) | < 30s          | N/A     |
| Daily retention cleanup  | < 5min         | N/A     |

### 10.2 Volume Projections

```
Per tenant per day (average):
    - Login events: ~50
    - CRUD events: ~200
    - Read events: ~500 (if enabled)
    - System events: ~20
    Total: ~770 events/day

Platform total (1000 tenants):
    - ~770,000 events/day
    - ~23M events/month
    - ~280M events/year

Storage:
    - ~1KB per event average
    - ~280 GB/year uncompressed
    - ~30 GB/year with archival compression
```

### 10.3 Archival Strategy

```
Hot storage (DB):        Last 90 days — full query performance
Warm storage (compressed): 90 days → 1 year — query with latency
Cold storage (S3):       > 1 year — retrieval on request, compliance-only

Celery beat (daily at 3 AM):
    1. Identify events older than retention threshold
    2. Export to CSV, compress (gzip)
    3. Upload to S3 (versioned bucket)
    4. Delete from DB
    5. Log archival in AuditEvent (meta-audit)
```

### 10.4 Write Pipeline

```
Request → AuditMiddleware → Celery task (async)
    │
    ├── 1. Serialize audit event
    ├── 2. Scrub PII
    ├── 3. Compute event hash (chain)
    ├── 4. Write to DB (INSERT only)
    ├── 5. Publish to Redis Stream (for detection)
    └── 6. If failed: retry with backoff (max 3 attempts)
             If still failed: write to dead-letter file
```

---

## 11. Frontend Design

### 11.1 Audit Log Viewer (Enhanced)

```
Audit Logs:
┌──────────────────────────────────────────────────────────────┐
│  Audit Log                                    [Export ▾]      │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Filters:                                                  ││
│  │ Action [All ▾] Resource [All ▾] User [All ▾]            ││
│  │ Outcome [All ▾] Date [Last 7 days ▾]    [Search...]     ││
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌───────┬──────────┬──────────┬────────┬─────────┬────────┐│
│  │ Time  │ User     │ Action   │Resource│ Outcome │ Detail ││
│  ├───────┼──────────┼──────────┼────────┼─────────┼────────┤│
│  │ 14:30 │ alice@   │ UPDATE   │ doc    │ ✅       │ [View] ││
│  │ 14:28 │ bob@     │ DELETE   │ role   │ ✅       │ [View] ││
│  │ 14:25 │ eve@     │ UPDATE   │ user   │ ❌ 403   │ [View] ││
│  └───────┴──────────┴──────────┴────────┴─────────┴────────┘│
│                                                               │
│  Page 1 of 42  [< Prev] [Next >]                             │
└──────────────────────────────────────────────────────────────┘
```

### 11.2 Event Detail View

```
Audit Event Detail:
┌──────────────────────────────────────────────────────────────┐
│  Event: 3f2a...1b4c                            [Copy ID]     │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Who:    alice@acme.com (Tenant: Acme Corp)              │  │
│  │ When:   2026-03-10 14:30:22 UTC                          │  │
│  │ Action: UPDATE on Document (doc-id: 7b3f...)            │  │
│  │ Result: ✅ Success (200)                                  │  │
│  │ IP:     192.168.1.42                                     │  │
│  │ Req ID: req-abc-123-def                                  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  Changes:                                                     │
│  ┌──────────────┬───────────────┬───────────────┐            │
│  │ Field        │ Old Value     │ New Value     │            │
│  ├──────────────┼───────────────┼───────────────┤            │
│  │ title        │ "Draft"       │ "Final Report"│            │
│  │ status       │ "draft"       │ "published"   │            │
│  │ updated_at   │ 2026-03-09    │ 2026-03-10    │            │
│  └──────────────┴───────────────┴───────────────┘            │
│                                                               │
│  Integrity: ✅ Hash verified (chain position: 47,329)        │
└──────────────────────────────────────────────────────────────┘
```

### 11.3 Security Alerts Dashboard

```
Security Alerts:
┌──────────────────────────────────────────────────────────────┐
│  Security Alerts                                              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐               │
│  │ 2      │ │ 5      │ │ 12     │ │ 3      │               │
│  │Critical│ │ High   │ │ Medium │ │ Low    │               │
│  │ 🔴     │ │ 🟠     │ │ 🟡     │ │ 🔵     │               │
│  └────────┘ └────────┘ └────────┘ └────────┘               │
│                                                               │
│  Open Alerts:                                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🔴 CRITICAL  Cross-tenant access attempt               │  │
│  │    User eve@ attempted resource in Tenant B             │  │
│  │    2 min ago   [Acknowledge] [Investigate] [Resolve]   │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ 🟠 HIGH  Brute force login detected                    │  │
│  │    8 failed logins for admin@acme.com from 3 IPs       │  │
│  │    15 min ago  [Acknowledge] [Investigate] [Resolve]   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 12. Migration Strategy

### Phase 1: Unified AuditEvent Model

- Create AuditEvent model (superset of AuditLog + SystemAuditLog)
- Create data migration: copy AuditLog rows → AuditEvent (scope=tenant)
- Create data migration: copy SystemAuditLog rows → AuditEvent (scope=platform)
- Update AuditLoggingMiddleware to write AuditEvent
- Update all manual SystemAuditLog.create() calls to use AuditService
- Deprecate old AuditLog + SystemAuditLog (keep as fallback for 1 release)

### Phase 2: Enhanced Capture

- Add failed operation logging (status_code >= 400)
- Add field-level change tracking (AuditedModelMixin)
- Add request ID correlation (CorrelationMiddleware)
- Add PII scrubbing
- Switch audit writes from background thread to Celery task

### Phase 3: Integrity & Security

- Implement hash chain
- Create nightly chain verification Celery task
- Create SecurityAlert model
- Implement security event detection rules
- Wire alerts into notification system

### Phase 4: Compliance & Export

- Create ComplianceLog + DataDeletionLog models
- Build compliance dashboard endpoints
- Build export service (CSV/PDF)
- Create retention policies
- Implement archival Celery task
- Build compliance report generation

### Phase 5: Observability

- Switch to structured JSON logging (structlog)
- Add Sentry integration
- Add log aggregation (ELK/CloudWatch)
- Build enhanced frontend (event detail, alerts dashboard)

---

## 13. Implementation Roadmap

| #   | Task                                      | Phase | Depends On | Priority |
| --- | ----------------------------------------- | ----- | ---------- | -------- |
| 1   | Create AuditEvent model                   | 1     | —          | Critical |
| 2   | Migrate AuditLog → AuditEvent             | 1     | 1          | Critical |
| 3   | Migrate SystemAuditLog → AuditEvent       | 1     | 1          | Critical |
| 4   | Refactor middleware → AuditService        | 1     | 1          | Critical |
| 5   | Update all manual log creation calls      | 1     | 4          | Critical |
| 6   | Add failed operation logging              | 2     | 4          | High     |
| 7   | Build AuditedModelMixin (change tracking) | 2     | —          | High     |
| 8   | Apply mixin to all models                 | 2     | 7          | High     |
| 9   | Add CorrelationMiddleware (request_id)    | 2     | —          | High     |
| 10  | Add PII scrubbing                         | 2     | —          | High     |
| 11  | Switch to Celery async writes             | 2     | —          | Medium   |
| 12  | Implement hash chain                      | 3     | 1          | High     |
| 13  | Build nightly chain verification          | 3     | 12         | High     |
| 14  | Create SecurityAlert model                | 3     | —          | High     |
| 15  | Build security detection rules            | 3     | 14         | High     |
| 16  | Wire alerts → notification system         | 3     | 14         | Medium   |
| 17  | Create ComplianceLog + DataDeletionLog    | 4     | —          | Medium   |
| 18  | Build compliance dashboard API            | 4     | 17         | Medium   |
| 19  | Build export service (CSV/PDF)            | 4     | 1          | Medium   |
| 20  | Create retention policies                 | 4     | —          | Medium   |
| 21  | Build archival Celery task                | 4     | 20         | Medium   |
| 22  | Switch to structlog (JSON logging)        | 5     | —          | Medium   |
| 23  | Add Sentry integration                    | 5     | —          | Medium   |
| 24  | Frontend: enhanced audit viewer           | 5     | 1          | Medium   |
| 25  | Frontend: security alerts dashboard       | 5     | 14         | Medium   |
| 26  | Frontend: compliance dashboard            | 5     | 18         | Low      |

---

> **Status:** Analysis complete. Implementation ON HOLD until design review and approval.
