# Platform Administration & Multi-Tenancy (SaaS) — Complete Analysis & System Design

**Date:** 10 March 2026
**Scope:** Full analysis of multi-tenancy, subscription management, platform owner operations, AI config, system health
**Principle:** Analyse current → Identify gaps → Design enterprise-grade SaaS platform layer

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

The platform administration module spans **12+ files** across backend + frontend:

| Layer                | Files                                                                                                                                                                                                                                    | Purpose                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Models**           | `core/models.py` (Tenant, SubscriptionPlan, TenantSubscription, UsageMetrics, SystemAuditLog, AIProviderConfig, SupportTicket)                                                                                                           | Multi-tenant foundation, billing, metrics, config            |
| **Views**            | `api/views/platform_owner.py` (10+ endpoints)                                                                                                                                                                                            | Platform overview, tenant CRUD, health, analytics, AI config |
| **Permissions**      | `core/permissions.py` (IsPlatformOwner)                                                                                                                                                                                                  | Superuser + no-tenant check                                  |
| **Middleware**       | `core/middleware.py` (TenantIsolationMiddleware)                                                                                                                                                                                         | Tenant attachment, deactivation blocking                     |
| **Throttling**       | `core/throttle.py`, `core/quota.py`                                                                                                                                                                                                      | Per-tenant/per-user rate limits, daily query quotas          |
| **Frontend Pages**   | `platform/PlatformDashboard.tsx`, `PlatformTenants.tsx`, `PlatformAIConfig.tsx`, `PlatformAnalytics.tsx`, `PlatformAuditLogs.tsx`, `PlatformSecurity.tsx`, `PlatformSubscriptions.tsx`, `PlatformPermissions.tsx`, `PlatformSupport.tsx` | Platform owner admin UI                                      |
| **Frontend Service** | `services/platformOwner.service.ts`                                                                                                                                                                                                      | Platform API wrapper                                         |

### 1.2 Current Multi-Tenancy Architecture

```
Platform Owner (superuser, tenant=NULL)
    │
    ├─── Manages ──→ Tenant A (is_active=True)
    │                   ├── Users (tenant_id = A)
    │                   ├── Departments (tenant_id = A)
    │                   ├── Roles (tenant_id = A)
    │                   ├── Documents (tenant_id = A)
    │                   ├── Audit Logs (tenant_id = A)
    │                   └── Subscription (plan=Enterprise)
    │
    ├─── Manages ──→ Tenant B (is_active=True)
    │                   └── ... same structure
    │
    └─── Manages ──→ Tenant C (is_active=False — suspended)
                        └── All requests blocked by TenantIsolationMiddleware
```

---

## 2. Component Deep-Dive

### 2.1 Tenant Model

**Current:** Minimal — `id`, `name`, `slug`, `is_active`, timestamps.

**Issues:**

- No tenant settings (logo, theme, custom domain, feature flags)
- No tenant-level config overrides (password policy, session timeout, MFA requirement)
- No tenant onboarding state tracking (setup wizard progress)
- No tenant contact info (billing email, technical contact)
- `slug` uniqueness not case-insensitive (potential conflicts)
- No tenant-level data retention policy
- Hard delete of tenant cascades ALL data (irreversible)

### 2.2 Subscription System

**Current Models:** `SubscriptionPlan` (3 tiers), `TenantSubscription` (per-tenant status).

**Strengths:**

- Plan-based limits: max_users, max_storage_gb, max_queries/tokens per month
- Status tracking: active/suspended/cancelled/trial
- Billing period dates tracked

**Issues:**

- No payment gateway integration (Stripe, Paddle)
- No plan upgrade/downgrade flow
- No prorated billing
- No usage-based overage charges
- No invoice generation
- No free trial auto-expiry
- Plans are static — no custom enterprise plans per tenant
- No feature flags tied to plans (binary all-or-nothing)
- Subscription limits NOT enforced at runtime (only defined)
- No billing history / payment ledger

### 2.3 Usage Metrics

**Current:** `UsageMetrics` — daily aggregates per tenant.

**Issues:**

- Metrics NOT auto-collected — requires manual population (via `populate_analytics.py` script)
- No real-time metric streaming
- No per-user metric breakdown
- No cost allocation per query (for billing)
- No metric alerting (e.g., tenant approaching quota)
- No data export (CSV/PDF reports)

### 2.4 AI Provider Config

**Current:** Singleton `AIProviderConfig` — platform-wide LLM + embedding settings.

