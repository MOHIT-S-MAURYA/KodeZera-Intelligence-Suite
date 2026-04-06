# Chapter 10: Complete Data Dictionary

---

This chapter provides a complete field-level specification for all 45+ database models in the system, organised by application module.

---

## 10.1 Core Module (30 Models)

### 10.1.1 tenants

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Tenant identifier |
| `name` | VARCHAR(255) | NOT NULL | Organisation display name |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL | URL-safe tenant identifier |
| `is_active` | BOOLEAN | DEFAULT TRUE | Whether the tenant can access the platform |
| `contact_email` | VARCHAR(254) | | Primary contact email |
| `billing_email` | VARCHAR(254) | | Billing contact email |
| `onboarding_step` | VARCHAR(30) | DEFAULT 'created' | created → configured → active |
| `data_region` | VARCHAR(20) | DEFAULT 'us-east' | us-east, eu-west, ap-south |
| `trial_ends_at` | TIMESTAMP | NULLABLE | Trial period end date |
| `deleted_at` | TIMESTAMP | NULLABLE | Soft-delete timestamp |
| `created_at` | TIMESTAMP | auto | Creation timestamp |
| `updated_at` | TIMESTAMP | auto | Last update timestamp |

**Indexes**: `slug`, `is_active`

---

### 10.1.2 users

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | User identifier |
| `tenant_id` | UUID | FK → tenants, NULLABLE | Tenant (null for superusers) |
| `email` | VARCHAR(254) | UNIQUE, NOT NULL | Login email (USERNAME_FIELD) |
| `username` | VARCHAR(150) | NOT NULL | Display name |
| `first_name` | VARCHAR(150) | | First name |
| `last_name` | VARCHAR(150) | | Last name |
| `password` | VARCHAR(128) | | Argon2/bcrypt hashed password |
| `department_id` | UUID | FK → departments, NULLABLE | User's department |
| `employee_id` | VARCHAR(50) | | HR employee identifier |
| `job_title` | VARCHAR(200) | | Job title |
| `manager_id` | UUID | FK → users (self), NULLABLE | Direct manager |
| `clearance_level` | INT | DEFAULT 0 | Security clearance (0–5) |
| `employment_type` | VARCHAR(20) | DEFAULT 'full_time' | full_time/part_time/contractor/intern |
| `hired_at` | DATE | NULLABLE | Hire date |
| `mfa_enabled` | BOOLEAN | DEFAULT FALSE | Whether MFA is activated |
| `password_changed_at` | TIMESTAMP | NULLABLE | Last password change |
| `force_password_change` | BOOLEAN | DEFAULT FALSE | Force change on next login |
| `failed_login_count` | INT | DEFAULT 0 | Consecutive failed login attempts |
| `locked_until` | TIMESTAMP | NULLABLE | Account lockout expiry |
| `is_staff` | BOOLEAN | DEFAULT FALSE | Django admin access |
| `is_superuser` | BOOLEAN | DEFAULT FALSE | Platform owner flag |
| `is_active` | BOOLEAN | DEFAULT TRUE | Account active flag |
| `profile_metadata` | JSONB | DEFAULT {} | Extensible profile data |
| `last_login` | TIMESTAMP | NULLABLE | Last successful login |
| `created_at` | TIMESTAMP | auto | Creation timestamp |
| `updated_at` | TIMESTAMP | auto | Last update timestamp |

**Indexes**: `(tenant, email)`, `(tenant, is_active)`, `department`, `(tenant, username)` UNIQUE

---

### 10.1.3 departments

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Department identifier |
| `tenant_id` | UUID | FK → tenants, NOT NULL | Parent tenant |
| `name` | VARCHAR(255) | NOT NULL | Department name |
| `description` | TEXT | | Department description |
| `parent_id` | UUID | FK → departments (self), NULLABLE | Parent department for hierarchy |
| `created_at` | TIMESTAMP | auto | Creation timestamp |
| `updated_at` | TIMESTAMP | auto | Last update timestamp |

