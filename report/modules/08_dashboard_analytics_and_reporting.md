# Dashboard, Analytics & Reporting — Complete Analysis & System Design

**Date:** 10 March 2026
**Scope:** Full analysis of user dashboards, platform analytics, usage metrics, and reporting infrastructure
**Principle:** Analyse current → Identify gaps → Design enterprise-grade analytics and BI platform

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

The analytics module spans **7+ files** across backend and frontend:

| Layer                 | Files                                                                 | Purpose                                   |
| --------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| **Models**            | `core/models.py` (UsageMetrics)                                       | Daily per-tenant aggregated usage metrics |
| **Platform Views**    | `api/views/platform_owner.py` (platform_overview, platform_analytics) | Platform stats + analytics API            |
| **Dashboard Views**   | `api/views/chat.py` or dedicated view (dashboard endpoint)            | Per-user org dashboard stats              |
| **Scripts**           | `scripts/populate_analytics.py`                                       | Seed fake UsageMetrics for development    |
| **Frontend Pages**    | `Dashboard.tsx`, `PlatformDashboard.tsx`, `PlatformAnalytics.tsx`     | User + platform owner dashboards          |
| **Frontend Services** | `dashboard.service.ts`, `platformOwner.service.ts`                    | API wrappers for dashboard data           |

### 1.2 Current Analytics Architecture

```
Two analytics layers:
    ┌────────────────────────────────┐    ┌──────────────────────────────────┐
    │  Org Dashboard (per-user)      │    │  Platform Analytics              │
    │  Dashboard.tsx                  │    │  PlatformDashboard.tsx           │
    │  • My documents count           │    │  PlatformAnalytics.tsx           │
    │  • Active users in org          │    │  • Cross-tenant aggregates       │
    │  • My queries today             │    │  • Daily usage time series       │
    │  • Storage used                 │    │  • System health status          │
    │  • Recent activity feed         │    │  • Tenant breakdown              │
    └────────────────────────────────┘    └──────────────────────────────────┘
                                                         │
                                                ┌────────┴─────────┐
                                                │   UsageMetrics   │
                                                │  daily per-tenant│
                                                │  manually seeded │
                                                └──────────────────┘
```

---

## 2. Component Deep-Dive

### 2.1 UsageMetrics Model

**Current Fields:**

- `tenant` (FK), `date` (DateField), unique_together = [tenant, date]
- Query metrics: `queries_count`, `failed_queries_count`, `avg_response_time_ms`
- Token usage: `tokens_used`, `embedding_tokens`, `completion_tokens`
- Storage: `storage_used_bytes`, `documents_count`
- Activity: `active_users_count`

**Indexes:** tenant+date (composite), date (standalone)

**Strengths:**

- Comprehensive metric dimensions (queries, tokens, storage, users)
- Per-tenant per-day granularity
- Proper uniqueness constraint prevents duplicates

**Issues:**

- Metrics NOT automatically collected — manually seeded via `populate_analytics.py`
- No real-time metric updates (no increment on each query)
- No per-user breakdown (only tenant-level)
- No per-department breakdown
- No per-document analytics (most queried, least used)
- No hourly granularity (only daily)
- No cost metrics (dollar amount per query/token)
- No RAG quality metrics (relevance scores, user satisfaction)
- No latency percentiles (only average)

### 2.2 Org Dashboard (Dashboard.tsx)

**Current Features:**

- 4 stat cards: Documents Available, Active Users, My Queries Today, Storage Used
- Recent Activity feed (actor, action, resource, timestamp)
- Quick Actions: Upload Document, Start Chat, Manage Users, View Documents
- Organisation Summary: total docs, team members, storage

**Issues:**

- No charts or trend visualizations
- No time range selector
- No department-level breakdown
- No personal analytics (my most asked topics, query history)
- Recent activity is generic (no category filters)
- No export capability

### 2.3 Platform Analytics (PlatformAnalytics.tsx)

**Current Features:**

- Tenant filter (SearchableSelect for specific tenant)
- Time range selector: 7d, 30d, 90d, custom date range
- Summary cards: Total Queries, Avg Latency, Active Users, Tokens Used
- 4 Recharts visualizations:
  - Inference Volume (AreaChart)
  - API Latency (LineChart)
  - Daily Active Users (BarChart)
  - Token Consumption (AreaChart)

**Strengths:**

- Multi-chart layout with proper Recharts integration
- Flexible date range filtering
- Per-tenant drill-down capability
- Responsive chart rendering