**Strengths:**

- Supports 5 LLM providers + 3 embedding providers
- Hot-switchable — no restart needed
- DB-stored with settings.py fallback
- Masked API keys in UI

**Issues:**

- Platform-wide only — no per-tenant AI provider override
- No per-model cost tracking
- No fallback chain (if primary provider fails)
- No A/B testing between models
- No per-tenant model restrictions (e.g., Basic plan = GPT-3.5 only)
- API keys stored in DB without field-level encryption

### 2.5 System Health

**Current:** Real-time checks for API, DB, Redis, Qdrant, Celery.

**Strengths:**

- Checks all critical dependencies
- Returns structured health per component

**Issues:**

- No health history / uptime tracking
- No alerting on degradation
- No Celery queue depth monitoring (always returns 0)
- No request latency percentiles (hardcoded values)
- No custom health endpoints for load balancers

### 2.6 Support Tickets

**Current:** `SupportTicket` model with basic CRUD.

**Issues:**

- No ticket assignment to platform owner team
- No SLA tracking (response time, resolution time)
- No ticket comments/thread
- No status change notifications
- No priority escalation rules
- No knowledge base integration
- No ticket search/filter in frontend

---

## 3. SWOT Analysis

### Strengths (7)

1. **Clean tenant isolation** — middleware-enforced, every model has tenant FK
2. **Subscription planning** — 3-tier plans with resource limits defined
3. **Atomic tenant creation** — transaction.atomic() with rollback on failure
4. **System health monitoring** — real-time status for 6 components
5. **AI config flexibility** — hot-switchable multi-provider support
6. **Platform audit trail** — SystemAuditLog captures owner actions
7. **Usage metrics model** — daily per-tenant aggregation structure ready

### Weaknesses (14)

1. No payment gateway integration
2. Subscription limits defined but not enforced
3. Usage metrics not auto-collected
4. No tenant self-service portal (admin creates everything)
5. No per-tenant configuration overrides
6. No tenant onboarding flow
7. No feature flags system
8. No billing/invoice generation
9. No per-tenant AI provider settings
10. No health alerting or uptime history
11. Support tickets lack routing, SLA, comments
12. No data export or compliance reporting
13. API keys in DB without field-level encryption
14. No tenant data backup/restore mechanism

### Opportunities (6)

1. Self-service tenant onboarding with payment
2. Usage-based billing (pay per query/token)
3. Marketplace for AI models (tenants choose their own)
4. White-label tenancy (custom domains, logos, themes)
5. Multi-region deployment with tenant data residency
6. Compliance dashboard (SOC 2, GDPR status per tenant)

### Threats (4)

1. Revenue loss without proper billing integration
2. Tenant data breach without encryption at rest
3. Noisy neighbor DoS without enforced quotas
4. GDPR violations without proper data residency controls

---

## 4. Gap Analysis — Current vs Enterprise-Grade

| Capability              | Current State             | Enterprise Target                | Gap    |
| ----------------------- | ------------------------- | -------------------------------- | ------ |
| Tenant CRUD             | ✅ Full (create w/ admin) | ✅ + self-service onboarding     | Medium |
| Subscription management | ⚠️ Model only             | ✅ Full lifecycle + payments     | Large  |
| Quota enforcement       | ❌ Defined, not enforced  | ✅ Runtime enforcement + alerts  | Large  |
| Usage metering          | ⚠️ Manual population      | ✅ Automatic real-time metering  | Large  |
| Payment processing      | ❌ None                   | ✅ Stripe/Paddle integration     | Large  |
| Feature flags           | ❌ None                   | ✅ Plan-gated + per-tenant flags | Medium |
| Tenant config overrides | ❌ None                   | ✅ Per-tenant settings           | Medium |
| Health monitoring       | ✅ Real-time checks       | ✅ + history + alerting          | Medium |
| System alerting         | ❌ None                   | ✅ Webhook/email alerts          | Medium |
| Support system          | ⚠️ Basic CRUD             | ✅ Full ticketing + SLA          | Medium |
| Data residency          | ❌ None                   | ✅ Region selection per tenant   | Large  |
| Compliance reporting    | ❌ None                   | ✅ SOC 2/GDPR dashboards         | Large  |
| AI provider per tenant  | ❌ Platform-wide only     | ✅ Per-tenant override           | Medium |
| Billing & invoicing     | ❌ None                   | ✅ Automated invoicing           | Large  |