**Unique**: `(tenant, name, parent)` — prevents duplicate department names at the same level

---

### 10.1.4 org_units

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | OrgUnit identifier |
| `tenant_id` | UUID | FK → tenants, NOT NULL | Parent tenant |
| `name` | VARCHAR(255) | NOT NULL | Unit name |
| `unit_type` | VARCHAR(20) | NOT NULL | company/division/region/branch/department/team |
| `parent_id` | UUID | FK → org_units (self), NULLABLE | Parent unit |
| `depth` | INT | DEFAULT 0 | Tree depth (max 15) |
| `is_active` | BOOLEAN | DEFAULT TRUE | Active flag |
| `metadata` | JSONB | DEFAULT {} | Extensible attributes |
| `created_at` | TIMESTAMP | auto | Creation timestamp |
| `updated_at` | TIMESTAMP | auto | Last update timestamp |

**Unique**: `(tenant, name, parent)` — prevents duplicate names at the same level
**Validation**: `clean()` enforces MAX_DEPTH=15

---

### 10.1.5 org_unit_closures

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGINT | PK, auto | Row identifier |
| `ancestor_id` | UUID | FK → org_units, NOT NULL | Ancestor org unit |
| `descendant_id` | UUID | FK → org_units, NOT NULL | Descendant org unit |
| `depth` | INT | NOT NULL | Distance between ancestor and descendant |

**Unique**: `(ancestor, descendant)` — ensures no duplicate closure pairs

---

### 10.1.6 user_org_units

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Assignment identifier |
| `user_id` | UUID | FK → users, NOT NULL | User |
| `org_unit_id` | UUID | FK → org_units, NOT NULL | Org unit |
| `is_primary` | BOOLEAN | DEFAULT FALSE | Primary org unit assignment |
| `assigned_at` | TIMESTAMP | auto | Assignment timestamp |

**Unique**: `(user, org_unit)` — prevents duplicate assignments

---

### 10.1.7 audit_logs (Legacy)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Log entry identifier |
| `tenant_id` | UUID | FK → tenants, NULLABLE | Tenant scope |
| `user_id` | UUID | FK → users, NULLABLE | Actor |
| `action` | VARCHAR(50) | NOT NULL | create/update/delete/read/login/logout/upload/download/query/grant_access/revoke_access |
| `resource_type` | VARCHAR(100) | NOT NULL | Resource category (document, user, role, etc.) |
| `resource_id` | UUID | NULLABLE | Specific resource ID |
| `metadata` | JSONB | DEFAULT {} | Additional context (path, method, etc.) |
| `ip_address` | INET | NULLABLE | Client IP address |
| `user_agent` | TEXT | | Browser user agent string |
| `created_at` | TIMESTAMP | auto | Event timestamp |

**Indexes**: `(tenant, created_at)`, `(user, created_at)`, `(resource_type, resource_id)`, `action`

---

### 10.1.8 audit_events (New, with hash chain)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Event identifier |
| `tenant_id` | UUID | FK → tenants, NULLABLE | Tenant scope |
| `user_id` | UUID | FK → users, NULLABLE | Actor |
| `action` | VARCHAR(50) | NOT NULL | Event action type |
| `outcome` | VARCHAR(20) | DEFAULT 'success' | success/failure |
| `resource_type` | VARCHAR(100) | NOT NULL | Resource category |
| `resource_id` | UUID | NULLABLE | Specific resource ID |
| `changes` | JSONB | DEFAULT {} | Field-level change details |
| `ip_address` | INET | NULLABLE | Client IP |
| `user_agent` | VARCHAR(500) | | Browser user agent |
| `session_id` | VARCHAR(100) | | Session identifier |
| `request_id` | VARCHAR(100) | | Correlation UUID |
| `previous_hash` | VARCHAR(64) | NOT NULL | SHA-256 hash of previous event (chain link) |
| `event_hash` | VARCHAR(64) | NOT NULL | SHA-256 hash of this event (tamper detection) |
| `timestamp` | TIMESTAMP | auto | Event timestamp |

