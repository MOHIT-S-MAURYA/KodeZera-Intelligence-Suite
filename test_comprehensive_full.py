"""
Comprehensive API Test Suite - Kodezera Intelligence Suite
Tests every backend endpoint across all user roles.
"""
import requests
import json
import sys
import os
import time

BASE = "http://127.0.0.1:8000/api/v1"
RESULTS = []

def p(label, status, detail=""):
    icon = "✅" if status else "❌"
    line = f"  {icon} {label}"
    if detail:
        line += f"  → {detail}"
    print(line)
    RESULTS.append({"label": label, "pass": status, "detail": detail})

def login(email, password):
    r = requests.post(f"{BASE}/auth/login/", json={"email": email, "password": password}, timeout=10)
    if r.status_code == 200:
        data = r.json()
        return data.get("access"), data.get("user", {})
    return None, {}

def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# ─────────────────────────────────────────────────────────────
print("\n" + "="*60)
print("  KODEZERA INTELLIGENCE SUITE - FULL API TEST SUITE")
print("="*60)

# ─── AUTH TESTS ───────────────────────────────────────────────
print("\n📌 AUTH MODULE")

# Valid login - Platform Owner
token_owner, user_owner = login("owner@kodezera.com", "owner123")
p("Platform Owner login", bool(token_owner), f"isPlatformOwner={user_owner.get('isPlatformOwner')}")

# Valid login - Tenant Admin
token_admin, user_admin = login("admin@demo.com", "admin123")
p("Tenant Admin login", bool(token_admin), f"is_tenant_admin={user_admin.get('is_tenant_admin')}")

# Valid login - Regular User
token_user, user_user = login("developer@demo.com", "dev123")
p("Regular User login", bool(token_user), f"email={user_user.get('email')}")

# Invalid login
r = requests.post(f"{BASE}/auth/login/", json={"email": "bad@test.com", "password": "wrong"}, timeout=10)
p("Invalid login blocked", r.status_code == 401, f"status={r.status_code}")

# Token refresh
if token_admin:
    r2 = requests.post(f"{BASE}/auth/login/", json={"email": "admin@demo.com", "password": "admin123"}, timeout=10)
    refresh_tok = r2.json().get("refresh")
    r3 = requests.post(f"{BASE}/auth/refresh/", json={"refresh": refresh_tok}, timeout=10)
    p("JWT Refresh", r3.status_code == 200, f"new access token issued={bool(r3.json().get('access'))}")

# ─── PLATFORM OWNER TESTS ────────────────────────────────────
print("\n📌 PLATFORM OWNER MODULE")
if token_owner:
    H = h(token_owner)

    # Dashboard stats
    r = requests.get(f"{BASE}/platform/dashboard/", headers=H, timeout=10)
    p("GET Platform Dashboard", r.status_code == 200, f"keys={list(r.json().keys())[:4]}")

    # List all tenants
    r = requests.get(f"{BASE}/platform/tenants/", headers=H, timeout=10)
    tenants = r.json()
    tenant_list = tenants.get("results", tenants) if isinstance(tenants, dict) else tenants
    p("GET List Tenants", r.status_code == 200, f"count={len(tenant_list)}")
    
    # Get a specific tenant
    if tenant_list:
        tid = tenant_list[0]["id"]
        r = requests.get(f"{BASE}/platform/tenants/{tid}/", headers=H, timeout=10)
        p("GET Single Tenant", r.status_code == 200, f"name={r.json().get('name')}")

    # Create tenant
    new_tenant_data = {
        "name": "Test Corp Automated",
        "domain": f"testcorp-auto-{int(time.time())}.com",
        "admin_email": f"admin-{int(time.time())}@testcorp.com",
        "admin_password": "TestPass123!",
        "plan_id": 1
    }
    r = requests.post(f"{BASE}/platform/tenants/", headers=H, json=new_tenant_data, timeout=10)
    p("POST Create Tenant", r.status_code in [200, 201], f"status={r.status_code}")
    
    # Platform Audit Logs
    r = requests.get(f"{BASE}/platform/audit-logs/", headers=H, timeout=10)
    p("GET Platform Audit Logs", r.status_code == 200, f"count={len(r.json().get('results', r.json()))}")

    # System metrics / Usage
    r = requests.get(f"{BASE}/platform/analytics/", headers=H, timeout=10)
    p("GET Platform Analytics", r.status_code == 200, f"keys={list(r.json().keys())[:3]}")

    # Subscription plans
    r = requests.get(f"{BASE}/platform/plans/", headers=H, timeout=10)
    p("GET Subscription Plans", r.status_code == 200, f"count={len(r.json().get('results', r.json()))}")

else:
    p("Platform Owner tests", False, "login failed, skipping")