**Issues:**

- Data sourced from manually seeded UsageMetrics (not real)
- No comparative analytics (tenant A vs B)
- No anomaly highlighting in charts
- No export (PDF/CSV)
- No alerting thresholds on metrics
- No forecasting / projections
- No cost/revenue analytics
- Static chart types (no drill-down interaction)

### 2.4 Platform Dashboard (PlatformDashboard.tsx)

**Current Features:**

- Stat pairs: Total Tenants + Total Users, Active Sessions + Storage Used
- Usage Today: Queries, Failed, Avg Response Time, Tokens
- Tenant Status breakdown: Active/Suspended/Total
- System Status: Documents Indexed, Embedding Queue, Active Workers
- Top 5 tenants list with user/doc counts
- System health monitoring (5 components with status dots)

**Strengths:**

- Comprehensive overview in single view
- Real-time system health integration
- Tenant ranking by activity

**Issues:**

- "Active Sessions" is likely hardcoded/estimated (no session tracking)
- No trend indicators (up/down arrows with delta)
- No alerts integration
- No revenue metrics (MRR, ARR, churn)

### 2.5 Data Population

**Current:** `scripts/populate_analytics.py`

- Seeds 90 days of fake UsageMetrics per tenant
- Realistic patterns: weekend drops, increasing trend, proportional failures
- Idempotent (skips existing dates)

**Critical Issue:** This is the ONLY way metrics exist — zero real data collection.

---

## 3. SWOT Analysis

### Strengths (6)

1. **Multi-level dashboards** — org-level and platform-level views
2. **Recharts integration** — professional chart visualizations
3. **Flexible filtering** — tenant selector + date range on analytics
4. **Usage metrics model** — well-structured daily aggregation schema
5. **System health integration** — live component status in dashboard
6. **Responsive layout** — stat cards + charts render well on different screens

### Weaknesses (14)

1. No automatic metric collection (manual seed only)
2. No real-time metrics (no live counters)
3. No per-user analytics
4. No per-department analytics
5. No per-document analytics
6. No cost/billing analytics
7. No RAG quality metrics (relevance, satisfaction)
8. No alerting on metric thresholds
9. No forecasting / trend projections
10. No data export (PDF/CSV)
11. No comparative analytics (A vs B)
12. Only daily granularity (no hourly)
13. Org dashboard has no charts
14. No customizable dashboard (widgets, layout)

### Opportunities (7)

1. Real-time metric streaming via WebSocket
2. AI-powered anomaly detection on usage patterns
3. Predictive analytics (forecast usage, suggest plan upgrades)
4. Cost attribution per tenant/user/query
5. Embeddable analytics (tenants embed dashboards in their apps)
6. Custom report builder (drag-and-drop)
7. Scheduled report delivery (email PDF weekly)

### Threats (3)

1. Decision-making on fake data — no real metrics collected
2. Tenant churn undetected without engagement analytics
3. Cost overruns without usage-to-billing pipeline

---

## 4. Gap Analysis — Current vs Enterprise-Grade

| Capability                  | Current State            | Enterprise Target                  | Gap    |
| --------------------------- | ------------------------ | ---------------------------------- | ------ |
| Automatic metric collection | ❌ Manual seed only      | ✅ Auto-collect on every operation | Large  |
| Real-time metrics           | ❌ None                  | ✅ Live counters + streaming       | Large  |
| Org dashboard               | ⚠️ Basic stat cards      | ✅ Charts + trends + drill-down    | Medium |
| Platform analytics          | ✅ Recharts 4-chart view | ✅ Enhanced with more dimensions   | Small  |
| Per-user analytics          | ❌ None                  | ✅ Personal query history + stats  | Medium |
| Per-department analytics    | ❌ None                  | ✅ Department-level breakdown      | Medium |
| Cost analytics              | ❌ None                  | ✅ Cost per query/token/tenant     | Large  |
| RAG quality metrics         | ❌ None                  | ✅ Relevance + satisfaction scores | Large  |
| Alerting                    | ❌ None                  | ✅ Threshold-based alerts          | Medium |
| Export/reporting            | ❌ None                  | ✅ PDF/CSV + scheduled delivery    | Medium |
| Forecasting                 | ❌ None                  | ✅ Usage projections               | Medium |
| Customizable dashboards     | ❌ Fixed layout          | ✅ Widget-based configurable       | Medium |

---

## 5. Advanced System Design

### 5.1 Design Principles