**Indexes**: `(tenant, -timestamp)`, `(user, -timestamp)`, `action`, `request_id`

---

### 10.1.9 security_alerts

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Alert identifier |
| `tenant_id` | UUID | FK → tenants, NULLABLE | Tenant scope |
| `rule_key` | VARCHAR(50) | NOT NULL | Detection rule identifier |
| `severity` | VARCHAR(20) | NOT NULL | low/medium/high/critical |
| `title` | VARCHAR(255) | NOT NULL | Alert title |
| `description` | TEXT | | Alert description |
| `source_events` | JSONB | DEFAULT [] | List of triggering event UUIDs |
| `status` | VARCHAR(20) | DEFAULT 'open' | open/acknowledged/resolved/dismissed |
| `resolved_by_id` | UUID | FK → users, NULLABLE | User who resolved the alert |
| `resolved_at` | TIMESTAMP | NULLABLE | Resolution timestamp |
| `notes` | TEXT | | Resolution notes |
| `created_at` | TIMESTAMP | auto | Detection timestamp |

---

### 10.1.10 subscription_plans

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PK, auto | Plan identifier |
| `name` | VARCHAR(50) | UNIQUE, NOT NULL | Plan name |
| `plan_type` | VARCHAR(20) | NOT NULL | basic/pro/enterprise |
| `description` | TEXT | | Plan description |
| `max_users` | INT | ≥ 1 | Maximum users per tenant |
| `max_storage_gb` | INT | ≥ 1 | Maximum storage in GB |
| `max_queries_per_month` | INT | ≥ 1 | Monthly query limit |
| `max_tokens_per_month` | INT | ≥ 1 | Monthly token limit |
| `price_monthly` | DECIMAL(10,2) | ≥ 0.00 | Monthly price in USD |
| `features` | JSONB | DEFAULT [] | Feature list for UI display |
| `is_active` | BOOLEAN | DEFAULT TRUE | Whether plan is available |
| `created_at` | TIMESTAMP | auto | Creation timestamp |
| `updated_at` | TIMESTAMP | auto | Last update timestamp |

---

### 10.1.11 tenant_subscriptions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PK, auto | Subscription identifier |
| `tenant_id` | UUID | FK → tenants, UNIQUE | One subscription per tenant |
| `plan_id` | INT | FK → subscription_plans, PROTECT | Active plan |
| `status` | VARCHAR(20) | DEFAULT 'trial' | active/suspended/cancelled/trial |
| `current_period_start` | TIMESTAMP | NOT NULL | Billing cycle start |
| `current_period_end` | TIMESTAMP | NOT NULL | Billing cycle end |
| `last_payment_date` | TIMESTAMP | NULLABLE | Last successful payment |
| `next_payment_date` | TIMESTAMP | NULLABLE | Next billing date |
| `payment_method` | VARCHAR(50) | | Payment method label |
| `cancelled_at` | TIMESTAMP | NULLABLE | Cancellation timestamp |
| `created_at` | TIMESTAMP | auto | Creation timestamp |
| `updated_at` | TIMESTAMP | auto | Last update timestamp |

---