---

## 5. Advanced System Design

### 5.1 Design Principles

1. **Tenant self-sufficiency** — tenants manage their own settings without platform owner intervention
2. **Quota-first** — every resource has a defined limit, enforced in real-time
3. **Pay-as-you-go ready** — metering infrastructure supports usage-based billing
4. **Feature gates** — new features rollable per-plan or per-tenant
5. **Zero-downtime operations** — tenant updates, plan changes, config switches happen live

### 5.2 Multi-Tenancy Architecture (Redesigned)

```
┌──────────────────────────────────────────────────────────────────┐
│                      Platform Layer                               │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Tenant Registry  │  │ Subscription     │  │ Feature Flag  │  │
│  │ + Config Store   │  │ Engine           │  │ Service       │  │
│  │                  │  │                  │  │               │  │
│  │ • Settings       │  │ • Plan CRUD      │  │ • Plan gates  │  │
│  │ • Branding       │  │ • Usage meter    │  │ • Tenant flags│  │
│  │ • Domain mapping │  │ • Quota enforce  │  │ • Rollout %   │  │
│  │ • Security policy│  │ • Billing events │  │ • A/B testing │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘  │
│           │                      │                     │          │
│           └──────────────┬───────┘                     │          │
│                          │                             │          │
│  ┌───────────────────────┼─────────────────────────────┼───────┐ │
│  │                   Metering Bus                       │       │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │       │ │
│  │  │ Query    │  │ Storage  │  │ Token    │          │       │ │
│  │  │ Counter  │  │ Meter    │  │ Counter  │          │       │ │
│  │  └──────────┘  └──────────┘  └──────────┘          │       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          │                                       │
│  ┌───────────────────────┼──────────────────────────────────┐   │
│  │              Health & Monitoring                           │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │   │
│  │  │ Health   │  │ Alert    │  │ Uptime   │  │ Metrics │ │   │
│  │  │ Checker  │  │ Dispatcher│  │ Tracker  │  │ Exporter│ │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 5.3 Subscription & Billing Engine

```
Tenant signs up → Trial (14 days)
    │
    ├─ During trial: all Enterprise features unlocked
    ├─ Day 7: reminder email
    ├─ Day 12: urgent reminder
    ├─ Day 14: trial expires
    │   ├─ If payment method added → convert to paid subscription
    │   └─ If no payment → suspend (read-only mode)
    │
    ▼
Paid Subscription (monthly cycle)
    │
    ├─ Usage metered continuously
    ├─ Invoice generated at period end
    ├─ Overage charges calculated (if usage-based)
    ├─ Payment processed via Stripe/Paddle
    │
    ├─ Plan upgrade: immediate, prorated
    ├─ Plan downgrade: effective next billing cycle
    │
    └─ Cancellation:
        ├─ Grace period (30 days)
        ├─ Data export available during grace
        └─ Hard delete after retention period
```

### 5.4 Quota Enforcement Architecture

```
Request enters system
    │
    ▼
[QuotaMiddleware]
    │
    ├─ Check: Users count < plan.max_users (on user creation)
    ├─ Check: Storage used < plan.max_storage_gb (on upload)
    ├─ Check: Queries today < plan.max_queries_per_month / 30 (on RAG query)
    ├─ Check: Tokens used < plan.max_tokens_per_month (on LLM call)
    │
    ├─ Pass → continue request
    └─ Fail → 429 Too Many Requests
                {
                    "error": "quota_exceeded",
                    "resource": "queries",
                    "limit": 500,
                    "used": 500,
                    "reset_at": "2026-04-01T00:00:00Z"
                }

Metering:
    Every RAG query → increment Redis counter (tenant:{id}:queries:{date})
    Every upload → increment Redis counter (tenant:{id}:storage_bytes)
    Celery beat (hourly) → flush Redis counters to UsageMetrics DB table
```

### 5.5 Feature Flag System

```python
# Feature flag evaluation:
def is_feature_enabled(tenant_id, feature_key):
    """
    Resolution order:
    1. Per-tenant override (TenantFeatureFlag) — explicit on/off
    2. Plan-level gate (PlanFeatureGate) — enabled for plan tier
    3. Global default (FeatureFlag.default_enabled)
    """
