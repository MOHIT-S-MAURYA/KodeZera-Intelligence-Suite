#!/usr/bin/env python3
"""
Full endpoint smoke test runner.
Run: python3 scripts/smoke_test.py
"""
import requests
import sys
import json

BASE = "http://localhost:8000/api/v1"

ok = 0
fail = 0

def check(name, cond, detail=""):
    global ok, fail
    if cond:
        print(f"  ✅ {name}")
        ok += 1
    else:
        print(f"  ❌ {name}  {detail}")
        fail += 1

# ── Login ─────────────────────────────────────────────────────────────────────
print("\n=== Login ===")
r = requests.post(f"{BASE}/auth/login/", json={"email": "test@example.com", "password": "admin123"})
check("POST /auth/login/ → 200", r.status_code == 200, r.text[:200])
data = r.json()
token = data.get("access", "")
user = data.get("user", {})
check("response has access token", bool(token))
check("response has user.email", user.get("email") == "test@example.com")
check("user.is_tenant_admin = True", user.get("is_tenant_admin") is True)
check("user.tenant present", bool(user.get("tenant")))
print(f"  User: {user.get('email')} | tenant={user.get('tenant', {}).get('name')}")

H = {"Authorization": f"Bearer {token}"}

# ── Auth /me/ ─────────────────────────────────────────────────────────────────
print("\n=== GET /auth/me/ ===")
r = requests.get(f"{BASE}/auth/me/", headers=H)
check("GET /auth/me/ → 200", r.status_code == 200, r.text[:200])
me = r.json()
check("me.email correct", me.get("email") == "test@example.com")
check("me.is_tenant_admin = True", me.get("is_tenant_admin") is True)

# ── Dashboard ─────────────────────────────────────────────────────────────────
print("\n=== GET /dashboard/ ===")
r = requests.get(f"{BASE}/dashboard/", headers=H)
check("GET /dashboard/ → 200", r.status_code == 200, r.text[:200])
d = r.json()
check("has documents_count", "documents_count" in d)
check("has users_count", "users_count" in d)
check("has queries_today", "queries_today" in d)
check("has storage_used_bytes", "storage_used_bytes" in d)
check("has recent_activity", "recent_activity" in d)
check("recent_activity is list", isinstance(d.get("recent_activity"), list))
print(f"  docs={d.get('documents_count')} users={d.get('users_count')} queries={d.get('queries_today')} storage={d.get('storage_used_bytes')} activity={len(d.get('recent_activity',[]))}")

# ── No-auth protection ────────────────────────────────────────────────────────
print("\n=== Auth Protection ===")
for endpoint in ["/dashboard/", "/users/", "/roles/", "/departments/", "/audit-logs/"]:
    r = requests.get(f"{BASE}{endpoint}")
    check(f"GET {endpoint} without token → 401", r.status_code == 401, f"got {r.status_code}")

# ── Departments CRUD ──────────────────────────────────────────────────────────
print("\n=== Departments CRUD ===")
r = requests.get(f"{BASE}/departments/", headers=H)
check("GET /departments/ → 200", r.status_code == 200)
check("GET /departments/ has count+results", "count" in r.json() and "results" in r.json())
# Verify field shape
r2 = requests.post(f"{BASE}/departments/", headers=H, json={"name": "SmokeTestDept", "description": "Smoke"})
check("POST /departments/ → 201", r2.status_code == 201, r2.text[:200])
dept = r2.json()
check("dept has parent_name", "parent_name" in dept)
check("dept has user_count", "user_count" in dept)
check("dept has children_count", "children_count" in dept)
check("dept user_count = 0", dept.get("user_count") == 0)
dept_id = dept.get("id")

# Duplicate name → 400
r3 = requests.post(f"{BASE}/departments/", headers=H, json={"name": "SmokeTestDept"})
check("POST duplicate dept → 400", r3.status_code == 400, r3.text[:200])