# ─── TENANT ADMIN MODULE ─────────────────────────────────────
print("\n📌 TENANT ADMIN MODULE")
if token_admin:
    H = h(token_admin)

    # Users List
    r = requests.get(f"{BASE}/users/", headers=H, timeout=10)
    users_data = r.json()
    users = users_data.get("results", users_data) if isinstance(users_data, dict) else users_data
    p("GET List Users", r.status_code == 200, f"count={len(users)}")

    # Create User
    new_user = {
        "email": f"testuser-{int(time.time())}@demo.com",
        "username": f"testuser{int(time.time())}",
        "first_name": "Test",
        "last_name": "User",
        "password": "TestPass123!"
    }
    r = requests.post(f"{BASE}/users/", headers=H, json=new_user, timeout=10)
    created_user_id = r.json().get("id", "") if r.status_code in [200, 201] else ""
    p("POST Create User", r.status_code in [200, 201], f"id={created_user_id[:8]}...")

    # Update User
    if created_user_id:
        r = requests.patch(f"{BASE}/users/{created_user_id}/", headers=H, json={"first_name": "Updated"}, timeout=10)
        p("PATCH Update User", r.status_code == 200, f"first_name={r.json().get('first_name')}")

        # Delete User
        r = requests.delete(f"{BASE}/users/{created_user_id}/", headers=H, timeout=10)
        p("DELETE User", r.status_code == 204, f"status={r.status_code}")

    # Departments
    r = requests.get(f"{BASE}/departments/", headers=H, timeout=10)
    depts = r.json().get("results", r.json()) if isinstance(r.json(), dict) else r.json()
    p("GET List Departments", r.status_code == 200, f"count={len(depts)}")

    # Create Department
    r = requests.post(f"{BASE}/departments/", headers=H, json={"name": f"Auto Test Dept {int(time.time())}"}, timeout=10)
    dept_id = r.json().get("id", "") if r.status_code in [200, 201] else ""
    p("POST Create Department", r.status_code in [200, 201], f"id={dept_id[:8] if dept_id else 'none'}...")
    
    # Delete Department
    if dept_id:
        r = requests.delete(f"{BASE}/departments/{dept_id}/", headers=H, timeout=10)
        p("DELETE Department", r.status_code == 204, f"status={r.status_code}")

    # Roles
    r = requests.get(f"{BASE}/roles/", headers=H, timeout=10)
    p("GET List Roles", r.status_code == 200, f"count={len(r.json().get('results', r.json()))}")

    # Tenant Audit Logs
    r = requests.get(f"{BASE}/audit-logs/", headers=H, timeout=10)
    p("GET Tenant Audit Logs", r.status_code == 200, f"count={len(r.json().get('results', r.json()))}")

    # Tenant Profile
    r = requests.get(f"{BASE}/tenant/profile/", headers=H, timeout=10)
    p("GET Tenant Profile", r.status_code == 200, f"name={r.json().get('name')}")

else:
    p("Tenant Admin tests", False, "login failed, skipping")

# ─── DOCUMENT MODULE ─────────────────────────────────────────
print("\n📌 DOCUMENT MODULE")
if token_admin:
    H = h(token_admin)
    # List documents
    r = requests.get(f"{BASE}/documents/", headers=H, timeout=10)
    docs = r.json().get("results", r.json()) if isinstance(r.json(), dict) else r.json()
    p("GET List Documents", r.status_code == 200, f"count={len(docs)}")

    # Upload a test document (using multipart)
    files = {"file": ("test_auto.txt", b"This is an automated test document for the RAG pipeline.", "text/plain")}
    data_form = {"title": "Automated Test Document", "visibility_type": "restricted"}
    upload_headers = {"Authorization": f"Bearer {token_admin}"}
    r = requests.post(f"{BASE}/documents/", headers=upload_headers, files=files, data=data_form, timeout=30)
    doc_id = r.json().get("id", "") if r.status_code in [200, 201] else ""
    p("POST Upload Document (multipart)", r.status_code in [200, 201], f"id={doc_id[:8] if doc_id else 'FAILED: '+str(r.status_code)}...")
    
    if doc_id:
        # Get single document
        r = requests.get(f"{BASE}/documents/{doc_id}/", headers=H, timeout=10)
        p("GET Single Document", r.status_code == 200, f"title={r.json().get('title')}, status={r.json().get('status')}")
        
        # Delete document
        r = requests.delete(f"{BASE}/documents/{doc_id}/", headers=H, timeout=10)
        p("DELETE Document", r.status_code == 204, f"status={r.status_code}")