1. **Measure everything** — automatic instrumentation at every service boundary
2. **Multi-granularity** — minute, hour, day, week, month aggregations
3. **Zero data loss** — Redis buffering + async persistence
4. **Self-service** — users build their own reports
5. **Actionable** — every metric links to an action or recommendation

### 5.2 Metric Collection Architecture

```
                    Request enters system
                           │
              ┌────────────┼────────────────┐
              │            │                │
        ┌─────▼────┐ ┌────▼─────┐  ┌──────▼──────┐
        │ API Layer│ │ RAG Engine│  │ Doc Pipeline│
        │ (views)  │ │ (services)│  │ (tasks)     │
        └─────┬────┘ └────┬─────┘  └──────┬──────┘
              │            │                │
              └────────────┼────────────────┘
                           │
                    MetricCollector
                    (lightweight, sync)
                           │
                    ┌──────▼──────┐
                    │   Redis     │
                    │ INCR/INCRBY │
                    │ per-key     │
                    └──────┬──────┘
                           │
                    Celery beat (5 min)
                           │
                    ┌──────▼──────┐
                    │ Aggregator  │
                    │ Redis → DB  │
                    │ (minute→hour│
                    │  hour→day)  │
                    └─────────────┘

Redis Keys:
    metric:{tenant}:{user}:queries:{minute_ts}      → INCR
    metric:{tenant}:{user}:tokens:{minute_ts}        → INCRBY count
    metric:{tenant}:{user}:latency:{minute_ts}       → LPUSH ms (for percentiles)
    metric:{tenant}:storage_bytes                     → SET
    metric:{tenant}:{user}:active:{date}              → SADD user_id
```

### 5.3 Metric Dimensions

```
Metric Hierarchy:
    Platform Level
    ├── Total queries, tokens, latency, users, storage, revenue
    │
    └── Per Tenant
        ├── Queries, tokens, latency, users, storage, cost
        │
        ├── Per Department
        │   ├── Queries, tokens, active users
        │   │
        │   └── Per User
        │       ├── Queries, tokens, session time
        │       └── Per Document
        │           └── Query count, relevance score
        │
        └── Per Time
            ├── Minute (raw — 24h retention)
            ├── Hour (aggregated — 30d retention)
            ├── Day (aggregated — 1yr retention)
            └── Month (aggregated — permanent)
```

### 5.4 RAG Quality Analytics

```
Per RAG query, capture:
    ├── query_text (hashed for privacy, unless opted in)
    ├── response_latency_ms
    ├── chunks_retrieved (count)
    ├── chunk_relevance_scores (array of floats)
    ├── avg_relevance_score
    ├── model_used (GPT-4, Claude, etc.)
    ├── tokens_in + tokens_out
    ├── user_feedback (thumbs up/down — optional)
    └── follow_up_count (did user re-ask?)

Aggregated metrics:
    ├── Mean relevance score per day
    ├── User satisfaction rate (% positive feedback)
    ├── Query success rate (% with relevance > threshold)
    ├── Average retrieval count
    ├── Re-ask rate (% of queries with follow-up = poor answer)
    └── Top query topics (tokenized, clustered)
```

### 5.5 Cost Attribution

```
Cost model:
    ├── LLM cost: provider_rate × (tokens_in + tokens_out)
    ├── Embedding cost: embedding_rate × embedding_tokens
    ├── Storage cost: storage_rate × storage_bytes / month
    ├── Compute cost: per-query fixed overhead
    └── Total = LLM + Embedding + Storage + Compute

Cost allocation:
    Per Query → User → Department → Tenant → Platform Total

    Enables:
    ├── Tenant billing accuracy (cost + margin = price)
    ├── Department cost center reporting
    ├── User cost awareness
    └── Plan profitability analysis (revenue - cost per plan tier)
```

### 5.6 Alerting System

```
Metric Alert Rules:
    ┌──────────────────────────────┬────────────────────────┐
    │ Alert                        │ Condition              │
    ├──────────────────────────────┼────────────────────────┤
    │ High error rate              │ failed_queries > 10%   │
    │ Latency degradation          │ p95_latency > 2000ms   │
    │ Quota approaching            │ usage > 80% of limit   │
    │ Storage near limit           │ storage > 90% of plan  │
    │ Unusual activity spike       │ queries > 3x average   │
    │ Low engagement               │ active_users < 10%     │
    │ Token burn rate               │ tokens > daily budget  │
    └──────────────────────────────┴────────────────────────┘

Alert flow:
    Metric aggregation → Rule evaluation (Celery beat) → Alert created →
    Notification dispatched (in-app + email for admins)
```