# PATCH
r4 = requests.patch(f"{BASE}/departments/{dept_id}/", headers=H, json={"description": "Updated"})
check("PATCH /departments/{id}/ → 200", r4.status_code == 200)
check("description updated", r4.json().get("description") == "Updated")

# DELETE (empty dept)
r5 = requests.delete(f"{BASE}/departments/{dept_id}/", headers=H)
check("DELETE /departments/{id}/ → 204", r5.status_code == 204, r5.text[:100])

# ── Roles CRUD ────────────────────────────────────────────────────────────────
print("\n=== Roles CRUD ===")
r = requests.get(f"{BASE}/roles/", headers=H)
check("GET /roles/ → 200", r.status_code == 200)
check("GET /roles/ has count+results", "count" in r.json() and "results" in r.json())

# Create parent role
r2 = requests.post(f"{BASE}/roles/", headers=H, json={"name": "SmokeParentRole", "description": "Parent"})
check("POST /roles/ → 201", r2.status_code == 201, r2.text[:200])
parent = r2.json()
check("role has parent_name", "parent_name" in parent)
check("role has user_count", "user_count" in parent)
check("role has permission_count", "permission_count" in parent)
check("role parent_name = null", parent.get("parent_name") is None)
parent_id = parent.get("id")

# Create child role
r3 = requests.post(f"{BASE}/roles/", headers=H, json={"name": "SmokeChildRole", "parent": parent_id})
check("POST child role → 201", r3.status_code == 201, r3.text[:200])
child = r3.json()
check("child parent_name set", child.get("parent_name") == "SmokeParentRole")
child_id = child.get("id")

# List now has 2 roles
r_list = requests.get(f"{BASE}/roles/", headers=H)
check("GET /roles/ after creates → user_count field present", '"user_count"' in r_list.text)
check("GET /roles/ after creates → permission_count field present", '"permission_count"' in r_list.text)

# Duplicate name → 400
r4 = requests.post(f"{BASE}/roles/", headers=H, json={"name": "SmokeParentRole"})
check("POST duplicate role → 400", r4.status_code == 400, r4.text[:200])

# PATCH
r5 = requests.patch(f"{BASE}/roles/{parent_id}/", headers=H, json={"description": "Updated"})
check("PATCH /roles/{id}/ → 200", r5.status_code == 200)

# PUT blocked
r6 = requests.put(f"{BASE}/roles/{parent_id}/", headers=H, json={"name": "SmokeParentRole", "description": "x"})
check("PUT /roles/{id}/ → 405", r6.status_code == 405, f"got {r6.status_code}")

# DELETE child first
r7 = requests.delete(f"{BASE}/roles/{child_id}/", headers=H)
check("DELETE child role → 204", r7.status_code == 204)
r8 = requests.delete(f"{BASE}/roles/{parent_id}/", headers=H)
check("DELETE parent role → 204", r8.status_code == 204)

# ── Users ─────────────────────────────────────────────────────────────────────
print("\n=== Users ===")
r = requests.get(f"{BASE}/users/", headers=H)
check("GET /users/ → 200", r.status_code == 200)
users_data = r.json()
check("users has count+results", "count" in users_data and "results" in users_data)
if users_data.get("results"):
    u = users_data["results"][0]
    check("user has full_name", "full_name" in u)
    check("user has department_name", "department_name" in u)
    check("user has primary_role_name", "primary_role_name" in u)
print(f"  Total users: {users_data.get('count')}")