```

**Standard Feature Flags:**

| Feature Key           | Basic | Pro | Enterprise | Purpose                       |
| --------------------- | ----- | --- | ---------- | ----------------------------- |
| `chat_sessions`       | ✅    | ✅  | ✅         | Basic RAG chat                |
| `document_versioning` | ❌    | ✅  | ✅         | Document version history      |
| `sso_integration`     | ❌    | ❌  | ✅         | SAML/OIDC SSO                 |
| `mfa_required`        | ❌    | ❌  | ✅         | Enforce MFA for all users     |
| `custom_ai_model`     | ❌    | ❌  | ✅         | Per-tenant AI provider config |
| `advanced_analytics`  | ❌    | ✅  | ✅         | Detailed usage analytics      |
| `api_access`          | ❌    | ✅  | ✅         | Programmatic API access       |
| `data_export`         | ❌    | ✅  | ✅         | Bulk data export              |
| `audit_log_export`    | ❌    | ✅  | ✅         | Export audit logs             |
| `custom_branding`     | ❌    | ❌  | ✅         | Custom logo, colors, domain   |

### 5.6 Tenant Configuration

```python
TenantConfig (per-tenant settings, overrides platform defaults):
    ├── Security:
    │   ├── password_min_length (default: 8)
    │   ├── password_complexity_required (default: False)
    │   ├── mfa_enforcement (none / optional / required)
    │   ├── session_timeout_minutes (default: 60)
    │   ├── max_login_attempts (default: 10)
    │
    ├── Branding:
    │   ├── logo_url
    │   ├── primary_color
    │   ├── custom_domain
    │   ├── display_name
    │
    ├── AI:
    │   ├── ai_provider_override (null = use platform default)
    │   ├── max_tokens_per_request
    │   ├── rag_top_k (default: 5)
    │
    └── Data:
        ├── retention_days (default: 365)
        ├── data_region (us-east / eu-west / ap-south)
        ├── auto_delete_on_cancel (default: False)
```

---

## 6. Architecture Design

### 6.1 Module Structure

```
apps/
  platform/                       # NEW dedicated platform app
    __init__.py
    models.py                     # TenantConfig, FeatureFlag, PlanFeatureGate,
                                  # TenantFeatureFlag, BillingEvent, Invoice
    services/
      __init__.py
      tenant_service.py           # TenantService (CRUD, onboarding, deactivation)
      subscription_service.py     # SubscriptionService (plan change, trial, billing)
      metering_service.py         # MeteringService (real-time usage tracking)
      quota_service.py            # QuotaService (enforcement at request time)
      feature_flag_service.py     # FeatureFlagService (evaluate, override)
      health_service.py           # HealthService (checks, history, alerting)
      billing_service.py          # BillingService (Stripe integration, invoicing)
    views/
      __init__.py
      overview.py                 # Platform dashboard
      tenants.py                  # Tenant CRUD + config
      subscriptions.py            # Subscription management
      health.py                   # System health
      analytics.py                # Platform analytics
      ai_config.py                # AI provider configuration
      support.py                  # Support ticket management
    admin.py
    urls.py
    migrations/
```

### 6.2 Dependency Graph

```
platform module
    ├── core.models (Tenant, User — existing)
    ├── rbac.services (for tenant admin role creation)
    ├── core.services.notifications (for alerts)
    ├── django.core.cache (Redis — metering, quotas)
    └── External:
        ├── stripe (payment processing)
        ├── celery (background metering, billing)
        └── sentry / datadog (external alerting)
```

---

## 7. Data Model Design

### 7.1 New/Updated Models

```python
# ── Tenant (UPDATED) ────────────────────────────────────
# Add to existing Tenant model:
    contact_email    = EmailField(blank=True)
    billing_email    = EmailField(blank=True)
    onboarding_step  = CharField(max_length=30, default='created')  # created/configured/active
    data_region      = CharField(max_length=20, default='us-east')
    deleted_at       = DateTimeField(null=True)                      # Soft delete
    trial_ends_at    = DateTimeField(null=True)

# ── TenantConfig ────────────────────────────────────────
class TenantConfig(models.Model):
    """Per-tenant configuration overrides."""
    tenant               = OneToOneField(Tenant, CASCADE, related_name='config')
    # Security
    password_min_length  = IntegerField(default=8)
    password_complexity  = BooleanField(default=False)
    mfa_enforcement      = CharField(max_length=20, default='optional')  # none/optional/required
    session_timeout_min  = IntegerField(default=60)
    max_login_attempts   = IntegerField(default=10)
    # Branding
    logo_url             = URLField(blank=True)
    primary_color        = CharField(max_length=7, default='#6366f1')
    custom_domain        = CharField(max_length=255, blank=True)
    # AI
    ai_provider_override = JSONField(null=True, blank=True)  # override AIProviderConfig per tenant
    max_tokens_per_request = IntegerField(default=1000)
    rag_top_k            = IntegerField(default=5)
    # Data
    retention_days       = IntegerField(default=365)
    updated_at           = DateTimeField(auto_now=True)