---

## 6. Architecture Design

### 6.1 Module Structure

```
apps/
  analytics/                      # NEW dedicated analytics app
    __init__.py
    models.py                     # MetricMinute, MetricHour, MetricDay, MetricMonth,
                                  # QueryAnalytics, CostRecord, MetricAlert, AlertRule
    services/
      __init__.py
      collector.py                # MetricCollector (sync, lightweight, Redis INCR)
      aggregator.py               # Celery tasks: minute→hour→day→month rollups
      query_analytics.py          # RAG quality metric capture
      cost_service.py             # Cost calculation + attribution
      alert_service.py            # Threshold evaluation + alert creation
      report_service.py           # Report generation (PDF/CSV)
      forecast_service.py         # Simple linear projection
    views/
      __init__.py
      org_dashboard.py            # Enhanced org dashboard with charts
      personal_analytics.py       # Per-user stats
      platform_analytics.py       # Platform-wide analytics
      reports.py                  # Report generation endpoints
      alerts.py                   # Metric alert management
    admin.py
    urls.py
    migrations/
```

### 6.2 Dependency Graph

```
analytics module
    ├── core.models (User, Tenant, Department)
    ├── rag.services (query event hooks)
    ├── documents.services (upload/access event hooks)
    ├── notifications module (for metric alerts)
    ├── django.core.cache (Redis — counters, sorted sets)
    ├── celery (aggregation, report generation)
    └── External:
        ├── recharts (frontend charts)
        ├── reportlab / weasyprint (PDF generation)
        └── numpy (optional: forecasting)
```

---

## 7. Data Model Design

### 7.1 Models