### 10.1.12 ai_provider_config (Singleton)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK | Always 1 (singleton) |
| `llm_provider` | VARCHAR(30) | DEFAULT 'openai' | openai/huggingface/anthropic/ollama/local |
| `llm_model` | VARCHAR(200) | DEFAULT 'gpt-3.5-turbo' | Model identifier |
| `llm_api_key` | VARCHAR(500) | | API key (masked in UI) |
| `llm_api_base` | VARCHAR(500) | | Custom API base URL |
| `embedding_provider` | VARCHAR(30) | DEFAULT 'openai' | openai/huggingface/sentence_transformers |
| `embedding_model` | VARCHAR(200) | DEFAULT 'text-embedding-3-small' | Embedding model |
| `embedding_api_key` | VARCHAR(500) | | Embedding provider API key |
| `embedding_api_base` | VARCHAR(500) | | Custom embedding API base URL |
| `max_tokens_per_request` | INT | DEFAULT 1000 | Max tokens per LLM response |
| `requests_per_minute` | INT | DEFAULT 60 | Global LLM rate limit |
| `updated_at` | TIMESTAMP | auto | Last configuration change |
| `updated_by_id` | UUID | FK → users, NULLABLE | Who changed the config |

---

### 10.1.13–10.1.17 Notification Models

**notification_templates**: Template definitions with Jinja2-style placeholders
**notifications**: Source notification record (one per broadcast)
**notification_receipts**: Legacy per-user read state
**user_notifications**: Materialized inbox (one per recipient per notification)
**delivery_records**: Per-channel delivery tracking (in_app, email, push, webhook)

### 10.1.18–10.1.20 Authentication Models

**user_sessions**: Active session tracking (IP, user agent, device fingerprint)
**login_attempts**: Login attempt logging (email, success/failure, IP, timestamp)
**password_history**: Historical password hashes for reuse prevention
**mfa_devices**: TOTP/Email MFA device registration

### 10.1.21–10.1.25 Platform Models

**feature_flags**: Global feature toggle definitions
**plan_feature_gates**: Feature → plan mapping
**tenant_feature_flags**: Per-tenant overrides
**billing_events**: Payment/refund/upgrade/downgrade records
**invoices**: Monthly billing invoices per tenant
**health_check_logs**: System component health status history
**tenant_configs**: Per-tenant customisation settings

### 10.1.26 support_tickets

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR(20) | PK | Auto-generated T-NNNN format |
| `subject` | VARCHAR(255) | NOT NULL | Ticket subject |
| `description` | TEXT | NOT NULL | Issue description |
| `category` | VARCHAR(30) | DEFAULT 'other' | bug/feature/access/performance/data/other |
| `context_info` | JSONB | DEFAULT {} | Auto-captured browser/page context |
| `tenant_id` | UUID | FK → tenants, NULLABLE | Tenant scope |
| `created_by_id` | UUID | FK → users, NOT NULL | Ticket creator |
| `priority` | VARCHAR(20) | DEFAULT 'medium' | low/medium/high/critical |
| `status` | VARCHAR(20) | DEFAULT 'open' | open/in_progress/resolved |
| `created_at` | TIMESTAMP | auto | Creation timestamp |
| `updated_at` | TIMESTAMP | auto | Last update timestamp |

---

## 10.2 RBAC Module (5 Models)

### 10.2.1 roles

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Role identifier |
| `tenant_id` | UUID | FK → tenants, NOT NULL | Tenant scope |
| `name` | VARCHAR(100) | NOT NULL | Role name |
| `description` | TEXT | | Role description |
| `parent_id` | UUID | FK → roles (self), NULLABLE | Parent role for hierarchy |
| `level` | INT | DEFAULT 0 | Hierarchy depth |
| `is_system_role` | BOOLEAN | DEFAULT FALSE | System-defined (non-deletable) |
| `is_active` | BOOLEAN | DEFAULT TRUE | Active flag |
| `created_at` | TIMESTAMP | auto | Creation timestamp |
| `updated_at` | TIMESTAMP | auto | Last update timestamp |

**Unique**: `(tenant, name)` — prevents duplicate role names within a tenant

### 10.2.2 permissions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Permission identifier |
| `resource_type` | VARCHAR(100) | NOT NULL | Resource category |
| `action` | VARCHAR(50) | NOT NULL | Action verb |
| `description` | TEXT | | Human-readable description |
| `conditions` | JSONB | DEFAULT {} | ABAC condition rules |
| `is_deny` | BOOLEAN | DEFAULT FALSE | Deny rule flag (deny-first evaluation) |

