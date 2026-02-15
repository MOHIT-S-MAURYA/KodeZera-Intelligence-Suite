
We are now defining the **Super Admin (Platform Owner) Dashboard Requirements** for
**Kodezera Intelligence Suite**

Write this like a *system design + product requirement*, not UI imagination.

Goal:

> The Owner manages the PLATFORM, not the ORGANIZATION DATA.

The biggest rule:

⚠️ **Owner must never see tenant private documents or chat content unless explicitly granted emergency access.**

So we design a **Control Plane Dashboard**, not a data dashboard.

---

# Super Admin (Owner) Dashboard Specification

## 1. Purpose of Owner Dashboard

The Owner dashboard is used to:

* Operate the SaaS platform
* Manage tenants (organizations)
* Monitor platform health
* Control subscriptions & billing
* Configure AI usage policies
* Monitor security & abuse
* Audit system-level activities

It is **NOT** used to read company data.

---

# 2. What Owner MUST NOT See

The following data must be completely inaccessible:

* Tenant documents content
* Chat conversations
* Retrieved RAG context
* User personal files
* Internal company information
* Department structure details
* Employee queries

Even database access APIs must not expose it.

Owner only sees **metadata**, never content.

Example allowed:

> Tenant A performed 12,450 queries today

Example forbidden:

> Show queries asked by HR manager

---

# 3. Owner Dashboard Main Navigation

Sidebar (Platform Control Panel)

```
Overview
Tenants
Subscriptions & Billing
Usage Analytics
System Health
Security & Abuse Monitoring
AI Configuration
Global Permissions Policy
Audit Logs (System Level)
Support & Emergency Access
Settings
```

---

# 4. Owner Dashboard Pages (Detailed)

---

## 4.1 Overview Page (Platform Status)

Purpose: Quick health of entire SaaS.

### Widgets

1. Total Tenants
2. Active Tenants
3. Suspended Tenants
4. Total Users Across Platform
5. Queries Today
6. Documents Indexed Count
7. Average Response Time
8. Failed Queries
9. Embedding Queue Length
10. Active Workers

### Charts

* Queries per hour (line chart)
* Tenants growth (monthly)
* System load (CPU / memory from services)
* AI token usage

### What it must NOT show

No tenant-specific document or user details.

---

## 4.2 Tenants Management Page

Purpose: Manage organizations using the platform.

### Table Columns

| Tenant Name | Status | Users | Storage Used | Plan | Created On | Actions |

### Actions

* Activate tenant
* Suspend tenant
* Delete tenant
* Reset tenant API keys
* Change plan
* View usage summary

### Tenant Detail View (Metadata only)

Allowed to see:

* Total users
* Total documents count
* Queries per day
* Storage usage
* Last activity

Not allowed:

* Open document
* See document titles
* See employee names

---

## 4.3 Subscriptions & Billing

Features:

* Assign plan (Basic / Pro / Enterprise)
* Monthly usage tracking
* Payment status
* Invoice generation
* Over-usage alerts

Owner can:

* Upgrade/downgrade plan
* Set token limits
* Set storage limits
* Set query limits

---

## 4.4 Usage Analytics

Platform-wide statistics only.

Charts:

* Queries per tenant (count only)
* Embeddings created
* Average response latency
* AI token consumption
* Peak hours usage

Never expose:
User-level activity.

---

## 4.5 System Health Page

This is infrastructure monitoring.

Show status of:

* API Server
* Database
* Vector DB
* Redis
* Workers
* LLM Provider

Metrics:

* Latency
* Error rate
* Queue backlog
* Worker failures

Owner can restart services (if self-hosted).

---

## 4.6 Security & Abuse Monitoring

Purpose: detect misuse.

Show:

* Excessive query rate tenants
* Prompt injection detection count
* Suspicious activity alerts
* Authentication failures
* Rate-limit violations

Owner actions:

* Temporarily block tenant
* Force re-authentication
* Trigger investigation flag

---

## 4.7 AI Configuration

Global AI behaviour settings.

Owner can configure:

* Default model
* Token limits
* Max context size
* Allowed file types
* Embedding chunk size
* Temperature limits
* Response policies

Cannot configure per-document visibility.

---

## 4.8 Global Permissions Policy

Platform-level restrictions.

Examples:

* Disable file uploads globally
* Restrict max document size
* Restrict model usage
* Enforce password policy

---

## 4.9 System Audit Logs

System-level logs only:

* Tenant created
* Tenant suspended
* Plan changed
* Service restart
* System config updated

Not user logs inside tenants.

---

## 4.10 Support & Emergency Access

This is controlled and logged.

Owner can request temporary read-only tenant access.

Rules:

* Requires justification
* Time limited
* Fully audited
* Visible to tenant admin

This is compliance requirement.

---

# 5. Owner Permission Model

Owner role is NOT bypass role.

Instead:

```
Owner = Platform Administrator
Tenant Admin = Data Administrator
User = Data Consumer
```

Owner controls system
Tenant controls data

---

# 6. Owner Dashboard Security Rules

1. Owner cannot directly query vector DB.
2. Owner cannot run RAG queries on tenant data.
3. Owner actions must be audit logged.
4. Emergency access must notify tenant admin.
5. Owner APIs separated from tenant APIs.

---

# 7. Mental Model

Think of it like:

AWS Console vs Your EC2 Files

AWS can manage servers
AWS cannot read your files

Kodezera Owner = AWS
Tenant = Customer Infrastructure