```python
# ── MetricMinute (raw, 24h retention) ──────────────────
class MetricMinute(models.Model):
    tenant           = ForeignKey(Tenant, CASCADE)
    user             = ForeignKey(User, SET_NULL, null=True)
    minute           = DateTimeField()                      # Truncated to minute
    queries_count    = IntegerField(default=0)
    failed_count     = IntegerField(default=0)
    tokens_in        = IntegerField(default=0)
    tokens_out       = IntegerField(default=0)
    latency_sum_ms   = IntegerField(default=0)             # For avg calculation
    latency_max_ms   = IntegerField(default=0)

    class Meta:
        unique_together = [['tenant', 'user', 'minute']]
        indexes = [models.Index(fields=['tenant', 'minute'])]

# ── MetricHour (aggregated, 30d) ───────────────────────
class MetricHour(models.Model):
    tenant           = ForeignKey(Tenant, CASCADE)
    hour             = DateTimeField()
    queries_count    = IntegerField(default=0)
    failed_count     = IntegerField(default=0)
    tokens_used      = IntegerField(default=0)
    avg_latency_ms   = FloatField(default=0)
    p95_latency_ms   = FloatField(default=0)
    active_users     = IntegerField(default=0)
    cost_usd         = DecimalField(max_digits=10, decimal_places=4, default=0)

    class Meta:
        unique_together = [['tenant', 'hour']]

# ── MetricDay (existing UsageMetrics — ENHANCED) ──────
# Extend existing UsageMetrics with:
    p95_latency_ms   = FloatField(default=0)
    embedding_tokens = IntegerField(default=0)
    completion_tokens = IntegerField(default=0)
    cost_usd         = DecimalField(max_digits=10, decimal_places=4, default=0)
    departments_active = IntegerField(default=0)

# ── MetricMonth (permanent) ────────────────────────────
class MetricMonth(models.Model):
    tenant           = ForeignKey(Tenant, CASCADE)
    month            = DateField()                          # First of month
    queries_count    = IntegerField(default=0)
    failed_count     = IntegerField(default=0)
    tokens_used      = IntegerField(default=0)
    avg_latency_ms   = FloatField(default=0)
    active_users     = IntegerField(default=0)
    storage_bytes    = BigIntegerField(default=0)
    documents_count  = IntegerField(default=0)
    cost_usd         = DecimalField(max_digits=10, decimal_places=4, default=0)
    revenue_usd      = DecimalField(max_digits=10, decimal_places=4, default=0)

    class Meta:
        unique_together = [['tenant', 'month']]

# ── QueryAnalytics (per-RAG-query) ─────────────────────
class QueryAnalytics(models.Model):
    id               = UUIDField(primary_key=True)
    tenant           = ForeignKey(Tenant, CASCADE)
    user             = ForeignKey(User, SET_NULL, null=True)
    session          = ForeignKey('rag.ChatSession', SET_NULL, null=True)
    query_hash       = CharField(max_length=64)              # SHA-256 of query text (privacy)
    latency_ms       = IntegerField()
    chunks_retrieved = IntegerField()
    avg_relevance    = FloatField(null=True)
    model_used       = CharField(max_length=100)
    tokens_in        = IntegerField()
    tokens_out       = IntegerField()
    cost_usd         = DecimalField(max_digits=8, decimal_places=6)
    user_feedback    = CharField(max_length=10, blank=True)  # positive/negative/none
    is_follow_up     = BooleanField(default=False)
    created_at       = DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['tenant', '-created_at']),
            models.Index(fields=['user', '-created_at']),
        ]

# ── CostRate ───────────────────────────────────────────
class CostRate(models.Model):
    """Configurable cost rates for billing accuracy."""
    provider         = CharField(max_length=50)              # openai, anthropic, ...
    model            = CharField(max_length=100)             # gpt-4, claude-3
    input_cost_per_1k = DecimalField(max_digits=8, decimal_places=6)
    output_cost_per_1k = DecimalField(max_digits=8, decimal_places=6)
    embedding_cost_per_1k = DecimalField(max_digits=8, decimal_places=6, default=0)
    effective_from   = DateField()
    effective_to     = DateField(null=True)

# ── AlertRule ──────────────────────────────────────────
class AlertRule(models.Model):
    """Configurable metric alert thresholds."""
    SCOPES = [('platform','Platform'), ('tenant','Tenant')]
    name             = CharField(max_length=200)
    metric           = CharField(max_length=50)              # error_rate, p95_latency, quota_usage
    condition        = CharField(max_length=10)              # gt, lt, gte, lte
    threshold        = FloatField()
    scope            = CharField(max_length=10, choices=SCOPES)
    tenant           = ForeignKey(Tenant, SET_NULL, null=True, blank=True)
    notification_channels = JSONField(default=list)          # ['in_app', 'email']
    is_active        = BooleanField(default=True)
    cooldown_minutes = IntegerField(default=60)

# ── MetricAlert (instances of triggered alerts) ────────
class MetricAlert(models.Model):
    STATUSES = [('open','Open'), ('acknowledged','Acknowledged'), ('resolved','Resolved')]
    rule             = ForeignKey(AlertRule, CASCADE)
    tenant           = ForeignKey(Tenant, SET_NULL, null=True, blank=True)
    metric_value     = FloatField()
    threshold_value  = FloatField()
    status           = CharField(max_length=20, default='open')
    resolved_at      = DateTimeField(null=True)
    created_at       = DateTimeField(auto_now_add=True)
```

### 7.2 ERD

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ MetricMinute │───→│ MetricHour   │───→│ MetricDay    │───→│ MetricMonth  │
│ per-user     │    │ per-tenant   │    │ per-tenant   │    │ per-tenant   │
│ 24h retention│    │ 30d retention│    │ 1yr retention│    │ permanent    │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘

┌──────────────────┐    ┌──────────────┐
│ QueryAnalytics   │    │  CostRate    │
│ per-RAG-query    │    │ per-model    │
│ relevance, cost  │    │ pricing      │
└──────────────────┘    └──────────────┘

