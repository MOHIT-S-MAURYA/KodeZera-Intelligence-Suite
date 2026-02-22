# Department API – Full Test Report

**Date:** 2026-02-22  
**Author:** Copilot (automated engineering session)  
**Environment:** Django 5 · DRF · SQLite (dev) · JWT auth  
**Test runner:** `scripts/test_departments_api.sh`  
**Result:** ✅ 27 / 27 passed

---

## 0 · Context

This report documents the complete audit, back-end rebuild, front-end rewrite, and API test run performed on the Department feature. The objective was to bring departments to the same architectural quality as the Users feature: real DB-backed data, security enforcement, computed fields, and a documented passing test suite.

---

## 1 · Pre-work Audit Findings

| Item | Before | After |
|------|--------|-------|
| `description` column | **Missing** from model | Added (`TextField blank=True`) |
| `DepartmentSerializer` fields | `id, name, parent (UUID), created_at` only | `+ description, parent_name, user_count, children_count` |
| Parent cross-tenant guard | **None** | `validate_parent()` checks `value.tenant_id == request.user.tenant_id` |
| Duplicate name (null parent) | Silent DB miss | `validate()` explicit query guard |
| Delete guard – users | **None** | `destroy()` returns 409 with message |
| Delete guard – children | **None** | `destroy()` returns 409 with message |
| N+1 on parent name | Yes | `select_related('parent')` in queryset |
| `user_count`, `children_count` | **Not annotated** | `annotate()` with `Count('users', distinct=True)` etc. |
| `PUT` verb allowed | Yes (overwrite risk) | `http_method_names` excludes `put`, only `patch` allowed |
| Frontend data source | 4 hardcoded mock records | Real API via `departmentService` |
| TypeScript types | Inline ad-hoc | `DepartmentRecord`, `CreateDepartmentPayload`, `UpdateDepartmentPayload` |

---

## 2 · Backend Changes

### 2.1 Model – `apps/core/models.py`

**What:** Added `description` field.  
**Why:** The frontend mock and design spec both referenced a description field. Without it, descriptions submitted by the UI were silently discarded.  
**When:** First change in the session — model must be updated before serializer or migration.

```python
description = models.TextField(blank=True, default='')
```

Also confirmed pre-existing `unique_together = [['tenant', 'name', 'parent']]`. **Problem discovered:** SQLite and PostgreSQL both skip UNIQUE enforcement when any column in the constraint is NULL, so two departments with the same name at the root level (`parent=NULL`) could coexist. Addressed in serializer (§2.2).

### 2.2 Migration – `apps/core/migrations/0004_add_department_description.py`

**What:** Auto-generated via `makemigrations`, applied via `migrate`.  
**Why:** Schema change must be version-controlled; running `check` post-migrate confirmed 0 issues.

### 2.3 Serializer – `apps/api/serializers/__init__.py` → `DepartmentSerializer`

**What:** Major upgrade from 6-line stub to ~90 lines.

**Added computed read-only fields:**

| Field | Source | Why |
|-------|--------|-----|
| `parent_name` | `SerializerMethodField` → `obj.parent.name` | Human-readable; parent UUID alone is useless in UI |
| `user_count` | `IntegerField(read_only=True)` from annotation | Needed for delete guard and UI badge |
| `children_count` | `IntegerField(read_only=True)` from annotation | Needed for delete guard and UI badge |

**Added `validate_parent()`:**
```python
def validate_parent(self, value):
    # 1. Cross-tenant guard
    if request and value.tenant_id != request.user.tenant_id:
        raise PermissionDenied(...)
    # 2. Self-parent guard
    if instance and value.pk == instance.pk:
        raise ValidationError(...)
```

**Added `validate()` — duplicate name guard:**  
The DB `unique_together` on `(tenant, name, parent)` does **not** fire when `parent IS NULL`. This is a confirmed SQLite/PG behaviour. The serializer's `validate()` method issues an explicit `filter(tenant=..., name=..., parent=...)` query and raises 400 if a conflict is found. Covers both NULL and non-NULL parent cases uniformly.

### 2.4 ViewSet – `apps/api/views/admin.py` → `DepartmentViewSet`

**What:** Rebuilt from 10-line stub.

**Key additions:**

```python
http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']
# PUT excluded: partial updates only; prevents accidental full-overwrite

def get_queryset(self):
    return (
        Department.objects
        .filter(tenant=self.request.user.tenant)   # tenant isolation
        .select_related('parent')                   # eliminates N+1 for parent_name
        .annotate(
            user_count=Count('users', distinct=True),
            children_count=Count('children', distinct=True),
        )
        .order_by('name')
    )

def perform_create(self, serializer):
    serializer.save(tenant=self.request.user.tenant)  # tenant never from client

def destroy(self, request, *args, **kwargs):
    dept = self.get_object()
    if dept.user_count > 0:
        return Response({'error': f'...'}, status=HTTP_409_CONFLICT)
    if dept.children_count > 0:
        return Response({'error': f'...'}, status=HTTP_409_CONFLICT)
    return super().destroy(...)
```

---

## 3 · Frontend Changes

### 3.1 `frontend/src/services/department.service.ts` — NEW FILE

**What:** Created typed service layer mirroring `user.service.ts`.

```typescript
departmentService.getAll()           // GET  /departments/
departmentService.create(payload)    // POST /departments/
departmentService.update(id, patch)  // PATCH /departments/{id}/
departmentService.remove(id)         // DELETE /departments/{id}/  — throws AxiosError for 409
```

**Why:** Components must never call `axios` directly; the service layer provides a stable contract, handles `results[]` vs plain array pagination, and is the single place to update the base URL.

### 3.2 `frontend/src/pages/Departments.tsx` — FULL REWRITE