# ── FeatureFlag ─────────────────────────────────────────
class FeatureFlag(models.Model):
    key              = CharField(max_length=100, unique=True)
    name             = CharField(max_length=200)
    description      = TextField(blank=True)
    default_enabled  = BooleanField(default=False)
    is_active        = BooleanField(default=True)  # Global kill switch
    created_at       = DateTimeField(auto_now_add=True)

# ── PlanFeatureGate ─────────────────────────────────────
class PlanFeatureGate(models.Model):
    """Which plan tiers unlock a given feature."""
    plan             = ForeignKey(SubscriptionPlan, CASCADE)
    feature          = ForeignKey(FeatureFlag, CASCADE)
    enabled          = BooleanField(default=True)

    class Meta:
        unique_together = [['plan', 'feature']]

# ── TenantFeatureFlag ───────────────────────────────────
class TenantFeatureFlag(models.Model):
    """Per-tenant overrides for feature flags."""
    tenant           = ForeignKey(Tenant, CASCADE)
    feature          = ForeignKey(FeatureFlag, CASCADE)
    enabled          = BooleanField()
    reason           = CharField(max_length=255, blank=True)  # "Beta tester", "Custom contract"

    class Meta:
        unique_together = [['tenant', 'feature']]

# ── BillingEvent ────────────────────────────────────────
class BillingEvent(models.Model):
    """Immutable ledger of billing-related events."""
    EVENT_TYPES = [
        ('subscription_start', 'Subscription Start'),
        ('subscription_renew', 'Subscription Renewal'),
        ('plan_upgrade', 'Plan Upgrade'),
        ('plan_downgrade', 'Plan Downgrade'),
        ('payment_success', 'Payment Success'),
        ('payment_failed', 'Payment Failed'),
        ('invoice_created', 'Invoice Created'),
        ('trial_start', 'Trial Start'),
        ('trial_expired', 'Trial Expired'),
        ('cancellation', 'Cancellation'),
    ]
    id              = UUIDField(primary_key=True)
    tenant          = ForeignKey(Tenant, CASCADE)
    event_type      = CharField(max_length=30, choices=EVENT_TYPES)
    amount          = DecimalField(max_digits=10, decimal_places=2, null=True)
    currency        = CharField(max_length=3, default='USD')
    stripe_event_id = CharField(max_length=100, blank=True)
    details         = JSONField(default=dict)
    created_at      = DateTimeField(auto_now_add=True)

# ── Invoice ─────────────────────────────────────────────
class Invoice(models.Model):
    STATUSES = [('draft','Draft'), ('sent','Sent'), ('paid','Paid'), ('overdue','Overdue')]
    id              = UUIDField(primary_key=True)
    tenant          = ForeignKey(Tenant, CASCADE)
    invoice_number  = CharField(max_length=20, unique=True)   # INV-2026-0001
    period_start    = DateField()
    period_end      = DateField()
    subtotal        = DecimalField(max_digits=10, decimal_places=2)
    tax             = DecimalField(max_digits=10, decimal_places=2, default=0)
    total           = DecimalField(max_digits=10, decimal_places=2)
    status          = CharField(max_length=10, choices=STATUSES, default='draft')
    line_items      = JSONField(default=list)   # [{"desc": "Pro Plan", "qty": 1, "amount": 49.00}, ...]
    pdf_url         = CharField(max_length=512, blank=True)
    paid_at         = DateTimeField(null=True)
    created_at      = DateTimeField(auto_now_add=True)

# ── HealthCheckLog ──────────────────────────────────────
class HealthCheckLog(models.Model):
    """Historical health check results for uptime tracking."""
    id              = UUIDField(primary_key=True)
    component       = CharField(max_length=50)     # api_server, database, redis, qdrant, celery
    status          = CharField(max_length=20)      # healthy, warning, error
    latency_ms      = IntegerField(null=True)
    details         = JSONField(default=dict)
    checked_at      = DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['component', '-checked_at'])]