# Create user
r2 = requests.post(f"{BASE}/users/", headers=H, json={
    "first_name": "Smoke", "last_name": "Test",
    "email": "smoketest@example.com", "password": "testpass123"
})
check("POST /users/ → 201", r2.status_code == 201, r2.text[:200])
if r2.status_code == 201:
    new_user_id = r2.json().get("id")
    # Toggle status
    r3 = requests.post(f"{BASE}/users/{new_user_id}/toggle-status/", headers=H)
    check("POST /users/{id}/toggle-status/ → 200", r3.status_code == 200)
    check("user deactivated", r3.json().get("is_active") is False)
    # Delete
    r4 = requests.delete(f"{BASE}/users/{new_user_id}/", headers=H)
    check("DELETE /users/{id}/ → 204", r4.status_code == 204, r4.text[:100])

# ── Permissions (read-only) ───────────────────────────────────────────────────
print("\n=== Permissions ===")
r = requests.get(f"{BASE}/permissions/", headers=H)
check("GET /permissions/ → 200", r.status_code == 200)
perms = r.json()
check("permissions count > 0", (perms.get("count") or 0) > 0, f"count={perms.get('count')}")
print(f"  Total permissions: {perms.get('count')}")

# ── Audit Logs ────────────────────────────────────────────────────────────────
print("\n=== Audit Logs ===")
r = requests.get(f"{BASE}/audit-logs/", headers=H)
check("GET /audit-logs/ → 200", r.status_code == 200)
logs = r.json()
check("audit-logs has count+results", "count" in logs and "results" in logs)
if logs.get("results"):
    log = logs["results"][0]
    check("log has user_email", "user_email" in log)
    check("log has user_name", "user_name" in log)
    check("log has action", "action" in log)
    check("log has resource_type", "resource_type" in log)
    check("log no user_agent", "user_agent" not in log)
print(f"  Total audit logs: {logs.get('count')}")

# Filter tests
r2 = requests.get(f"{BASE}/audit-logs/?action=create", headers=H)
check("GET /audit-logs/?action=create → 200", r2.status_code == 200)
data2 = r2.json()
all_creates = all(l["action"] == "create" for l in data2.get("results", []))
check("filter=create: all entries are create", all_creates)

# Readonly
r3 = requests.post(f"{BASE}/audit-logs/", headers=H, json={})
check("POST /audit-logs/ → 405", r3.status_code == 405, f"got {r3.status_code}")

# ── Chat ──────────────────────────────────────────────────────────────────────
print("\n=== Chat ===")
r = requests.get(f"{BASE}/rag/sessions/", headers=H)
check("GET /rag/sessions/ → 200", r.status_code == 200)
sessions = r.json()
session_list = sessions.get("results", sessions) if isinstance(sessions, dict) else sessions
print(f"  Sessions: {len(session_list)}")

r = requests.get(f"{BASE}/rag/folders/", headers=H)
check("GET /rag/folders/ → 200", r.status_code == 200)

# ── Platform Owner (403 for tenant user) ─────────────────────────────────────
print("\n=== Platform Owner (403 guard) ===")
for ep in ["/platform/overview/", "/platform/tenants/", "/platform/system-health/"]:
    r = requests.get(f"{BASE}{ep}", headers=H)
    check(f"GET {ep} → 403 for tenant user", r.status_code == 403, f"got {r.status_code}")

# ── Front build status ─────────────────────────────────────────────────────────
print("\n=== Frontend ===")
import subprocess, os
result = subprocess.run(
    ["npm", "run", "build"],
    cwd="/Users/mohitmaurya/dev/internship/frontend",
    capture_output=True, text=True, timeout=60
)
check("npm run build succeeds", result.returncode == 0, result.stderr[-300:] if result.returncode != 0 else "")
if result.returncode == 0:
    lines = result.stdout.split("\n")
    built = [l for l in lines if "built" in l or "dist/" in l or "gzip" in l]
    for l in built[:5]:
        print(f"  {l.strip()}")

# ── Summary ───────────────────────────────────────────────────────────────────
print(f"\n{'='*54}")
print(f"  RESULTS:  ✅ {ok} passed   ❌ {fail} failed   Total {ok+fail}")
print(f"{'='*54}\n")
sys.exit(0 if fail == 0 else 1)