┌──────────────┐    ┌──────────────┐
│  AlertRule   │───→│ MetricAlert  │
│ threshold    │    │ triggered    │
│ condition    │    │ instance     │
└──────────────┘    └──────────────┘
```

---

## 8. API Design

### 8.1 Org Dashboard Endpoints

| Endpoint                          | Method | Auth  | Purpose                          |
| --------------------------------- | ------ | ----- | -------------------------------- |
| `/api/dashboard/`                 | GET    | Auth  | Org dashboard stats (enhanced)   |
| `/api/dashboard/trends/`          | GET    | Auth  | Org usage trends (7d/30d charts) |
| `/api/dashboard/my-analytics/`    | GET    | Auth  | Personal usage stats             |
| `/api/dashboard/department/{id}/` | GET    | Admin | Department-level analytics       |

### 8.2 Platform Analytics Endpoints

| Endpoint                                   | Method | Auth     | Purpose                            |
| ------------------------------------------ | ------ | -------- | ---------------------------------- |
| `/api/platform/analytics/`                 | GET    | Platform | Platform-wide analytics (enhanced) |
| `/api/platform/analytics/tenants/compare/` | GET    | Platform | Comparative tenant analytics       |
| `/api/platform/analytics/revenue/`         | GET    | Platform | Revenue and cost analytics         |
| `/api/platform/analytics/quality/`         | GET    | Platform | RAG quality metrics                |
| `/api/platform/analytics/forecast/`        | GET    | Platform | Usage projections                  |

### 8.3 Report Endpoints

| Endpoint                      | Method   | Auth  | Purpose                   |
| ----------------------------- | -------- | ----- | ------------------------- |
| `/api/reports/generate/`      | POST     | Admin | Generate report (PDF/CSV) |
| `/api/reports/scheduled/`     | GET/POST | Admin | Manage scheduled reports  |
| `/api/reports/{id}/download/` | GET      | Admin | Download generated report |

### 8.4 Alert Endpoints

| Endpoint                                  | Method       | Auth  | Purpose                  |
| ----------------------------------------- | ------------ | ----- | ------------------------ |
| `/api/analytics/alerts/rules/`            | GET/POST     | Admin | Manage alert rules       |
| `/api/analytics/alerts/rules/{id}/`       | PATCH/DELETE | Admin | Update/delete alert rule |
| `/api/analytics/alerts/`                  | GET          | Admin | List triggered alerts    |
| `/api/analytics/alerts/{id}/acknowledge/` | POST         | Admin | Acknowledge alert        |
| `/api/analytics/alerts/{id}/resolve/`     | POST         | Admin | Resolve alert            |

---

## 9. Security Design

### 9.1 Data Privacy

| Concern                      | Mitigation                                                    |
| ---------------------------- | ------------------------------------------------------------- |
| Query text in QueryAnalytics | Store SHA-256 hash only (unless tenant opts into full text)   |
| Per-user tracking            | Aggregatable but user-level data only visible to admin + self |
| Cross-tenant data leakage    | All queries filtered by tenant FK                             |
| Cost rates exposure          | CostRate visible to platform owner only                       |
| Revenue data                 | Platform owner only, never exposed to tenants                 |
| Report downloads             | Signed URLs with expiry (15 minutes)                          |
| PII in exports               | User IDs only, no email/name in CSV exports by default        |

### 9.2 Access Control Matrix

| Resource             | User    | Tenant Admin  | Platform Owner |
| -------------------- | ------- | ------------- | -------------- |
| Personal analytics   | ✅ Own  | ✅ Any user   | ✅ Any         |
| Org dashboard        | ✅ View | ✅ View       | ✅ View        |
| Department analytics | ❌      | ✅ Own tenant | ✅ Any         |
| Tenant analytics     | ❌      | ✅ Own tenant | ✅ Any         |
| Platform analytics   | ❌      | ❌            | ✅             |
| Revenue/cost         | ❌      | ❌            | ✅             |
| RAG quality          | ❌      | ✅ Own tenant | ✅ Any         |
| Alert rules          | ❌      | ✅ Own tenant | ✅ Any         |
| Reports              | ❌      | ✅ Own tenant | ✅ Any         |

---

## 10. Scalability & Reliability Design

### 10.1 Performance Targets

| Metric                      | Target             | Current |
| --------------------------- | ------------------ | ------- |
| Metric collection overhead  | < 1ms per request  | N/A     |
| Dashboard query latency     | < 300ms            | ~200ms  |
| Analytics time-series query | < 500ms            | ~300ms  |
| Report generation (30d PDF) | < 10s              | N/A     |
| Minute aggregation flush    | < 2s for 1000 keys | N/A     |

### 10.2 Multi-Granularity Aggregation Pipeline

```
Celery beat schedule:

├── Every 5 minutes: flush_minute_metrics()
│   Redis counters → MetricMinute DB rows
│   Clear Redis keys for flushed minutes
│
├── Every hour (at :05): aggregate_hourly_metrics()
│   MetricMinute (last hour) → MetricHour (SUM/AVG)
│
├── Every day (at 00:15): aggregate_daily_metrics()
│   MetricHour (last 24h) → UsageMetrics / MetricDay (SUM/AVG/P95)
│
├── 1st of month (at 01:00): aggregate_monthly_metrics()
│   MetricDay (last month) → MetricMonth (SUM/AVG)
│
├── Every day (at 03:00): cleanup_old_metrics()
│   Delete MetricMinute > 24h
│   Delete MetricHour > 30d
│   Delete MetricDay > 365d (configurable per tenant)
│
└── Every hour: evaluate_alert_rules()
    Check all active AlertRules against latest metrics
    Create MetricAlert + notify if threshold breached