```

### 7.2 ERD Addition

```
┌──────────────────┐          ┌────────────────────────┐
│     Tenant       │──── 1:1 ─│    TenantConfig        │
│ + contact_email  │          │ security, branding, AI  │
│ + trial_ends_at  │          └────────────────────────┘
│ + data_region    │
│ + deleted_at     │──── 1:N ─┌────────────────────────┐
└──────┬───────────┘          │  TenantFeatureFlag     │
       │                       │ tenant, feature, enabled│
       │                       └───────────┬────────────┘
       │    ┌──────────────────┐           │
       │    │   FeatureFlag    │───────────┘
       │    │ key, name, default│
       │    └──────────┬───────┘
       │               │
       │    ┌──────────┴───────┐
       │    │ PlanFeatureGate  │
       │    │ plan, feature    │
       │    └──────────────────┘
       │
       ├──── 1:N ─┌────────────────────────┐
       │           │   BillingEvent         │
       │           │ type, amount, stripe_id │
       │           └────────────────────────┘
       │
       └──── 1:N ─┌────────────────────────┐
                   │     Invoice            │
                   │ number, total, status   │
                   └────────────────────────┘
```

---

## 8. API Design

### 8.1 Platform Owner Endpoints (enhanced)

| Endpoint                                     | Method           | Purpose                                        |
| -------------------------------------------- | ---------------- | ---------------------------------------------- |
| `/api/platform/overview/`                    | GET              | Dashboard stats (enhanced with trends)         |
| `/api/platform/tenants/`                     | GET/POST         | List/create tenants                            |
| `/api/platform/tenants/{id}/`                | GET/PATCH/DELETE | Tenant detail/update/soft-delete               |
| `/api/platform/tenants/{id}/config/`         | GET/PUT          | Tenant-specific config overrides               |
| `/api/platform/tenants/{id}/usage/`          | GET              | Detailed usage metrics for tenant              |
| `/api/platform/tenants/{id}/invoices/`       | GET              | Billing history and invoices                   |
| `/api/platform/subscriptions/plans/`         | GET/POST         | Manage subscription plans                      |
| `/api/platform/subscriptions/plans/{id}/`    | PATCH/DELETE     | Update/delete plan                             |
| `/api/platform/feature-flags/`               | GET/POST         | List/create feature flags                      |
| `/api/platform/feature-flags/{key}/`         | PATCH            | Update feature flag                            |
| `/api/platform/feature-flags/{key}/tenants/` | GET/POST         | Per-tenant overrides for flag                  |
| `/api/platform/health/`                      | GET              | System health (current)                        |
| `/api/platform/health/history/`              | GET              | Health check history / uptime                  |
| `/api/platform/analytics/`                   | GET              | Platform-wide analytics (enhanced)             |
| `/api/platform/audit-logs/`                  | GET              | System audit logs (enhanced filters)           |
| `/api/platform/ai-config/`                   | GET/PUT          | Platform AI provider config                    |
| `/api/platform/ai-config/tenant/{id}/`       | GET/PUT          | Per-tenant AI config override                  |
| `/api/platform/support/`                     | GET              | All support tickets (enhanced filters/actions) |
| `/api/platform/support/{id}/`                | PATCH            | Update ticket status/assignment                |
| `/api/platform/billing/events/`              | GET              | Billing event ledger                           |
| `/api/platform/billing/webhook/`             | POST             | Stripe webhook handler                         |

### 8.2 Tenant Self-Service Endpoints (NEW)

| Endpoint                            | Method  | Auth  | Purpose                               |
| ----------------------------------- | ------- | ----- | ------------------------------------- |
| `/api/tenant/settings/`             | GET/PUT | Admin | View/update tenant settings           |
| `/api/tenant/subscription/`         | GET     | Admin | View current subscription             |
| `/api/tenant/subscription/upgrade/` | POST    | Admin | Initiate plan upgrade                 |
| `/api/tenant/usage/`                | GET     | Admin | Usage dashboard for tenant admin      |
| `/api/tenant/features/`             | GET     | Auth  | List available features for tenant    |
| `/api/tenant/export-data/`          | POST    | Admin | Request data export (GDPR compliance) |

---

## 9. Security Design

### 9.1 Threat Model

| Threat                        | Mitigation                                                      |
| ----------------------------- | --------------------------------------------------------------- |
| Tenant data cross-leakage     | Middleware tenant FK enforcement on every query                 |
| Platform owner impersonation  | IsPlatformOwner = is_superuser + tenant is None                 |
| Billing fraud                 | Stripe webhooks with signature verification                     |
| Feature flag bypass           | Server-side enforcement only, never trust client flags          |
| Config injection              | Validate all TenantConfig fields, sanitize custom domain        |
| Quota bypass                  | Redis atomic counters, double-check in DB on write              |
| API key exposure              | Field-level encryption for stored API keys, masked in responses |
| Tenant deletion data recovery | Soft delete + retention period + encrypted backups              |

### 9.2 API Key Security

```
Storage: AES-256-GCM encrypted at field level
    - Encryption key from environment variable (not in DB)
    - Key rotation: re-encrypt all keys on rotation