**Unique**: `(resource_type, action)` per tenant scope

### 10.2.3 role_permissions (Junction)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `role_id` | UUID | FK → roles, NOT NULL | Role |
| `permission_id` | UUID | FK → permissions, NOT NULL | Permission |

**Unique**: `(role, permission)`

### 10.2.4 user_roles

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Assignment identifier |
| `user_id` | UUID | FK → users, NOT NULL | User |
| `role_id` | UUID | FK → roles, NOT NULL | Role |
| `is_active` | BOOLEAN | DEFAULT TRUE | Active flag |
| `expires_at` | TIMESTAMP | NULLABLE | Expiration date (time-bound roles) |
| `assigned_by_id` | UUID | FK → users, NULLABLE | Who assigned the role |
| `assigned_at` | TIMESTAMP | auto | Assignment timestamp |

### 10.2.5 role_closures

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGINT | PK, auto | Row identifier |
| `ancestor_id` | UUID | FK → roles, NOT NULL | Ancestor role |
| `descendant_id` | UUID | FK → roles, NOT NULL | Descendant role |
| `depth` | INT | NOT NULL | Distance in the hierarchy |

**Unique**: `(ancestor, descendant)`
**Purpose**: Pre-computed closure table for O(1) ancestor lookup

---

## 10.3 Documents Module (6 Models)

### 10.3.1 documents

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Document identifier |
| `tenant_id` | UUID | FK → tenants, NOT NULL | Tenant scope |
| `title` | VARCHAR(500) | NOT NULL | Document title |
| `file` | FILE | NOT NULL | Uploaded file path |
| `file_type` | VARCHAR(20) | NOT NULL | pdf/docx/txt/csv/md/json/xlsx |
| `file_size` | BIGINT | DEFAULT 0 | File size in bytes |
| `status` | VARCHAR(20) | DEFAULT 'pending' | pending/processing/completed/failed |
| `classification_level` | INT | DEFAULT 0 | Security classification (0–5) |
| `visibility_type` | VARCHAR(20) | DEFAULT 'restricted' | public/restricted/confidential |
| `uploaded_by_id` | UUID | FK → users, NOT NULL | Uploader |
| `department_id` | UUID | FK → departments, NULLABLE | Associated department |
| `folder_id` | UUID | FK → document_folders, NULLABLE | Parent folder |
| `chunk_count` | INT | DEFAULT 0 | Number of vector chunks |
| `version` | INT | DEFAULT 1 | Current version number |
| `description` | TEXT | | Document description |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | Soft-delete flag |
| `deleted_at` | TIMESTAMP | NULLABLE | Soft-delete timestamp |
| `created_at` | TIMESTAMP | auto | Upload timestamp |
| `updated_at` | TIMESTAMP | auto | Last update timestamp |

### 10.3.2 document_access

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Access grant identifier |
| `document_id` | UUID | FK → documents, NOT NULL | Target document |
| `access_type` | VARCHAR(20) | NOT NULL | user/role/org_unit |
| `user_id` | UUID | FK → users, NULLABLE | For user-type grants |
| `role_id` | UUID | FK → roles, NULLABLE | For role-type grants |
| `org_unit_id` | UUID | FK → org_units, NULLABLE | For org-unit-type grants |
| `granted_by_id` | UUID | FK → users, NULLABLE | Who granted access |
| `granted_at` | TIMESTAMP | auto | Grant timestamp |

---

## 10.4 RAG Module (4 Models)

