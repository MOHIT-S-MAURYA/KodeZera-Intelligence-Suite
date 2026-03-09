# Organisation & RBAC Module — Complete Analysis & System Design

**Date:** 10 March 2026  
**Scope:** Full analysis of Organisation Hierarchy + RBAC + access control layer, plus advanced system design  
**Principle:** Analyse current → Identify gaps → Design scalable, secure, reliable next-generation system

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Deep-Dive](#2-component-deep-dive)
3. [SWOT Analysis](#3-swot-analysis)
4. [Gap Analysis — Current vs Enterprise-Grade](#4-gap-analysis)
5. [Advanced System Design](#5-advanced-system-design)
6. [Architecture Design](#6-architecture-design)
7. [Data Model Design (New)](#7-data-model-design)
8. [API Design](#8-api-design)
9. [Security Design](#9-security-design)
10. [Scalability & Reliability Design](#10-scalability--reliability-design)
11. [Frontend Design](#11-frontend-design)
12. [Migration Strategy](#12-migration-strategy)
13. [Implementation Roadmap](#13-implementation-roadmap)

---

## 1. System Overview

### 1.1 Current Architecture Summary

The organisation module spans **16 files** across 3 Django apps + 6 frontend files:

| Layer                 | Files                                                                                              | Purpose                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Core Models**       | `core/models.py` (Tenant, Department, User)                                                        | Multi-tenant foundation, org hierarchy, user identity                  |
| **RBAC Models**       | `rbac/models.py` (Role, Permission, RolePermission, UserRole)                                      | Dynamic role-based access control with inheritance                     |
| **RBAC Services**     | `rbac/services/authorization.py` (RoleResolutionService, PermissionService)                        | Role resolution with caching, permission checks                        |
| **Document Access**   | `documents/services/access.py` (DocumentAccessService), `documents/models.py` (DocumentAccess)     | 5-rule RBAC-integrated document access resolution                      |
| **API Views**         | `api/views/admin.py` (Department, Role, Permission, UserRole, UserManagement ViewSets)             | Admin CRUD endpoints                                                   |
| **Serializers**       | `api/serializers/__init__.py` (Department, Role, Permission, UserRole, UserManagement serializers) | Data validation and transformation                                     |
| **Permissions**       | `api/permissions.py`, `core/permissions.py`                                                        | DRF permission classes (HasPermission, IsTenantAdmin, IsPlatformOwner) |
| **Middleware**        | `core/middleware.py` (TenantIsolation, AuditLogging)                                               | Tenant enforcement, audit trail                                        |
| **Frontend Pages**    | `pages/Users.tsx`, `pages/Departments.tsx`, `pages/Roles.tsx`, `pages/AuditLogs.tsx`               | Admin management UI                                                    |
| **Frontend Services** | `services/user.service.ts`, `services/department.service.ts`, `services/role.service.ts`           | REST API wrappers                                                      |

### 1.2 Current Data Flow

```
Organisation Hierarchy:

    Tenant (root)
        │
        ├── Departments (tree: parent → children)
        │       │
        │       └── Users (belong to ONE department)
        │
        └── Roles (tree: parent → children, permissions inherited upward)
                │
                └── UserRoles (junction: user ←→ role, many-to-many)
                        │
                        └── Permissions (via RolePermission junction)


Access Resolution Flow:

    User makes request
        ↓
    [TenantIsolationMiddleware] → tenant_id injected
        ↓
    [DRF Permission Class] → IsTenantAdmin OR HasPermission
        ↓
    [PermissionService.has_permission()] → resolve roles → check permission
        ↓
    [DocumentAccessService.get_accessible_document_ids()]
        → 5 rules: public + own + role grants + dept grants + user grants
```

---

## 2. Component Deep-Dive

### 2.1 Tenant Model (`core/models.py`)

| Aspect            | Current State                                                 |
| ----------------- | ------------------------------------------------------------- |
| **Fields**        | `id` (UUID), `name`, `slug` (unique), `is_active`, timestamps |
| **Isolation**     | ForeignKey on User, Department, Role, Document, AuditLog      |
| **Activation**    | Middleware blocks all requests if `is_active=False`           |
| **Configuration** | No tenant-level settings (RBAC mode, security policies, etc.) |

**Assessment:** Minimal but functional. No tenant-level configuration, no metadata, no billing integration in the model itself (separate TenantSubscription model exists).

### 2.2 Department Model (`core/models.py`)

| Aspect             | Current State                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| **Hierarchy**      | Self-referential FK (`parent`), unlimited depth                                                     |
| **Traversal**      | `get_ancestors()` — iterative loop (N+1 queries), `get_descendants()` — recursive DFS (N+1 queries) |
| **Constraints**    | `unique_together: [tenant, name, parent]` — same name allowed under different parents               |
| **User link**      | User has single FK to Department                                                                    |
| **Counts**         | Annotated in ViewSet: `user_count`, `children_count`                                                |
| **Depth tracking** | ❌ None — depth/level is unknown without traversal                                                  |
| **Path tracking**  | ❌ None — no materialized path or closure table                                                     |
| **Ordering**       | ❌ No sibling ordering — alphabetical only                                                          |

**Assessment:** Adjacency list pattern only. O(depth) queries for ancestor traversal, O(N) queries for descendant traversal. No circular reference protection in model (only in serializer). No depth limit enforcement. No efficient subtree queries.

### 2.3 User Model (`core/models.py`)

| Aspect               | Current State                                                               |
| -------------------- | --------------------------------------------------------------------------- |
| **Identity**         | UUID PK, email (globally unique), username (unique per tenant)              |
| **Tenant Link**      | FK to Tenant (nullable for superuser)                                       |
| **Department**       | Single FK to Department (nullable)                                          |
| **Admin Check**      | `is_tenant_admin` property → queries RBAC (cached per-request in attribute) |
| **Profile**          | `profile_metadata` JSONField — unstructured                                 |
| **Org Position**     | ❌ None — no job title, reporting manager, employment status, employee ID   |
| **Multi-department** | ❌ Not supported — user belongs to exactly one department                   |

**Assessment:** Core identity is solid. Missing organisational context fields (title, manager, employee ID). Single department membership is limiting for matrix organisations.

### 2.4 Role Model (`rbac/models.py`)

| Aspect                      | Current State                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| **Hierarchy**               | Self-referential FK (`parent`), permissions inherited from ancestors                      |
| **System roles**            | `is_system_role` flag — "Tenant Administrator" auto-created, cannot be deleted            |
| **Traversal**               | `get_ancestors()` — iterative with cycle detection (visited set)                          |
| **`get_all_permissions()`** | Collects from self + all ancestors (N+1 queries per ancestor)                             |
| **Scoping**                 | Roles are tenant-scoped — `unique_together: [tenant, name]`                               |
| **Granularity**             | No conditional/contextual permissions (e.g., "can read documents in own department only") |

**Assessment:** Good inheritance model with cycle detection. But role-permission resolution is N+1 heavy. No support for scoped permissions, time-bound roles, or conditional access.

### 2.5 Permission Model (`rbac/models.py`)

| Aspect                 | Current State                                                           |
| ---------------------- | ----------------------------------------------------------------------- |
| **Scope**              | **Global** — no tenant isolation (shared across all tenants)            |
| **Structure**          | `resource_type` × `action` = permission (e.g., `document:read`)         |
| **Resource types**     | 6: document, role, user, department, audit_log, tenant                  |
| **Actions**            | 9: create, read, update, delete, manage, upload, download, share, query |
| **Total**              | 6 × 9 = 54 possible permissions                                         |
| **Custom permissions** | ❌ Tenants cannot create custom permissions                             |
| **Conditions**         | ❌ No conditional logic (e.g., "only in own department")                |
| **Field-level**        | ❌ No field-level permissions (e.g., "can see name but not salary")     |

**Assessment:** Simple and clean resource:action model. But purely global — no tenant customization, no conditions, no field-level control. Fine for current scope but won't scale to enterprise RBAC needs.

### 2.6 Authorization Service (`rbac/services/authorization.py`)

| Aspect                     | Current State                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------- |
| **RoleResolutionService**  | Resolves all role IDs (direct + inherited) with Redis caching (1h TTL)             |
| **PermissionService**      | Checks `has_permission(user, resource, action)` with Redis caching (30min TTL)     |
| **Admin shortcut**         | Superuser + tenant admin bypass all permission checks → `return True`              |
| **Cache invalidation**     | Signal-based: `post_save`/`post_delete` on UserRole busts role + permission caches |
| **Bulk invalidation**      | `invalidate_tenant_cache()` iterates all users in tenant (N cache deletes)         |
| **Permission aggregation** | `get_user_permissions()` returns full list — used for UI display                   |

**Assessment:** Well-structured service with proper caching. Signal-based invalidation is elegant. But: bulk invalidation is O(N users), no permission preloading, no deny rules, no attribute-based conditions.

### 2.7 Document Access Service (`documents/services/access.py`)

| Aspect                    | Current State                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| **Resolution rules**      | 5 rules: public docs + own uploads + role grants + dept grants (with ancestors) + user grants |
| **Admin shortcut**        | Superuser → all docs. Tenant admin → all tenant docs                                          |
| **Caching**               | Redis, 15-minute TTL per user                                                                 |
| **Polymorphic grants**    | DocumentAccess: `access_type` (role/department/user) + `access_id` (UUID)                     |
| **Classification level**  | ❌ Not checked during access resolution (field exists on Document but unused)                 |
| **Deny rules**            | ❌ None — only allow rules exist                                                              |
| **Inheritance direction** | Department grants propagate UP (ancestors), not DOWN (children)                               |

**Assessment:** The 5-rule resolution is well-designed. But `classification_level` is never enforced. Department grant inheritance direction may be counterintuitive (grants to a child dept don't cascade to parent). No deny/exclude rules.

### 2.8 API Layer (`api/views/admin.py`)

| Aspect               | Current State                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **ViewSets**         | DepartmentViewSet, RoleViewSet, PermissionViewSet (read-only), UserRoleViewSet, UserManagementViewSet, AuditLogViewSet |
| **Permission**       | All require `IsTenantAdmin`                                                                                            |
| **Tenant isolation** | `get_queryset()` filters by `request.user.tenant`                                                                      |
| **Safety checks**    | Can't delete depts with users/children. Can't delete system roles or roles with users. Can't delete own account        |
| **Notifications**    | Create events trigger NotificationService                                                                              |
| **Filtering**        | AuditLogs: action, resource_type, user_id, date range. Others: none                                                    |
| **Pagination**       | ❌ None — returns all records                                                                                          |
| **Bulk operations**  | ❌ None                                                                                                                |

**Assessment:** Good safety checks and tenant isolation. Missing pagination (problematic for large orgs), filtering on most endpoints, and bulk operations.

### 2.9 Frontend UI

| Aspect                     | Current State                                                                    |
| -------------------------- | -------------------------------------------------------------------------------- |
| **Users page**             | Full CRUD table with search, role/dept filter, create/edit modals, status toggle |
| **Departments page**       | Card grid, parent-child display (flat with text labels), create/edit/delete      |
| **Roles page**             | Card grid, parent-child (flat), system-role protection badge, permission count   |
| **Permission management**  | ❌ **NONE** — no UI to view/assign/manage permissions on roles                   |
| **Org tree visualization** | ❌ **NONE** — all hierarchies rendered as flat lists/grids                       |
| **Bulk operations**        | ❌ None                                                                          |
| **Types**                  | Scattered across service files, no shared type directory                         |
| **Pagination**             | ❌ None                                                                          |
| **Settings page**          | Scaffold only — no API integration                                               |

**Assessment:** Functional CRUD exists for all entities. But no hierarchy visualization, no permission management UI, and no bulk operations. The flat rendering completely hides the tree structure that the data model supports.

---

## 3. SWOT Analysis

### Strengths

| #   | Strength                      | Evidence                                                                                                                                              |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **Dynamic RBAC**              | Roles + permissions are fully configurable per tenant. No hardcoded roles (design principle §1.2). System roles auto-created, protected from deletion |
| S2  | **Role inheritance**          | Parent-child roles with permission aggregation. Cycle detection prevents infinite loops                                                               |
| S3  | **Multi-layered caching**     | Redis caching at 3 levels: role resolution (1h), permission checks (30min), document access (15min). Signal-based invalidation                        |
| S4  | **Tenant isolation**          | Middleware-level enforcement. Every queryset filtered by tenant. Platform owner cannot access tenant data content                                     |
| S5  | **5-rule document access**    | Comprehensive: public + own + role + department + user grants. Covers common enterprise access patterns                                               |
| S6  | **Safety guardrails**         | Can't delete depts with users, can't delete roles with users, can't delete own account, can't delete system roles                                     |
| S7  | **Audit trail**               | Every write operation logged via middleware. Action, resource_type, metadata, IP, user-agent captured                                                 |
| S8  | **Notification integration**  | CRUD operations trigger targeted notifications (user, department, tenant-wide)                                                                        |
| S9  | **Clean service layer**       | Authorization logic in dedicated services, not scattered across views. Single responsibility                                                          |
| S10 | **Platform owner separation** | Clear boundary: owner manages platform, not org data. `IsPlatformOwner` + `NeverAllowTenantDataAccess` enforce this                                   |

### Weaknesses

| #   | Weakness                                      | Impact                                                                                                                         | Location                                             |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| W1  | **O(N) hierarchy traversal**                  | `get_ancestors()` and `get_descendants()` trigger N+1 DB queries. Breaks for deep trees (>10 levels)                           | `Department.get_ancestors()`, `Role.get_ancestors()` |
| W2  | **No materialized path or closure table**     | Every subtree query requires recursive DB calls. Can't do "get all descendants" in one query                                   | `core/models.py` Department                          |
| W3  | **No depth/level tracking**                   | Unknown how deep a node is without traversal. Can't enforce max depth efficiently                                              | Both Department and Role                             |
| W4  | **No sibling ordering**                       | Departments/roles sorted alphabetically only. No manual reordering (drag-and-drop in UI)                                       | All hierarchy models                                 |
| W5  | **No circular reference protection in model** | Only validated in serializer `validate_parent()`. Direct DB writes can create cycles                                           | `DepartmentSerializer`, `RoleSerializer`             |
| W6  | **Single department per user**                | Real orgs have matrix structures — user in Engineering AND a Project Team                                                      | `User.department` FK                                 |
| W7  | **No scoped/conditional permissions**         | "Can read documents in own department" is impossible. Permissions are binary global grants                                     | `Permission` model                                   |
| W8  | **No deny rules**                             | Can only grant access, never explicitly deny. A higher-level grant can't be overridden                                         | `DocumentAccess`, `PermissionService`                |
| W9  | **Classification level unused**               | `Document.classification_level` (0-5) exists but is never checked in access resolution                                         | `access.py`                                          |
| W10 | **No permission management UI**               | Admins can see permission counts on roles but can't view or assign individual permissions                                      | Frontend `Roles.tsx`                                 |
| W11 | **No org hierarchy visualization**            | Dept and role trees are flat card grids. Users can't see the actual org structure                                              | Frontend                                             |
| W12 | **No pagination anywhere**                    | All CRUD endpoints return full dataset. Will break at 1000+ users/departments                                                  | All ViewSets                                         |
| W13 | **No bulk operations**                        | Can't bulk-assign roles, bulk-move departments, or batch user operations                                                       | All ViewSets                                         |
| W14 | **No org metadata on users**                  | No job title, employee ID, reporting manager, hire date, employment type                                                       | `User` model                                         |
| W15 | **Polymorphic DocumentAccess**                | `access_id` UUID without FK — no referential integrity, no type safety, no cascade delete                                      | `DocumentAccess` model                               |
| W16 | **Cache invalidation is brute-force**         | `invalidate_tenant_cache()` iterates ALL users. For 10K users = 10K cache deletes                                              | `authorization.py`                                   |
| W17 | **No role assignment constraints**            | Users can be assigned any role — no scope limits, no max roles, no incompatible role detection                                 | `UserRole` model                                     |
| W18 | **No time-bound access**                      | Roles and permissions are permanent. No "expires_at" for temporary access                                                      | All models                                           |
| W19 | **No delegation**                             | Admins can't delegate specific admin capabilities to non-admin users                                                           | Permission model                                     |
| W20 | **Dept grant inheritance is upward**          | Granting access to dept "Engineering" also includes parent depts (HR, Executive). Should be downward (Engineering + sub-depts) | `access.py`                                          |

### Opportunities

| #   | Opportunity                           | Expected Impact                                                                 |
| --- | ------------------------------------- | ------------------------------------------------------------------------------- |
| O1  | **Materialized path / closure table** | O(1) subtree queries, 100x faster hierarchy operations                          |
| O2  | **Org chart visualization**           | Users can SEE their org structure — massive UX improvement                      |
| O3  | **Permission matrix UI**              | Visual grid of roles × permissions — intuitive RBAC management                  |
| O4  | **Attribute-based access (ABAC)**     | Conditional permissions: "read docs WHERE dept=own_dept AND classification ≤ 3" |
| O5  | **Org unit abstraction**              | Unify departments, teams, projects, cost centers under one hierarchical model   |
| O6  | **Manager hierarchy**                 | User→manager chain enables approval workflows, escalation, delegation           |
| O7  | **Effective permissions preview**     | "Show me what User X can actually access" — resolves all rules live             |
| O8  | **Pagination + search**               | Cursor-based pagination + full-text search on all admin endpoints               |
| O9  | **Bulk operations**                   | Import users from CSV, bulk role assignment, bulk department moves              |
| O10 | **Temporal access**                   | "Grant Guest role for 7 days" — automatic expiration                            |

### Threats

| #   | Threat                        | Risk                                                                                 | Mitigation                                        |
| --- | ----------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------- |
| T1  | **Circular hierarchy**        | Model allows cycles via direct DB write → infinite loop in `get_ancestors()`         | DB-level constraint + model-level validation      |
| T2  | **Permission escalation**     | Tenant admin can assign themselves any permission including super-admin capabilities | System role + permission lockdowns                |
| T3  | **Orphaned access grants**    | `DocumentAccess.access_id` has no FK — deleted roles/depts leave dangling grants     | FK or cleanup job                                 |
| T4  | **Cache stampede**            | Bulk tenant cache invalidation → all users hit DB simultaneously                     | Staggered invalidation, cache warming             |
| T5  | **Unbounded queries**         | No pagination → single API call returning 50K users crashes server                   | Mandatory pagination                              |
| T6  | **Cross-tenant data leakage** | If queryset filter is missed, tenant data could be exposed                           | Automated queryset tests + middleware enforcement |

---

## 4. Gap Analysis — Current vs Enterprise-Grade

| Capability                     | Current                       | Enterprise Target                                                  | Gap          |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------ | ------------ |
| **Hierarchy performance**      | O(depth) iterative traversal  | O(1) subtree queries via closure table/materialized path           | **CRITICAL** |
| **Org visualization**          | Flat card grids               | Interactive org chart with expand/collapse, drag-drop, zoom        | **HIGH**     |
| **Permission management**      | No UI, count-only badge       | Full permission matrix: roles × permissions grid editor            | **CRITICAL** |
| **Scoped permissions**         | Binary global grants          | Conditional: "read documents in own department"                    | **HIGH**     |
| **Department membership**      | Single FK (one dept per user) | Multi-membership: primary dept + additional teams/projects         | **MEDIUM**   |
| **Manager hierarchy**          | Not modelled                  | User → manager chain for approvals, delegation, escalation         | **HIGH**     |
| **User org profile**           | Name + email + dept only      | Job title, employee ID, manager, hire date, employment type        | **MEDIUM**   |
| **Classification enforcement** | Field exists, never checked   | Access resolution checks user clearance level ≤ doc classification | **HIGH**     |
| **Temporal access**            | Permanent only                | Time-bound role assignments with auto-expiration                   | **MEDIUM**   |
| **Deny rules**                 | Allow-only                    | Explicit deny overrides that trump grants                          | **MEDIUM**   |
| **Pagination**                 | None                          | Cursor-based pagination on all list endpoints                      | **CRITICAL** |
| **Bulk operations**            | None                          | Bulk assign, bulk move, CSV import/export                          | **MEDIUM**   |
| **Effective permissions**      | Not computed                  | "Show what this user can actually access" preview                  | **HIGH**     |
| **Delegation**                 | Not modelled                  | Admin delegates specific capabilities to non-admin                 | **LOW**      |
| **Referential integrity**      | Polymorphic UUID (no FK)      | Proper FKs or validated reference cleanup                          | **MEDIUM**   |

---

## 5. Advanced System Design

### 5.1 Design Principles

1. **Hierarchies must be fast** — All tree queries in O(1) using closure table pattern
2. **Zero hardcoded roles** — Maintained from existing design (§1.2)
3. **Permissions are composable** — RBAC base + optional ABAC conditions
4. **Multi-membership** — Users can belong to multiple org units
5. **Everything is audited** — Every permission change, role assignment, org restructure
6. **Eventually consistent caching** — Redis cache with event-driven invalidation
7. **Backend enforces, frontend displays** — Maintained from existing design (§1.4)
8. **Pagination everywhere** — No unbounded queries

### 5.2 Organisation Hierarchy — Closure Table Design

**Why closure table over materialized path?**

| Pattern                      | Subtree Query    | Ancestor Query     | Move Node                | Insert Node   | Space       |
| ---------------------------- | ---------------- | ------------------ | ------------------------ | ------------- | ----------- |
| **Adjacency List (current)** | O(N) recursive   | O(depth) iterative | O(1)                     | O(1)          | O(N)        |
| **Materialized Path**        | O(1) LIKE query  | O(1) parse string  | O(subtree) update paths  | O(1)          | O(N)        |
| **Nested Sets**              | O(1) range query | O(1) range query   | O(N) renumber            | O(N) renumber | O(N)        |
| **Closure Table ✅**         | O(1) join        | O(1) join          | O(subtree) delete+insert | O(depth)      | O(N²) worst |

**Closure table wins** because:

- Read-heavy workload (hierarchy browsed far more than modified)
- Subtree AND ancestor queries both O(1)
- Move operations are bounded by subtree size (acceptable for org changes)
- No string parsing or range recalculation
- Works with Django ORM natively (just another model)

### 5.3 Org Unit Abstraction

Instead of separate Department and "Team" models, introduce a unified **OrgUnit** concept:

```
OrgUnit types:
  - company       (root — the tenant itself)
  - division      (top-level business units)
  - department    (traditional departments)
  - team          (cross-functional or project teams)
  - cost_center   (financial grouping)
  - location      (geographical)
```

This allows modelling REAL org structures:

- "Engineering" (department) contains "Backend Team" (team) and "Frontend Team" (team)
- A user can be in "Engineering" (primary) AND "Project Alpha" (team)
- "New York Office" (location) contains multiple departments across divisions

### 5.4 Permission Model — RBAC + Contextual Conditions

Current: `Permission = resource_type × action` (binary)

New: `Permission = resource_type × action × optional_condition`

Conditions are JSON-encoded rules evaluated at runtime:

```json
{
  "resource_type": "document",
  "action": "read",
  "conditions": {
    "department": "own",
    "classification_level": { "lte": 3 }
  }
}
```

Meaning: "Can read documents in own department with classification ≤ 3"

Engine evaluates conditions against the request context:

- `"own"` → user's own department/resource
- `{"lte": 3}` → less-than-or-equal comparison
- `{"in": ["public", "restricted"]}` → set membership
- `null` → no condition (global permission)

### 5.5 Effective Permissions Engine

A core system capability: **given a user, compute exactly what they can do.**

```
Effective Permissions for User X:

1. Collect all roles (direct + inherited via role hierarchy)
2. Collect all org units (primary + additional memberships)
3. For each role:
   a. Get all permissions (direct + inherited from parent roles)
   b. Evaluate conditions against user context (dept, clearance, etc.)
4. Merge: ALLOW overridden by DENY
5. Result: { "document:read": {conditions}, "document:create": true, ... }
```

This powers:

- Admin preview: "What can this user access?"
- Self-service: "What can I access?"
- Debugging: "Why can't I see this document?"

---

## 6. Architecture Design

### 6.1 Module Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         API Layer                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ OrgUnit  │ │  Role    │ │ User     │ │  Permission      │  │
│  │ ViewSet  │ │ ViewSet  │ │ ViewSet  │ │  ViewSet         │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘  │
│       │             │            │                 │            │
├───────┼─────────────┼────────────┼─────────────────┼────────────┤
│       │      Service Layer       │                 │            │
│  ┌────▼──────────────────────────▼─────────────────▼─────────┐ │
│  │              OrgHierarchyService                          │ │
│  │  - get_subtree(node_id)   - get_ancestors(node_id)        │ │
│  │  - move_node(node, new_parent) - get_tree(tenant)         │ │
│  │  - get_path(node_id)      - validate_move(node, target)   │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              RoleHierarchyService                         │ │
│  │  - resolve_roles(user)    - get_effective_permissions()    │ │
│  │  - has_permission(user, resource, action, context)        │ │
│  │  - get_permission_matrix(role)  - preview_access(user)    │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              AccessResolutionService                       │ │
│  │  - resolve_document_access(user)                          │ │
│  │  - check_classification_clearance(user, document)         │ │
│  │  - evaluate_conditions(permission, context)               │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                      Data Layer                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ OrgUnit  │ │OrgUnit   │ │  Role    │ │ Role             │  │
│  │          │ │Closure   │ │          │ │ Closure          │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │Permission│ │RolePerm  │ │ UserRole │ │ UserOrgUnit      │  │
│  │          │ │          │ │          │ │ (membership)     │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                      Cache Layer (Redis)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  user:{id}:roles   user:{id}:permissions                │   │
│  │  user:{id}:org_units   user:{id}:effective_perms        │   │
│  │  tenant:{id}:org_tree   role:{id}:all_perms             │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 Dependency Graph

```
core.Tenant ◄─── core.OrgUnit ◄─── core.OrgUnitClosure
                      ▲
                      │
                core.User ──────► core.UserOrgUnit (membership)
                      │
                      ▼
              rbac.UserRole ────► rbac.Role ◄─── rbac.RoleClosure
                                    │
                                    ▼
                              rbac.RolePermission ──► rbac.Permission
                                                          │
                                                          ▼
                                                  rbac.PermissionCondition

              documents.DocumentAccess ──► (OrgUnit | Role | User via FK)
```

### 6.3 Consistency with Project Architecture

The new design maintains the existing project patterns:

| Pattern                   | Current                      | Maintained in New Design              |
| ------------------------- | ---------------------------- | ------------------------------------- |
| UUID primary keys         | ✅ All models                | ✅ Yes                                |
| Tenant FK on all models   | ✅ Enforced                  | ✅ Yes                                |
| Service layer pattern     | ✅ `rbac/services/`          | ✅ Expanded services                  |
| DRF ViewSets              | ✅ `api/views/admin.py`      | ✅ New ViewSets follow same pattern   |
| Serializer validation     | ✅ Cross-tenant prevention   | ✅ Enhanced with hierarchy validation |
| Redis caching             | ✅ Per-user role/perm cache  | ✅ Event-driven cache invalidation    |
| Signal-based invalidation | ✅ `post_save`/`post_delete` | ✅ Extended to closure tables         |
| Middleware enforcement    | ✅ TenantIsolation           | ✅ Unchanged                          |
| Notification integration  | ✅ On CRUD events            | ✅ Extended to new events             |
| Audit logging             | ✅ Middleware-based          | ✅ Unchanged                          |

---

## 7. Data Model Design

### 7.1 OrgUnit (replaces Department)

```python
class OrgUnit(models.Model):
    """
    Unified organisational unit supporting multiple hierarchy types.
    Replaces the flat Department model with a typed, closure-table-backed tree.
    """
    ORG_UNIT_TYPES = [
        ('company', 'Company'),           # Root node (1 per tenant)
        ('division', 'Division'),         # Top-level business units
        ('department', 'Department'),     # Traditional departments
        ('team', 'Team'),                 # Cross-functional or project teams
        ('cost_center', 'Cost Center'),   # Financial grouping
        ('location', 'Location'),         # Geographical
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='org_units')
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, blank=True)           # Short code: "ENG", "HR-NYC"
    description = models.TextField(blank=True)
    unit_type = models.CharField(max_length=20, choices=ORG_UNIT_TYPES)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    depth = models.PositiveIntegerField(default=0)               # 0 = root
    path = models.CharField(max_length=1000, blank=True)         # Materialized path: "/company/division/dept"
    sibling_order = models.PositiveIntegerField(default=0)       # For manual ordering
    head = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='headed_units')
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)        # Extensible attributes
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'org_units'
        unique_together = [['tenant', 'code']]  # Code must be unique within tenant
        indexes = [
            models.Index(fields=['tenant', 'unit_type']),
            models.Index(fields=['tenant', 'parent']),
            models.Index(fields=['tenant', 'depth']),
            models.Index(fields=['path']),                        # For LIKE queries on path
        ]
```

### 7.2 OrgUnitClosure (tree traversal)

```python
class OrgUnitClosure(models.Model):
    """
    Closure table for O(1) subtree and ancestor queries.
    Every ancestor-descendant pair is stored as a row.
    Self-referencing row (depth=0) included for each node.
    """
    ancestor = models.ForeignKey(OrgUnit, on_delete=models.CASCADE, related_name='descendant_links')
    descendant = models.ForeignKey(OrgUnit, on_delete=models.CASCADE, related_name='ancestor_links')
    depth = models.PositiveIntegerField()  # 0 = self, 1 = direct child, 2 = grandchild...

    class Meta:
        db_table = 'org_unit_closure'
        unique_together = [['ancestor', 'descendant']]
        indexes = [
            models.Index(fields=['ancestor', 'depth']),
            models.Index(fields=['descendant', 'depth']),
        ]
```

**Query examples:**

```sql
-- Get all descendants of "Engineering" (one query, O(1)):
SELECT descendant_id FROM org_unit_closure
WHERE ancestor_id = 'eng-uuid' AND depth > 0;

-- Get all ancestors of "Backend Team" (one query, O(1)):
SELECT ancestor_id FROM org_unit_closure
WHERE descendant_id = 'backend-uuid' AND depth > 0;

-- Get direct children only:
SELECT descendant_id FROM org_unit_closure
WHERE ancestor_id = 'eng-uuid' AND depth = 1;

-- Get full subtree as tree (with depth for indentation):
SELECT ou.*, c.depth as tree_depth FROM org_units ou
JOIN org_unit_closure c ON c.descendant_id = ou.id
WHERE c.ancestor_id = 'root-uuid'
ORDER BY ou.path;
```

### 7.3 UserOrgUnit (multi-membership)

```python
class UserOrgUnit(models.Model):
    """
    User membership in org units. Supports multi-membership.
    One membership is marked as primary (for default context).
    """
    MEMBERSHIP_TYPES = [
        ('primary', 'Primary'),       # Main department
        ('secondary', 'Secondary'),   # Additional team/project
        ('temporary', 'Temporary'),   # Time-bound assignment
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='org_memberships')
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.CASCADE, related_name='members')
    membership_type = models.CharField(max_length=20, choices=MEMBERSHIP_TYPES, default='primary')
    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)     # For temporary assignments
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'user_org_units'
        unique_together = [['user', 'org_unit']]
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['org_unit', 'is_active']),
            models.Index(fields=['expires_at']),                  # For expiration cleanup job
        ]
```

### 7.4 Enhanced User Model (additions)

```python
# New fields to add to existing User model:
    employee_id = models.CharField(max_length=50, blank=True)          # HR employee ID
    job_title = models.CharField(max_length=200, blank=True)           # Job title / designation
    manager = models.ForeignKey('self', on_delete=models.SET_NULL,
                                null=True, blank=True, related_name='direct_reports')
    clearance_level = models.PositiveIntegerField(default=0)           # 0-5, matches doc classification
    employment_type = models.CharField(max_length=20, choices=[
        ('full_time', 'Full Time'), ('part_time', 'Part Time'),
        ('contractor', 'Contractor'), ('intern', 'Intern'),
    ], default='full_time')
    hired_at = models.DateField(null=True, blank=True)
```

### 7.5 Enhanced Role Model

```python
class Role(models.Model):
    # ... existing fields ...

    max_users = models.PositiveIntegerField(null=True, blank=True)     # Max users that can hold this role
    priority = models.PositiveIntegerField(default=0)                  # For conflict resolution (higher wins)
    scope_type = models.CharField(max_length=20, choices=[
        ('global', 'Global'),           # Applies everywhere in tenant
        ('org_unit', 'Org Unit'),       # Applies only within a specific org unit subtree
    ], default='global')
    scope_org_unit = models.ForeignKey(OrgUnit, null=True, blank=True,
                                       on_delete=models.CASCADE, related_name='scoped_roles')
```

### 7.6 RoleClosure (role hierarchy — same pattern)

```python
class RoleClosure(models.Model):
    """Closure table for role hierarchy — same pattern as OrgUnitClosure."""
    ancestor = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='descendant_role_links')
    descendant = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='ancestor_role_links')
    depth = models.PositiveIntegerField()

    class Meta:
        db_table = 'role_closure'
        unique_together = [['ancestor', 'descendant']]
        indexes = [
            models.Index(fields=['ancestor', 'depth']),
            models.Index(fields=['descendant', 'depth']),
        ]
```

### 7.7 Enhanced Permission Model

```python
class Permission(models.Model):
    # ... existing fields ...

    conditions = models.JSONField(default=dict, blank=True)
    """
    Optional conditions for contextual permissions:
    {} = no condition (unrestricted)
    {"department": "own"} = only in user's own org unit
    {"classification_level": {"lte": 3}} = docs with classification ≤ 3
    {"visibility_type": {"in": ["public", "restricted"]}} = subset of visibilities
    """

    is_deny = models.BooleanField(default=False)
    """If True, this permission DENIES rather than GRANTS. Deny always wins."""
```

### 7.8 Enhanced UserRole (time-bound)

```python
class UserRole(models.Model):
    # ... existing fields ...

    assigned_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='role_assignments_made')
    expires_at = models.DateTimeField(null=True, blank=True)    # Auto-expire temporary roles
    is_active = models.BooleanField(default=True)
    reason = models.CharField(max_length=500, blank=True)        # Why this role was assigned

    class Meta:
        indexes = [
            # ... existing ...
            models.Index(fields=['expires_at']),
        ]
```

### 7.9 Enhanced DocumentAccess (proper FKs)

```python
class DocumentAccess(models.Model):
    """
    Replaces polymorphic UUID with proper FKs.
    Each row is one type of grant (only one FK is non-null).
    """
    ACCESS_TYPE_CHOICES = [
        ('role', 'Role'),
        ('org_unit', 'Org Unit'),     # Was 'department'
        ('user', 'User'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='access_grants')
    access_type = models.CharField(max_length=20, choices=ACCESS_TYPE_CHOICES)

    # Proper FKs — only one is non-null based on access_type
    role = models.ForeignKey(Role, on_delete=models.CASCADE, null=True, blank=True, related_name='document_grants')
    org_unit = models.ForeignKey(OrgUnit, on_delete=models.CASCADE, null=True, blank=True, related_name='document_grants')
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='document_grants')

    include_descendants = models.BooleanField(default=True)        # For org_unit: include child units?
    granted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='granted_accesses')
    expires_at = models.DateTimeField(null=True, blank=True)       # Time-bound access
    created_at = models.DateTimeField(auto_now_add=True)
```

### 7.10 Complete ERD

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   Tenant    │     │    OrgUnit      │     │ OrgUnitClosure   │
│─────────────│     │─────────────────│     │──────────────────│
│ id (PK)     │◄────│ tenant (FK)     │◄────│ ancestor (FK)    │
│ name        │     │ id (PK)         │     │ descendant (FK)  │
│ slug        │     │ name            │     │ depth            │
│ is_active   │     │ code            │     └──────────────────┘
└──────┬──────┘     │ unit_type       │
       │            │ parent (FK self)│
       │            │ depth           │
       │            │ path            │     ┌──────────────────┐
       │            │ head (FK User)  │     │ UserOrgUnit      │
       │            │ sibling_order   │     │──────────────────│
       │            │ is_active       │◄────│ org_unit (FK)    │
       │            └────────┬────────┘     │ user (FK)        │
       │                     │              │ membership_type  │
       │                     │              │ expires_at       │
       │            ┌────────▼────────┐     └────────┬─────────┘
       │            │     User        │              │
       ├───────────►│─────────────────│◄─────────────┘
       │            │ id (PK)         │
       │            │ tenant (FK)     │     ┌──────────────────┐
       │            │ email           │     │   UserRole       │
       │            │ manager (FK self)────►│──────────────────│
       │            │ clearance_level │     │ user (FK)        │
       │            │ employee_id     │     │ role (FK)        │
       │            │ job_title       │     │ assigned_by (FK) │
       │            │ employment_type │     │ expires_at       │
       │            └─────────────────┘     │ is_active        │
       │                                    └────────┬─────────┘
       │                                             │
       │            ┌─────────────────┐     ┌────────▼─────────┐
       │            │ RoleClosure     │     │     Role         │
       │            │─────────────────│     │──────────────────│
       │            │ ancestor (FK)   │◄────│ id (PK)          │
       ├───────────►│ descendant (FK) │     │ tenant (FK)      │
       │            │ depth           │     │ name             │
       │            └─────────────────┘     │ parent (FK self) │
       │                                    │ is_system_role   │
       │                                    │ scope_type       │
       │                                    │ scope_org_unit   │
       │                                    │ priority         │
       │                                    └────────┬─────────┘
       │                                             │
       │                                    ┌────────▼─────────┐
       │                                    │ RolePermission   │
       │                                    │──────────────────│
       │                                    │ role (FK)        │
       │                                    │ permission (FK)  │
       │                                    └────────┬─────────┘
       │                                             │
       │                                    ┌────────▼─────────┐
       │                                    │   Permission     │
       │                                    │──────────────────│
       │                                    │ id (PK)          │
       │                                    │ resource_type    │
       │                                    │ action           │
       │                                    │ conditions (JSON)│
       │                                    │ is_deny          │
       │                                    └──────────────────┘
       │
       │            ┌─────────────────────┐
       └───────────►│  DocumentAccess     │
                    │─────────────────────│
                    │ document (FK)       │
                    │ access_type         │
                    │ role (FK, nullable) │
                    │ org_unit (FK, null) │
                    │ user (FK, nullable) │
                    │ include_descendants │
                    │ expires_at          │
                    └─────────────────────┘
```

---

## 8. API Design

### 8.1 New/Enhanced Endpoints

| Method   | Endpoint                                    | Purpose                                           | Auth         |
| -------- | ------------------------------------------- | ------------------------------------------------- | ------------ |
| `GET`    | `/api/v1/org-units/`                        | List org units (paginated, filterable by type)    | TenantAdmin  |
| `POST`   | `/api/v1/org-units/`                        | Create org unit                                   | TenantAdmin  |
| `GET`    | `/api/v1/org-units/{id}/`                   | Get org unit detail                               | TenantAdmin  |
| `PATCH`  | `/api/v1/org-units/{id}/`                   | Update org unit                                   | TenantAdmin  |
| `DELETE` | `/api/v1/org-units/{id}/`                   | Delete org unit (blocks if has members)           | TenantAdmin  |
| `GET`    | `/api/v1/org-units/tree/`                   | **Full org tree** — hierarchical JSON             | TenantMember |
| `GET`    | `/api/v1/org-units/{id}/subtree/`           | Subtree rooted at this unit                       | TenantMember |
| `GET`    | `/api/v1/org-units/{id}/ancestors/`         | Ancestor chain to root                            | TenantMember |
| `POST`   | `/api/v1/org-units/{id}/move/`              | Move unit to new parent                           | TenantAdmin  |
| `GET`    | `/api/v1/org-units/{id}/members/`           | Members of this unit                              | TenantAdmin  |
| `POST`   | `/api/v1/org-units/{id}/members/`           | Add member to unit                                | TenantAdmin  |
| `DELETE` | `/api/v1/org-units/{id}/members/{user_id}/` | Remove member                                     | TenantAdmin  |
|          |                                             |                                                   |              |
| `GET`    | `/api/v1/roles/`                            | List roles (paginated)                            | TenantAdmin  |
| `GET`    | `/api/v1/roles/tree/`                       | Role hierarchy as tree                            | TenantAdmin  |
| `GET`    | `/api/v1/roles/{id}/permissions/`           | All permissions for role (including inherited)    | TenantAdmin  |
| `PUT`    | `/api/v1/roles/{id}/permissions/`           | Set permissions for role (replace all)            | TenantAdmin  |
| `GET`    | `/api/v1/roles/{id}/effective-members/`     | All users who hold this role (direct + inherited) | TenantAdmin  |
|          |                                             |                                                   |              |
| `GET`    | `/api/v1/permissions/`                      | List all available permissions                    | TenantAdmin  |
| `GET`    | `/api/v1/permissions/matrix/`               | **Permission matrix** — roles × permissions grid  | TenantAdmin  |
|          |                                             |                                                   |              |
| `GET`    | `/api/v1/users/{id}/effective-permissions/` | Compute all permissions for user                  | TenantAdmin  |
| `GET`    | `/api/v1/users/{id}/accessible-documents/`  | Preview what documents user can access            | TenantAdmin  |
| `GET`    | `/api/v1/users/{id}/org-units/`             | All org units user belongs to                     | TenantAdmin  |
| `GET`    | `/api/v1/users/{id}/reporting-chain/`       | Manager → manager → ... to top                    | TenantMember |

### 8.2 Pagination Standard

All list endpoints use cursor-based pagination:

```json
{
  "count": 1234,
  "next": "https://api/v1/users/?cursor=abc123",
  "previous": null,
  "results": [...]
}
```

Query parameters:

- `?page_size=25` (default 25, max 100)
- `?cursor=abc123` (opaque cursor from `next`/`previous`)
- `?search=query` (full-text search on name/email fields)
- `?ordering=name,-created_at` (sortable fields)

### 8.3 Tree Response Format

```json
// GET /api/v1/org-units/tree/
{
  "id": "uuid-company",
  "name": "Acme Corp",
  "code": "ACME",
  "unit_type": "company",
  "depth": 0,
  "member_count": 0,
  "head": { "id": "uuid", "name": "John CEO" },
  "children": [
    {
      "id": "uuid-eng",
      "name": "Engineering",
      "code": "ENG",
      "unit_type": "division",
      "depth": 1,
      "member_count": 45,
      "head": { "id": "uuid", "name": "Jane CTO" },
      "children": [
        {
          "id": "uuid-backend",
          "name": "Backend Team",
          "code": "ENG-BE",
          "unit_type": "team",
          "depth": 2,
          "member_count": 12,
          "head": null,
          "children": []
        }
      ]
    }
  ]
}
```

### 8.4 Permission Matrix Response

```json
// GET /api/v1/permissions/matrix/
{
  "permissions": [
    {"id": "uuid-1", "name": "document:read", "resource_type": "document", "action": "read"},
    {"id": "uuid-2", "name": "document:create", "resource_type": "document", "action": "create"},
    ...
  ],
  "roles": [
    {
      "id": "uuid-admin",
      "name": "Tenant Administrator",
      "is_system_role": true,
      "grants": {
        "uuid-1": {"granted": true, "inherited_from": null},
        "uuid-2": {"granted": true, "inherited_from": null}
      }
    },
    {
      "id": "uuid-editor",
      "name": "Document Editor",
      "is_system_role": false,
      "grants": {
        "uuid-1": {"granted": true, "inherited_from": "uuid-admin"},
        "uuid-2": {"granted": true, "inherited_from": null}
      }
    }
  ]
}
```

---

## 9. Security Design

### 9.1 Threat Model

| Threat                       | Attack Vector                                           | Mitigation                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Privilege escalation**     | Tenant admin assigns themselves super-admin permissions | System roles/permissions are immutable. `is_system_role` roles cannot be modified. Platform-level permissions cannot be assigned to tenant roles |
| **Cross-tenant data access** | Manipulated tenant_id in request                        | Middleware injects tenant from authenticated user. No client-supplied tenant_id accepted. Every queryset filtered                                |
| **Circular hierarchy**       | Create A→B→C→A cycle                                    | Model-level validation: `validate_parent()` traverses ancestors to check for cycles. Closure table makes this O(1)                               |
| **Hierarchy depth bomb**     | Create 1000-level deep tree to DoS traversal            | `MAX_DEPTH` constant (e.g., 15). Validated on create/move. Closure table handles deep trees efficiently anyway                                   |
| **Orphaned permissions**     | Delete role but its grants remain                       | FK cascade on RolePermission. Proper FK on DocumentAccess (replacing polymorphic UUID)                                                           |
| **Time-bomb access**         | Temporary access never revoked                          | Celery periodic task checks `expires_at` on UserRole and DocumentAccess, deactivates expired entries                                             |
| **Cache poisoning**          | Stale cache serves outdated permissions                 | Signal-based invalidation on every write. Short TTL (1h max). Audit log tracks all changes                                                       |
| **Bulk enumeration**         | Attacker lists all users/departments                    | Pagination with max page_size. Rate limiting on admin endpoints. Tenant-scoped queries only                                                      |

### 9.2 Permission Evaluation Order

```
1. DENY rules evaluated first (deny always wins)
2. Superuser → all ALLOW
3. System "Tenant Administrator" role → all ALLOW within tenant
4. Explicit ALLOW via direct role permissions
5. Inherited ALLOW via parent role permissions
6. Conditional ALLOW evaluated against request context
7. Default: DENY (no matching rule = denied)
```

### 9.3 Data Integrity Constraints

| Constraint                      | Enforcement Level                                     |
| ------------------------------- | ----------------------------------------------------- |
| Tenant isolation                | Middleware + queryset + DB index                      |
| No circular hierarchy           | Serializer validation + closure table check           |
| Max depth limit                 | Model `clean()` method + serializer                   |
| Unique org unit code per tenant | DB `unique_together`                                  |
| One primary membership per user | Application-level (allow override in service)         |
| System roles immutable          | ViewSet `destroy()` + `update()` guards               |
| FK referential integrity        | DB-level ForeignKey constraints                       |
| Closure table consistency       | Service-layer managed (insert/delete/move operations) |

---

## 10. Scalability & Reliability Design

### 10.1 Performance Targets

| Operation                        | Current                | Target                                   |
| -------------------------------- | ---------------------- | ---------------------------------------- |
| Get full org tree (100 nodes)    | N/A (no tree endpoint) | < 50ms                                   |
| Get full org tree (10,000 nodes) | N/A                    | < 500ms                                  |
| Get subtree (any depth)          | O(N) recursive         | < 20ms (closure table join)              |
| Get ancestors                    | O(depth) iterative     | < 5ms (closure table join)               |
| Permission check (cached)        | < 1ms                  | < 1ms (unchanged)                        |
| Permission check (cold)          | ~5ms (2 DB queries)    | < 10ms (closure + join)                  |
| Move org unit (100 node subtree) | N/A                    | < 200ms (delete + reinsert closure rows) |
| User effective permissions       | N/A                    | < 50ms                                   |

### 10.2 Caching Strategy

| Cache Key Pattern           | TTL   | Invalidation Trigger                                             |
| --------------------------- | ----- | ---------------------------------------------------------------- |
| `tenant:{id}:org_tree`      | 10min | Any OrgUnit change in tenant                                     |
| `user:{id}:roles`           | 1h    | UserRole create/delete for this user                             |
| `user:{id}:permissions`     | 30min | UserRole change OR RolePermission change for any of user's roles |
| `user:{id}:org_units`       | 1h    | UserOrgUnit create/delete for this user                          |
| `user:{id}:effective_perms` | 15min | Any role/permission change affecting this user                   |
| `role:{id}:all_perms`       | 1h    | RolePermission change OR parent role change                      |
| `user:{id}:accessible_docs` | 15min | DocumentAccess change OR role change                             |

**Invalidation approach:** Event-driven via Django signals. On RolePermission change → find all users with that role → invalidate their caches. Uses `pipeline()` for batch Redis deletes.

### 10.3 Database Indexing Strategy

```python
# OrgUnit indexes (in addition to standard)
models.Index(fields=['tenant', 'unit_type', 'is_active'])   # Filter by type
models.Index(fields=['path'])                                 # Materialized path LIKE queries
models.Index(fields=['tenant', 'depth'])                      # Level-based filtering

# OrgUnitClosure indexes
models.Index(fields=['ancestor', 'depth'])                    # "Get descendants at depth N"
models.Index(fields=['descendant'])                           # "Get all ancestors"

# UserOrgUnit indexes
models.Index(fields=['user', 'is_active'])                    # "User's active memberships"
models.Index(fields=['org_unit', 'is_active'])                # "Members of this unit"
models.Index(fields=['expires_at'])                           # Expiration cleanup job

# UserRole indexes
models.Index(fields=['expires_at'])                           # Expiration cleanup job

# DocumentAccess with proper FKs
models.Index(fields=['role'])                                 # "All docs accessible via role"
models.Index(fields=['org_unit'])                             # "All docs accessible via org unit"
models.Index(fields=['user'])                                 # "All docs accessible via direct grant"
```

### 10.4 Reliability

| Concern                       | Design                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Closure table consistency** | All closure table modifications wrapped in `transaction.atomic()`. If insert fails, entire operation rolls back |
| **Cache failure**             | Redis down → bypass cache, query DB directly. `try/except` wraps all cache operations (already in current code) |
| **Concurrent moves**          | `select_for_update()` on the OrgUnit being moved to prevent race conditions                                     |
| **Bulk import**               | Background Celery task with progress tracking. Atomic: entire import succeeds or rolls back                     |
| **Cascade deletes**           | Deleting an OrgUnit cascades to OrgUnitClosure + UserOrgUnit. Blocked in API if members exist                   |

---

## 11. Frontend Design

### 11.1 New Components Required

| Component                     | Purpose                                                                                            | Priority |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| **OrgTree**                   | Interactive tree visualization: expand/collapse, drag-drop reorder/reparent, node details on click | CRITICAL |
| **OrgChart**                  | Visual org chart (boxes + lines, like Lucidchart) for presentation view                            | HIGH     |
| **PermissionMatrix**          | Roles × Permissions grid with checkboxes, inherited permissions shown as locked checks             | CRITICAL |
| **MembershipManager**         | Add/remove user memberships in org units, show primary vs secondary                                | HIGH     |
| **EffectivePermissionsPanel** | "What can this user do?" preview — resolves all rules and displays                                 | HIGH     |
| **UserOrgProfile**            | Enhanced user detail: job title, manager, reporting chain, memberships, clearance                  | MEDIUM   |
| **RoleTree**                  | Same tree component but for role hierarchy                                                         | MEDIUM   |
| **BulkActions**               | Multi-select + bulk assign role / move department / toggle status                                  | MEDIUM   |

### 11.2 OrgTree Component Specification

```
┌─ Organisation Structure ──────────────────────────────────┐
│                                                            │
│  🏢 Acme Corp (company)                              [+]  │
│  ├── 🏛️ Engineering (division)  — Jane CTO           [+]  │
│  │   ├── 👥 Backend Team (team) — 12 members              │
│  │   ├── 👥 Frontend Team (team) — 8 members              │
│  │   └── 👥 DevOps (team) — 5 members                     │
│  ├── 🏛️ Product (division) — Bob VP               [+]  │
│  │   ├── 👥 Design (team) — 6 members                     │
│  │   └── 👥 Research (team) — 4 members                    │
│  ├── 📂 Human Resources (department) — Alice HR Dir       │
│  └── 📂 Finance (department) — Carol CFO                  │
│                                                            │
│  [+ Add Unit]  [📊 Chart View]  [🔍 Search]               │
└────────────────────────────────────────────────────────────┘
```

Features:

- Expand/collapse subtrees
- Drag node to reparent (with validation: no cycles, same tenant)
- Click node → side panel with: details, members list, head person, permissions
- Icons by unit_type
- Member count badges
- Search/filter by name or code
- Switch between: Tree view ↔ Chart view (visual boxes-and-lines)

### 11.3 Permission Matrix Specification

```
┌─ Role Permission Matrix ──────────────────────────────────┐
│                                                            │
│  Resource    Action    Admin  Editor  Viewer  Analyst      │
│  ──────────  ────────  ─────  ──────  ──────  ────────     │
│  document    read      🔒 ✓    ✓       ✓       ✓          │
│  document    create    🔒 ✓    ✓       ☐       ☐          │
│  document    update    🔒 ✓    ✓       ☐       ☐          │
│  document    delete    🔒 ✓    ☐       ☐       ☐          │
│  document    upload    🔒 ✓    ✓       ☐       ☐          │
│  document    download  🔒 ✓    ✓       ✓       ✓          │
│  role        read      🔒 ✓    ☐       ☐       ☐          │
│  role        manage    🔒 ✓    ☐       ☐       ☐          │
│  user        read      🔒 ✓    ☐       ☐       ☐          │
│  user        manage    🔒 ✓    ☐       ☐       ☐          │
│  ...                                                       │
│                                                            │
│  🔒 = inherited from parent role (cannot uncheck)          │
│  ✓  = directly granted (can toggle)                        │
│  ☐  = not granted                                          │
│                                                            │
│  [Save Changes]                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 12. Migration Strategy

### 12.1 Backward Compatibility

The new design must coexist with existing data during migration:

| Current                                       | Migration Path                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Department` model                            | Create `OrgUnit` entries with `unit_type='department'` for each. Build closure table. Keep `Department` model temporarily with FK proxy |
| `User.department` FK                          | Create `UserOrgUnit(membership_type='primary')` for each user-department pair. Deprecate `User.department` field                        |
| `Role` model                                  | Add closure table alongside existing adjacency list. Both work simultaneously                                                           |
| `DocumentAccess.access_id` (polymorphic UUID) | Migrate to proper FK columns (`role_id`, `org_unit_id`, `user_id`). Run data migration to populate                                      |
| Frontend pages                                | Add new pages alongside existing. Feature-flag new UI. Gradual rollout                                                                  |

### 12.2 Migration Order

```
Phase 1: Schema additions (non-breaking)
  ├── Add new fields to User (employee_id, job_title, manager, clearance_level, etc.)
  ├── Create OrgUnit + OrgUnitClosure models
  ├── Create UserOrgUnit model
  ├── Create RoleClosure model
  ├── Add new fields to Role (scope_type, scope_org_unit, priority, max_users)
  ├── Add new fields to Permission (conditions, is_deny)
  └── Add new fields to UserRole (expires_at, assigned_by, reason, is_active)

Phase 2: Data migration
  ├── Populate OrgUnit from existing Departments
  ├── Build OrgUnitClosure table from parent relationships
  ├── Populate UserOrgUnit from User.department
  ├── Build RoleClosure table from Role.parent relationships
  └── Migrate DocumentAccess to proper FKs

Phase 3: Service layer swap
  ├── New OrgHierarchyService (closure-table based)
  ├── Enhanced RoleHierarchyService (uses RoleClosure)
  ├── Enhanced AccessResolutionService (classification + conditions)
  └── New API endpoints (tree, matrix, effective-permissions)

Phase 4: Frontend rollout
  ├── OrgTree component
  ├── Permission matrix
  ├── Enhanced user profile
  └── Deprecate old flat views

Phase 5: Cleanup
  ├── Remove User.department FK (replaced by UserOrgUnit)
  ├── Remove old Department model (replaced by OrgUnit)
  └── Remove DocumentAccess.access_id (replaced by proper FKs)
```

---

## 13. Implementation Roadmap

### Phase 1: Foundation — Hierarchy Engine

| #   | Task                                                        | Files                                               | Effort |
| --- | ----------------------------------------------------------- | --------------------------------------------------- | ------ |
| 1   | Create OrgUnit + OrgUnitClosure models                      | `core/models.py`, migration                         | Medium |
| 2   | Build OrgHierarchyService (CRUD + closure table management) | new `core/services/org_hierarchy.py`                | Large  |
| 3   | Create UserOrgUnit model                                    | `core/models.py`, migration                         | Small  |
| 4   | Build RoleClosure model + service                           | `rbac/models.py`, `rbac/services/role_hierarchy.py` | Medium |
| 5   | Data migration: Department → OrgUnit + closure              | migration file                                      | Medium |
| 6   | Data migration: User.department → UserOrgUnit               | migration file                                      | Small  |
| 7   | Data migration: Role hierarchy → RoleClosure                | migration file                                      | Small  |

### Phase 2: Enhanced RBAC

| #   | Task                                                                           | Files                                      | Effort |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------ | ------ |
| 8   | Add User model fields (employee_id, job_title, manager, clearance_level, etc.) | `core/models.py`, migration                | Small  |
| 9   | Add Permission conditions + is_deny                                            | `rbac/models.py`, migration                | Small  |
| 10  | Add UserRole enhancements (expires_at, assigned_by, is_active)                 | `rbac/models.py`, migration                | Small  |
| 11  | Build condition evaluation engine                                              | `rbac/services/condition_engine.py`        | Medium |
| 12  | Build effective permissions resolver                                           | `rbac/services/authorization.py` (enhance) | Medium |
| 13  | Upgrade DocumentAccess to proper FKs                                           | `documents/models.py`, migration           | Medium |
| 14  | Upgrade AccessResolutionService (classification + closure-based dept grants)   | `documents/services/access.py`             | Medium |
| 15  | Celery task: expire time-bound roles and access                                | `rbac/tasks.py`                            | Small  |

### Phase 3: API Layer

| #   | Task                                                        | Files                          | Effort |
| --- | ----------------------------------------------------------- | ------------------------------ | ------ |
| 16  | OrgUnit ViewSet + tree/subtree/ancestors/move endpoints     | `api/views/org.py`             | Large  |
| 17  | Enhanced Role ViewSet + tree/permissions endpoints          | `api/views/admin.py` (enhance) | Medium |
| 18  | Permission matrix endpoint                                  | `api/views/admin.py`           | Medium |
| 19  | User effective-permissions + accessible-documents endpoints | `api/views/admin.py`           | Medium |
| 20  | Cursor-based pagination on all list endpoints               | All ViewSets                   | Medium |
| 21  | Search + filtering on all endpoints                         | All ViewSets                   | Medium |
| 22  | Serializers for all new models/endpoints                    | `api/serializers/`             | Medium |

### Phase 4: Frontend

| #   | Task                                                      | Files                                     | Effort |
| --- | --------------------------------------------------------- | ----------------------------------------- | ------ |
| 23  | OrgTree component (expand/collapse, drag reparent)        | new `components/OrgTree.tsx`              | Large  |
| 24  | Permission matrix page                                    | new `pages/PermissionMatrix.tsx`          | Large  |
| 25  | Enhanced Users page (org profile, memberships, clearance) | `pages/Users.tsx`                         | Medium |
| 26  | Enhanced Roles page (tree view, permission editor)        | `pages/Roles.tsx`                         | Medium |
| 27  | Effective permissions panel                               | new `components/EffectivePermissions.tsx` | Medium |
| 28  | API services for new endpoints                            | `services/org.service.ts`, enhance others | Medium |
| 29  | Shared types directory                                    | `types/org.ts`, `types/rbac.ts`           | Small  |

### Phase 5: Cleanup & Polish

| #   | Task                                                                                            | Effort |
| --- | ----------------------------------------------------------------------------------------------- | ------ |
| 30  | Remove deprecated Department model + User.department FK                                         | Small  |
| 31  | Remove DocumentAccess.access_id polymorphic field                                               | Small  |
| 32  | Add bulk operations (CSV import, bulk role assign, bulk move)                                   | Medium |
| 33  | Comprehensive test suite for hierarchy operations, permission evaluation, and access resolution | Large  |

---

## Summary

| Dimension           | Current State                                  | After Redesign                                                                                |
| ------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Hierarchy Model** | Adjacency list (O(N) traversal)                | Closure table (O(1) subtree/ancestor queries)                                                 |
| **Org Structure**   | Department only (flat cards)                   | OrgUnit with types: company, division, dept, team, cost center, location                      |
| **User Membership** | Single department FK                           | Multi-membership (primary + secondary + temporary) with expiration                            |
| **User Profile**    | Name + email only                              | + employee_id, job_title, manager, clearance_level, hire_date, employment_type                |
| **Role Hierarchy**  | Adjacency list traversal                       | Closure table + scoped roles (global or org-unit-bound)                                       |
| **Permissions**     | Binary resource:action                         | + Conditions (ABAC), deny rules, inherited vs direct distinction                              |
| **Document Access** | 5 rules + polymorphic UUID                     | + Classification enforcement, proper FKs, time-bound access, descendant cascading             |
| **API**             | No pagination, no search, no tree              | Cursor pagination, full-text search, tree endpoints, permission matrix, effective-permissions |
| **Frontend**        | Flat card grids, no permission UI              | Interactive org tree, permission matrix, effective-permissions preview, org chart             |
| **Security**        | Middleware + queryset + cache                  | + Max depth, deny rules, time-bound, immutable system perms, condition engine                 |
| **Performance**     | N+1 hierarchy queries, O(N) cache invalidation | O(1) closure queries, event-driven batch invalidation, indexed payloads                       |

---

_This analysis covers 16 backend files + 6 frontend files spanning the organisation and RBAC modules._

_**Status:** Analysis and design complete. Implementation is ON HOLD until design review and approval._