Display: Masked in all API responses
    - Full key shown ONCE at creation time
    - Subsequent reads show: sk-abc1***yz

Per-tenant keys: Isolated — one tenant's key never visible to another
```

---

## 10. Scalability & Reliability Design

### 10.1 Performance Targets

| Metric                     | Target         | Current |
| -------------------------- | -------------- | ------- |
| Platform overview latency  | < 500ms        | ~100ms  |
| Tenant list (1000 tenants) | < 1s           | ~300ms  |
| Health check latency       | < 2s           | ~1.5s   |
| Feature flag evaluation    | < 1ms (cached) | N/A     |
| Quota check per request    | < 2ms          | N/A     |
| Metering write             | < 500μs        | N/A     |
| Concurrent tenants         | 10,000+        | ~10     |

### 10.2 Metering Architecture

```
Request Flow:
    Request → QuotaCheck (read Redis counter) → Process → MeterEvent (write Redis)

Background:
    Celery beat (every 5 minutes) → Flush Redis counters to UsageMetrics DB

Redis Keys:
    meter:{tenant_id}:queries:{YYYY-MM-DD}     → INCR on each query
    meter:{tenant_id}:tokens:{YYYY-MM-DD}      → INCRBY token_count
    meter:{tenant_id}:storage_bytes             → SET on upload/delete

Benefits:
    - O(1) metering per request (Redis INCR)
    - No DB write in hot path
    - Eventual consistency to DB (5min delay acceptable)
    - Counter survives app restarts (Redis persistence)
```

### 10.3 Health Check Schedule

```
Celery beat: every 60 seconds
    → Check: DB, Redis, Qdrant, Celery
    → Write HealthCheckLog
    → If status changed from last check → trigger alert

Alert channels:
    - Email to platform owner
    - Webhook to Slack/PagerDuty
    - In-app notification (via NotificationService)
```

---

## 11. Frontend Design

### 11.1 Enhanced Platform Dashboard

```
Platform Dashboard (Redesigned):
┌──────────────────────────────────────────────────────────────┐
│  Platform Overview                               [Export PDF] │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │ 42     │ │ 1,234  │ │ 15,678 │ │ 98.5%  │ │ $4,200 │    │
│  │ Tenants│ │ Users  │ │ Queries│ │ Uptime │ │ MRR    │    │
│  │ +3 ↑   │ │ +12 ↑  │ │ +5% ↑  │ │ ●      │ │ +8% ↑  │    │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    │
│                                                               │
│  ┌──────────────────────┐  ┌──────────────────────────┐      │
│  │ Usage Trend (30d)    │  │ Health Status             │      │
│  │ [Chart ────────────] │  │ API Server     ● Healthy  │      │
│  │                      │  │ Database       ● Healthy  │      │
│  │                      │  │ Redis          ● Healthy  │      │
│  │                      │  │ Qdrant         ● Warning  │      │
│  │                      │  │ Celery         ● Healthy  │      │
│  └──────────────────────┘  └──────────────────────────┘      │
│                                                               │
│  Recent Activity / Alerts                                     │
│  ⚠ Tenant "Acme" approaching query quota (90%)               │
│  ✅ New tenant "GlobalCorp" onboarded                          │
│  ❌ Payment failed for "StartupXYZ"                            │
└──────────────────────────────────────────────────────────────┘
```

### 11.2 Feature Flag Management UI

```
Feature Flags Page:
┌────────────────────────────────────────────────────────────────┐
│  Feature Flags                                    [+ New Flag] │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ chat_sessions          [ON]   Basic ✅ Pro ✅ Enterprise ✅ │  │
│  │ "RAG chat functionality"      3 tenant overrides         │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ document_versioning    [ON]   Basic ❌ Pro ✅ Enterprise ✅ │  │
│  │ "Version history for docs"    1 tenant override          │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ sso_integration        [ON]   Basic ❌ Pro ❌ Enterprise ✅ │  │
│  │ "SAML/OIDC SSO"              0 tenant overrides         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 11.3 New Components