### 10.4.1 vector_chunks

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Chunk identifier |
| `document_id` | UUID | FK → documents, NOT NULL | Source document |
| `chunk_index` | INT | NOT NULL | Sequential chunk number |
| `vector_id` | VARCHAR(100) | NOT NULL | Qdrant point ID |
| `text_preview` | TEXT | | First 500 chars of chunk text |
| `token_count` | INT | DEFAULT 0 | Token count for this chunk |
| `embedding_model` | VARCHAR(100) | | Model used for embedding |
| `created_at` | TIMESTAMP | auto | Embedding timestamp |

### 10.4.2 chat_sessions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Session identifier |
| `tenant_id` | UUID | FK → tenants, NOT NULL | Tenant scope |
| `user_id` | UUID | FK → users, NOT NULL | Session owner |
| `title` | VARCHAR(255) | | Auto-generated or user-set title |
| `folder_id` | UUID | FK → chat_folders, NULLABLE | Folder assignment |
| `is_pinned` | BOOLEAN | DEFAULT FALSE | Pinned to top |
| `created_at` | TIMESTAMP | auto | Session start |
| `updated_at` | TIMESTAMP | auto | Last activity |

### 10.4.3 chat_messages

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Message identifier |
| `session_id` | UUID | FK → chat_sessions, NOT NULL | Parent session |
| `role` | VARCHAR(20) | NOT NULL | user/assistant/system |
| `content` | TEXT | NOT NULL | Message content (Markdown) |
| `sources` | JSONB | DEFAULT [] | Source citations for assistant messages |
| `metadata` | JSONB | DEFAULT {} | Chunks retrieved, latency, tokens, etc. |
| `created_at` | TIMESTAMP | auto | Message timestamp |

---

## 10.5 Analytics Module (5 Models)

### 10.5.1 query_analytics

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Record identifier |
| `tenant_id` | UUID | FK → tenants, NOT NULL | Tenant scope |
| `user_id` | UUID | FK → users, NULLABLE | Querying user |
| `session_id` | UUID | NULLABLE | Chat session |
| `query_hash` | VARCHAR(64) | INDEXED | SHA-256 of query (privacy) |
| `latency_ms` | INT | DEFAULT 0 | End-to-end query latency |
| `chunks_retrieved` | INT | DEFAULT 0 | Number of chunks returned |
| `avg_relevance` | FLOAT | NULLABLE | Average combined score |
| `model_used` | VARCHAR(100) | | LLM model identifier |
| `tokens_in` | INT | DEFAULT 0 | Input tokens |
| `tokens_out` | INT | DEFAULT 0 | Output tokens |
| `cost_usd` | DECIMAL(8,6) | DEFAULT 0 | Computed query cost |
| `user_feedback` | VARCHAR(10) | DEFAULT 'none' | positive/negative/none |
| `is_follow_up` | BOOLEAN | DEFAULT FALSE | Whether query was rewritten |
| `is_failed` | BOOLEAN | DEFAULT FALSE | Whether query errored |
| `created_at` | TIMESTAMP | auto | Query timestamp |

### 10.5.2 alert_rules

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto | Rule identifier |
| `name` | VARCHAR(200) | NOT NULL | Rule display name |
| `metric` | VARCHAR(50) | NOT NULL | error_rate/avg_latency_ms/queries_count/tokens_used/active_users |
| `condition` | VARCHAR(10) | DEFAULT 'gt' | gt/lt/gte/lte |
| `threshold` | FLOAT | NOT NULL | Threshold value |
| `scope` | VARCHAR(10) | DEFAULT 'tenant' | platform/tenant |
| `tenant_id` | UUID | FK → tenants, NULLABLE | Scope (null for platform) |
| `notification_channels` | JSONB | DEFAULT [] | Channels to notify |
| `is_active` | BOOLEAN | DEFAULT TRUE | Active flag |
| `cooldown_minutes` | INT | DEFAULT 60 | Minimum time between alerts |
| `created_by_id` | UUID | FK → users, NULLABLE | Rule creator |
| `created_at` | TIMESTAMP | auto | Creation timestamp |
| `updated_at` | TIMESTAMP | auto | Last update timestamp |

---