**Before:** 4 hardcoded mock records, numeric string IDs, no API calls, `description` field did not exist in model.  
**After:** 352 lines, fully API-connected.

Feature | Implementation
--------|---------------
Data loading | `useEffect` → `departmentService.getAll()` → state
Skeleton loading | 4 animated placeholder cards during fetch
Error state | Inline error banner with retry button
Search | Client-side filter across `name`, `description`, `parent_name`
Delete guard (client) | Button disabled when `user_count > 0` or `children_count > 0`; tooltip explains why
Delete guard (server) | `handleDelete` catches 409 and shows `error.response.data.error` via `alert()`
Self-parent (client) | Parent `<select>` excludes `instance.id` in edit mode; validated before API call
Modal parent dropdown | Dynamic list from real API, excludes self in edit mode
`saving` state | Button `loading` flag prevents double-submit

**Build:** `npm run build` → `✓ built in 2.54s` · 0 TypeScript errors · `Departments-*.js` 7.71 kB

---

## 4 · Test Suite Results

Script: `scripts/test_departments_api.sh`  
Auth: `admin@demo.com` / `admin123` — `is_tenant_admin: True`

| # | Test | Method & Endpoint | Expected | Result |
|---|------|-------------------|----------|--------|
| T1 | List departments — pagination, computed fields | `GET /departments/` | 200 + `count`, `results`, `user_count`, `children_count` | ✅ 5 assertions |
| T2 | Create top-level dept | `POST /departments/` `{name, description}` | 201 + UUID id, `user_count:0`, no `tenant` leak | ✅ 6 assertions |
| T3 | Create child dept | `POST /departments/` `{name, parent: UUID}` | 201 + `parent_name` populated | ✅ 3 assertions |
| T4 | Retrieve parent — `children_count` updated | `GET /departments/{id}/` | 200 + `children_count:1` | ✅ 2 assertions |
| T5 | Patch name + description | `PATCH /departments/{id}/` | 200 + updated values returned | ✅ 3 assertions |
| T6 | Delete parent with live child | `DELETE /departments/{parent}/` | 409 + `error` key | ✅ 2 assertions |
| T7 | Delete empty child | `DELETE /departments/{child}/` | 204 empty body | ✅ 1 assertion |
| T8 | Delete parent (now childless) | `DELETE /departments/{parent}/` | 204 | ✅ 1 assertion |
| T9 | GET deleted UUID | `GET /departments/{deleted-id}/` | 404 | ✅ 1 assertion |
| T10 | Duplicate name at root (parent=null) | `POST /departments/` same name twice | 400 — serializer `validate()` fires | ✅ 1 assertion |
| T11 | Missing required `name` field | `POST /departments/` `{description only}` | 400 | ✅ 1 assertion |
| T12 | No auth token | `GET /departments/` | 401 | ✅ 1 assertion |

**Total: 27 / 27 assertions passed · 0 failures**

---

## 5 · Bug Found & Fixed During Testing

### Bug: Duplicate department names allowed at root level

**Discovered:** T10 returned HTTP 201 instead of 400 on the first run.  
**Root cause:** `unique_together = [['tenant', 'name', 'parent']]` in `Meta` — but SQL `UNIQUE` constraints ignore `NULL` values in any participating column. Two rows `(tenant_id, 'Foo', NULL)` are considered distinct by the database engine.  
**Fix:** Added `validate()` on `DepartmentSerializer`:
```python
def validate(self, attrs):
    qs = Department.objects.filter(tenant=tenant, name=name, parent=parent)
    if self.instance:
        qs = qs.exclude(pk=self.instance.pk)
    if qs.exists():
        raise ValidationError({'name': 'A department with this name already exists under the same parent.'})
    return attrs
```
This covers all cases: NULL parent (root), non-NULL parent (nested), and update (excludes self).  
**Verified:** T10 re-run → 400 ✅

---

## 6 · Security Summary

| Threat | Mitigation |
|--------|-----------|
| Tenant data leakage (list) | `filter(tenant=request.user.tenant)` in `get_queryset()` |
| Tenant injection on create | `perform_create` always sets `tenant=request.user.tenant`; client payload ignored |
| Cross-tenant parent (`parent` UUID from another tenant) | `validate_parent()` checks `value.tenant_id == request.user.tenant_id` |
| Self-referential cycle | `validate_parent()` checks `value.pk != instance.pk` |
| Orphan users on delete | `destroy()` returns 409 if `user_count > 0` |
| Broken parent chain on delete | `destroy()` returns 409 if `children_count > 0` |
| Overwrite via PUT | `http_method_names` excludes `put` |
| Unauthenticated access | `IsTenantAdmin` permission class; 401 for anonymous, 403 for non-admin |
| `tenant` field leakage in response | `tenant` not in `DepartmentSerializer.Meta.fields` |
| Duplicate name injection | `validate()` application-layer uniqueness check |

---

## 7 · Files Changed

| File | Type | Change |
|------|------|--------|
| `apps/core/models.py` | Backend | Added `description = TextField(blank=True, default='')` |
| `apps/core/migrations/0004_add_department_description.py` | Backend | New migration, applied |
| `apps/api/serializers/__init__.py` | Backend | `DepartmentSerializer` — full rebuild (~90 lines) |
| `apps/api/views/admin.py` | Backend | `DepartmentViewSet` — full rebuild (~60 lines) |
| `frontend/src/services/department.service.ts` | Frontend | New file — typed service layer |
| `frontend/src/pages/Departments.tsx` | Frontend | Full rewrite — 352 lines, zero mock data |
| `scripts/test_departments_api.sh` | Tests | New file — 12 test cases, 27 assertions |
| `design/department-api-test-report.md` | Docs | This file |