| Component            | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `MRRCard`            | Monthly Recurring Revenue with trend      |
| `UptimeIndicator`    | 30-day uptime bar with incident markers   |
| `UsageTrendChart`    | Multi-metric time series (Recharts)       |
| `FeatureFlagRow`     | Toggle + plan gates + override count      |
| `TenantConfigPanel`  | Per-tenant settings editor                |
| `BillingTimeline`    | Invoice and payment event history         |
| `QuotaUsageBar`      | Per-tenant quota consumption progress bar |
| `HealthHistoryChart` | Component uptime over time                |

---

## 12. Migration Strategy

### Phase 1: Tenant Config & Feature Flags

- Add new fields to Tenant model
- Create TenantConfig model (defaults for all existing tenants)
- Create FeatureFlag, PlanFeatureGate, TenantFeatureFlag models
- Create FeatureFlagService
- Create seed data for standard feature flags

### Phase 2: Metering & Quota Enforcement

- Implement MeteringService (Redis-based counters)
- Wire metering into RAG query pipeline and document upload
- Implement QuotaService with enforcement middleware
- Create Celery beat task for Redis → DB flush
- Replace manual `populate_analytics.py` with automatic metering

### Phase 3: Health Monitoring Enhancement

- Create HealthCheckLog model
- Implement scheduled health checks via Celery beat
- Build health history endpoint
- Add alerting service (email + webhook)
- Build uptime dashboard UI

### Phase 4: Billing Integration

- Create BillingEvent and Invoice models
- Integrate Stripe SDK
- Implement subscription lifecycle (trial → paid → cancel)
- Build Stripe webhook handler
- Create invoice generation service
- Build billing UI

### Phase 5: Self-Service Portal

- Build tenant admin settings page
- Build subscription management UI
- Implement data export (GDPR compliance)
- Add tenant onboarding wizard
- Build feature flag management UI for platform owner

---

## 13. Implementation Roadmap

| #   | Task                                        | Phase | Depends On | Priority |
| --- | ------------------------------------------- | ----- | ---------- | -------- |
| 1   | Add Tenant model fields (migration)         | 1     | —          | Critical |
| 2   | Create TenantConfig model + defaults        | 1     | 1          | Critical |
| 3   | Create FeatureFlag + gate + override models | 1     | —          | High     |
| 4   | Build FeatureFlagService                    | 1     | 3          | High     |
| 5   | Seed standard feature flags                 | 1     | 3          | High     |
| 6   | Build MeteringService (Redis counters)      | 2     | —          | Critical |
| 7   | Wire metering into RAG + upload pipelines   | 2     | 6          | Critical |
| 8   | Build QuotaService + QuotaMiddleware        | 2     | 6          | Critical |
| 9   | Celery beat: Redis → DB metric flush        | 2     | 6          | High     |
| 10  | Deprecate manual populate_analytics.py      | 2     | 9          | Medium   |
| 11  | Create HealthCheckLog model                 | 3     | —          | High     |
| 12  | Celery beat: scheduled health checks        | 3     | 11         | High     |
| 13  | Health history API endpoint                 | 3     | 12         | High     |
| 14  | Alert dispatcher (email + webhook)          | 3     | 12         | Medium   |
| 15  | Frontend: uptime dashboard                  | 3     | 13         | Medium   |
| 16  | Create BillingEvent + Invoice models        | 4     | —          | High     |
| 17  | Stripe SDK integration                      | 4     | 16         | High     |
| 18  | Subscription lifecycle service              | 4     | 17         | High     |
| 19  | Stripe webhook handler                      | 4     | 17         | High     |
| 20  | Invoice generation service                  | 4     | 16         | Medium   |
| 21  | Frontend: billing dashboard                 | 4     | 20         | Medium   |
| 22  | Tenant admin settings page                  | 5     | 2          | High     |
| 23  | Subscription management UI                  | 5     | 18         | High     |
| 24  | Data export service (GDPR)                  | 5     | —          | Medium   |
| 25  | Tenant onboarding wizard                    | 5     | 2          | Medium   |
| 26  | Feature flag management UI                  | 5     | 4          | Medium   |

---

> **Status:** Analysis complete. Implementation ON HOLD until design review and approval.