```

### 10.3 Chart Query Optimization

```
Frontend requests: "Show me 30-day query trend"

Query strategy:
    ├── If range ≤ 1 day → query MetricHour (24 data points)
    ├── If range ≤ 30 days → query MetricDay (30 data points)
    ├── If range ≤ 365 days → query MetricDay (365 data points)
    └── If range > 365 days → query MetricMonth

    Always return ≤ 366 data points per chart
    Pre-aggregate comparison queries server-side

Cache strategy:
    Dashboard stats → Redis, 60s TTL
    Analytics charts → Redis, 5min TTL (keyed by tenant + date range)
    Reports → S3/file storage, permanent until regenerated
```

---

## 11. Frontend Design

### 11.1 Enhanced Org Dashboard

```
Organisation Dashboard (Redesigned):
┌──────────────────────────────────────────────────────────────┐
│  Dashboard                                      Good morning! │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐               │
│  │ 156    │ │ 42     │ │ 23     │ │ 4.2 GB │               │
│  │ Docs   │ │ Users  │ │ My Q.  │ │ Storage│               │
│  │ +3 ↑   │ │ +1 ↑   │ │ avg:18 │ │ 62% ▮▮▮│               │
│  └────────┘ └────────┘ └────────┘ └────────┘               │
│                                                               │
│  ┌─────────────────────────── 30d ──────────────────────────┐│
│  │  Usage Trend                                              ││
│  │  ┌──────────────────────────────────────────────────────┐││
│  │  │  📈 Queries ────  Tokens ----                        │││
│  │  │  [Area Chart with dual Y axis]                       │││
│  │  └──────────────────────────────────────────────────────┘││
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌──────────────────┐  ┌──────────────────────────────────┐  │
│  │ Recent Activity   │  │ Quick Actions                    │  │
│  │ • Alice uploaded..│  │ [📤 Upload] [💬 Chat]            │  │
│  │ • Bob queried... │  │ [👥 Users]  [📊 Reports]          │  │
│  │ • Carol deleted..│  │                                   │  │
│  └──────────────────┘  └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 11.2 Personal Analytics Page (NEW)