# ─── RAG / CHAT MODULE ───────────────────────────────────────
print("\n📌 RAG / CHAT MODULE")
if token_admin:
    H = h(token_admin)

    # Create folder
    r = requests.post(f"{BASE}/rag/folders/", headers=H, json={"name": "Test Folder Alpha"}, timeout=10)
    folder_id = r.json().get("id", "") if r.status_code in [200, 201] else ""
    p("POST Create Chat Folder", r.status_code in [200, 201], f"id={folder_id[:8]}...")

    # List folders
    r = requests.get(f"{BASE}/rag/folders/", headers=H, timeout=10)
    p("GET List Chat Folders", r.status_code == 200, f"count={len(r.json().get('results', r.json()))}")

    # Rename folder
    if folder_id:
        r = requests.patch(f"{BASE}/rag/folders/{folder_id}/", headers=H, json={"name": "Renamed Folder Beta"}, timeout=10)
        p("PATCH Rename Folder", r.status_code == 200, f"name={r.json().get('name')}")

    # Create session
    r = requests.post(f"{BASE}/rag/sessions/", headers=H, json={"title": "Auto Test Session"}, timeout=10)
    sess_id = r.json().get("id", "") if r.status_code in [200, 201] else ""
    p("POST Create Chat Session", r.status_code in [200, 201], f"id={sess_id[:8]}...")

    # List sessions
    r = requests.get(f"{BASE}/rag/sessions/", headers=H, timeout=10)
    p("GET List Chat Sessions", r.status_code == 200, f"count={len(r.json().get('results', r.json()))}")

    # Rename session
    if sess_id:
        r = requests.patch(f"{BASE}/rag/sessions/{sess_id}/", headers=H, json={"title": "Renamed Session"}, timeout=10)
        p("PATCH Rename Session", r.status_code == 200, f"title={r.json().get('title')}")

    # Move session to folder
    if sess_id and folder_id:
        r = requests.patch(f"{BASE}/rag/sessions/{sess_id}/folder/", headers=H, json={"folder_id": folder_id}, timeout=10)
        p("PATCH Move Session to Folder", r.status_code == 200, f"folder={str(r.json().get('folder'))[:8]}...")

    # Get session messages
    if sess_id:
        r = requests.get(f"{BASE}/rag/sessions/{sess_id}/messages/", headers=H, timeout=10)
        p("GET Session Messages", r.status_code == 200, f"count={len(r.json().get('results', r.json()))}")

    # RAG Query (SSE stream)
    if sess_id:
        t0 = time.time()
        with requests.post(
            f"{BASE}/rag/query/",
            headers={**H, "Accept": "text/event-stream"},
            json={"question": "What information is in my documents?", "session_id": sess_id},
            stream=True, timeout=20
        ) as resp:
            chunks = []
            for line in resp.iter_lines():
                if line:
                    decoded = line.decode("utf-8")
                    if decoded.startswith("data: "):
                        try:
                            payload = json.loads(decoded[6:])
                            if "chunk" in payload:
                                chunks.append(payload["chunk"])
                            if payload.get("done"):
                                break
                            if "error" in payload:
                                chunks.append(f"[ERROR: {payload['error']}]")
                                break
                        except: pass
            full = "".join(chunks)
            elapsed = round(time.time() - t0, 2)
        p("POST RAG Query (SSE stream)", resp.status_code == 200 and len(full) > 10, 
          f"status={resp.status_code}, chars={len(full)}, time={elapsed}s, preview={full[:60]}...")

    # Delete session
    if sess_id:
        r = requests.delete(f"{BASE}/rag/sessions/{sess_id}/", headers=H, timeout=10)
        p("DELETE Chat Session", r.status_code == 204, f"status={r.status_code}")

    # Delete folder
    if folder_id:
        r = requests.delete(f"{BASE}/rag/folders/{folder_id}/", headers=H, timeout=10)
        p("DELETE Chat Folder", r.status_code == 204, f"status={r.status_code}")

# ─── REGULAR USER / ACCESS CONTROL TESTS ─────────────────────
print("\n📌 ACCESS CONTROL MODULE")
if token_user:
    H_user = h(token_user)
    H_admin = h(token_admin) if token_admin else {}
    
    # Regular user cannot access platform owner routes
    r = requests.get(f"{BASE}/platform/tenants/", headers=H_user, timeout=10)
    p("Regular user blocked from /platform/tenants/", r.status_code in [401, 403], f"status={r.status_code}")

    # Regular user cannot create users
    r = requests.post(f"{BASE}/users/", headers=H_user, json={"email": "hack@test.com", "password": "hack"}, timeout=10)
    p("Regular user blocked from creating users", r.status_code in [401, 403], f"status={r.status_code}")

    # Regular user can access their own chat
    r = requests.get(f"{BASE}/rag/sessions/", headers=H_user, timeout=10)
    p("Regular user can list own chat sessions", r.status_code == 200, f"status={r.status_code}")

    # Regular user can list documents
    r = requests.get(f"{BASE}/documents/", headers=H_user, timeout=10)
    p("Regular user can list documents", r.status_code == 200, f"count={len(r.json().get('results', r.json()))}")

# ─── SUMMARY ──────────────────────────────────────────────────
total = len(RESULTS)
passed = sum(1 for r in RESULTS if r["pass"])
failed = total - passed

print("\n" + "="*60)
print(f"  RESULTS: {passed}/{total} passed  |  {failed} FAILED")
print("="*60)

if failed > 0:
    print("\n❌ FAILED TESTS:")
    for r in RESULTS:
        if not r["pass"]:
            print(f"  - {r['label']}: {r['detail']}")

print()