```
My Analytics:
┌──────────────────────────────────────────────────────────────┐
│  My Usage Analytics                        [Last 30 days ▾]  │
│                                                               │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐               │
│  │ 127    │ │ 89%    │ │ 340ms  │ │ 45K    │               │
│  │ Queries│ │ Success│ │ Avg Lat│ │ Tokens │               │
│  └────────┘ └────────┘ └────────┘ └────────┘               │
│                                                               │
│  My Query History            │  Most Queried Topics           │
│  ┌────────────────────────┐  │  ┌────────────────────────┐   │
│  │ [Line Chart: daily]   │  │  │  1. Budget reports (23) │   │
│  │                        │  │  │  2. HR policies (18)    │   │
│  │                        │  │  │  3. Q4 targets (12)     │   │
│  └────────────────────────┘  │  └────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 11.3 Enhanced Platform Analytics

```
Platform Analytics (Enhanced):
┌──────────────────────────────────────────────────────────────┐
│  Platform Analytics                                           │
│  Tenant: [All ▾]  Range: [30 days ▾]  [ Compare mode ☐ ]    │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │
│  │ 45.2K  │ │ 98.5%  │ │ 280ms  │ │ 2.1M   │ │ $1,420 │   │
│  │ Queries│ │ Success│ │ P95 Lat│ │ Tokens │ │ Cost   │   │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘   │
│                                                               │
│  [Queries] [Latency] [Users] [Tokens] [Cost] [Quality]      │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ [Selected Chart — full width with interactive tooltip]    ││
│  │ [Supports: area, line, bar, stacked bar]                  ││
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  Tenant Breakdown:                                            │
│  ┌─────────────┬─────────┬────────┬────────┬────────┐       │
│  │ Tenant      │ Queries │ Users  │ Tokens │ Cost   │       │
│  ├─────────────┼─────────┼────────┼────────┼────────┤       │
│  │ Acme Corp   │ 12,300  │ 42     │ 890K   │ $456   │       │
│  │ GlobalTech  │ 8,900   │ 31     │ 520K   │ $312   │       │
│  │ StartupXYZ  │ 3,200   │ 8      │ 180K   │ $98    │       │
│  └─────────────┴─────────┴────────┴────────┴────────┘       │
│                                                               │
│  [Export PDF] [Export CSV] [Schedule Report]                  │
└──────────────────────────────────────────────────────────────┘
```

### 11.4 New Components

| Component            | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `MetricCard`         | Stat card with trend indicator and sparkline      |
| `TimeSeriesChart`    | Reusable Recharts wrapper with zoom + tooltip     |
| `TenantCompareChart` | Side-by-side tenant metric comparison             |
| `QueryHeatmap`       | Activity heatmap (day of week × hour of day)      |
| `CostBreakdownPie`   | Cost allocation pie/donut chart                   |
| `AlertBanner`        | Metric alert banner in dashboard                  |
| `ReportBuilder`      | Configure + generate custom reports               |
| `DateRangeSelector`  | Unified date range picker for all analytics views |

---

## 12. Migration Strategy

### Phase 1: Automatic Metric Collection

- Build MetricCollector service (Redis INCR)
- Wire into RAG query pipeline (count queries, tokens, latency)
- Wire into document upload pipeline (count uploads, storage)
- Create Celery beat task: flush Redis → MetricMinute
- Deprecate `scripts/populate_analytics.py` for production

### Phase 2: Aggregation Pipeline

- Create MetricHour, MetricMonth models
- Extend existing UsageMetrics with new fields (p95, cost, departments)
- Build hourly, daily, monthly aggregation Celery tasks
- Build cleanup task for old minute/hour data
- Verify data pipeline end-to-end

### Phase 3: Enhanced Dashboards

- Add usage trend chart to org dashboard
- Build personal analytics page
- Enhance platform analytics with new dimensions
- Add tenant breakdown table
- Add date range selector and comparison mode

### Phase 4: RAG Quality & Cost

- Create QueryAnalytics model
- Capture per-query analytics in RAG pipeline
- Create CostRate model + seed provider pricing
- Build cost attribution service
- Add cost and quality tabs to platform analytics

### Phase 5: Alerting & Reporting

- Create AlertRule and MetricAlert models
- Build alert evaluation Celery task
- Wire alerts into notification system
- Build report generation service (PDF/CSV)
- Build scheduled report delivery
- Build report management UI

---

## 13. Implementation Roadmap

| #   | Task                                        | Phase | Depends On | Priority |
| --- | ------------------------------------------- | ----- | ---------- | -------- |
| 1   | Build MetricCollector (Redis counters)      | 1     | —          | Critical |
| 2   | Wire collector into RAG pipeline            | 1     | 1          | Critical |
| 3   | Wire collector into document pipeline       | 1     | 1          | Critical |
| 4   | Celery: Redis → MetricMinute flush          | 1     | 1          | Critical |
| 5   | Create MetricHour + MetricMonth models      | 2     | —          | High     |
| 6   | Extend UsageMetrics (new fields)            | 2     | —          | High     |
| 7   | Build aggregation pipeline (hour→day→month) | 2     | 5, 6       | High     |
| 8   | Build cleanup task                          | 2     | 5          | Medium   |
| 9   | Add trend chart to org dashboard            | 3     | 7          | High     |
| 10  | Build personal analytics page               | 3     | 7          | Medium   |
| 11  | Enhance platform analytics UI               | 3     | 7          | Medium   |
| 12  | Add tenant breakdown table                  | 3     | 7          | Medium   |
| 13  | Create QueryAnalytics model                 | 4     | —          | High     |
| 14  | Capture per-query analytics in RAG          | 4     | 13         | High     |
| 15  | Create CostRate model + seed data           | 4     | —          | Medium   |
| 16  | Build cost attribution service              | 4     | 15         | Medium   |
| 17  | Add quality + cost tabs to analytics        | 4     | 14, 16     | Medium   |
| 18  | Create AlertRule + MetricAlert models       | 5     | —          | Medium   |
| 19  | Build alert evaluation Celery task          | 5     | 18, 7      | Medium   |
| 20  | Wire alerts → notifications                 | 5     | 19         | Medium   |
| 21  | Build report generation (PDF/CSV)           | 5     | 7          | Medium   |
| 22  | Build scheduled report delivery             | 5     | 21         | Low      |
| 23  | Build report management UI                  | 5     | 21         | Low      |

---

> **Status:** Analysis complete. Implementation ON HOLD until design review and approval.
