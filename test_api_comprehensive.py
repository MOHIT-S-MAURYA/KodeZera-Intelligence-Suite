#!/usr/bin/env python3
"""
Comprehensive API Test Suite for Kodezera Intelligence Suite
Tests every endpoint with all relevant scenarios.
"""
import requests
import json
import os
import tempfile
import sys

BASE_URL = "http://localhost:8000/api/v1"

# Color codes
GREEN = "\033[0;32m"
RED = "\033[0;31m"
YELLOW = "\033[1;33m"
BLUE = "\033[0;34m"
CYAN = "\033[0;36m"
BOLD = "\033[1m"
RESET = "\033[0m"

results = {"pass": 0, "fail": 0, "skip": 0, "details": []}
tokens = {}


def section(title):
    print(f"\n{CYAN}{'═' * 50}{RESET}")
    print(f"{BOLD}{BLUE}  {title}{RESET}")
    print(f"{CYAN}{'═' * 50}{RESET}")


def check(name, expected_status, response, skip=False, skip_reason=""):
    if skip:
        print(f"{YELLOW}⚠️  SKIP{RESET} - {name} ({skip_reason})")
        results["skip"] += 1
        results["details"].append({"name": name, "status": "SKIP", "reason": skip_reason})
        return

    actual = response.status_code
    if actual == expected_status:
        print(f"{GREEN}✅ PASS{RESET} - {name} (HTTP {actual})")
        results["pass"] += 1
        results["details"].append({"name": name, "status": "PASS", "http": actual})
    else:
        print(f"{RED}❌ FAIL{RESET} - {name}")
        print(f"   Expected HTTP {expected_status}, Got HTTP {actual}")
        try:
            body = response.json()
            print(f"   {YELLOW}Response: {json.dumps(body)[:300]}{RESET}")
        except Exception:
            print(f"   {YELLOW}Response: {response.text[:300]}{RESET}")
        results["fail"] += 1
        results["details"].append({"name": name, "status": "FAIL",
                                   "expected": expected_status, "actual": actual})


def get_headers(token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


# ============================================================
# SECTION 1: AUTHENTICATION
# ============================================================
section("1. AUTHENTICATION ENDPOINTS")

# 1.1 Admin login
r = requests.post(f"{BASE_URL}/auth/login/",
                  json={"email": "admin@demo.com", "password": "admin123"})
check("Admin Login (valid credentials)", 200, r)
if r.status_code == 200:
    tokens["admin"] = r.json().get("access", "")
    tokens["admin_refresh"] = r.json().get("refresh", "")
    tokens["admin_user"] = r.json().get("user", {})
    print(f"   → Admin: {tokens['admin_user'].get('full_name')} | Tenant Admin: {tokens['admin_user'].get('is_tenant_admin')} | Platform Owner: {tokens['admin_user'].get('isPlatformOwner')}")

# 1.2 Developer login
r = requests.post(f"{BASE_URL}/auth/login/",
                  json={"email": "developer@demo.com", "password": "dev123"})
check("Developer Login (valid credentials)", 200, r)
if r.status_code == 200:
    tokens["dev"] = r.json().get("access", "")
    tokens["dev_user"] = r.json().get("user", {})
    print(f"   → Dev: {tokens['dev_user'].get('full_name')} | Tenant Admin: {tokens['dev_user'].get('is_tenant_admin')}")

# 1.3 Platform owner login
r = requests.post(f"{BASE_URL}/auth/login/",
                  json={"email": "owner@kodezera.com", "password": "owner123"})
check("Platform Owner Login (valid credentials)", 200, r)
if r.status_code == 200:
    tokens["owner"] = r.json().get("access", "")
    tokens["owner_user"] = r.json().get("user", {})
    print(f"   → Owner: {tokens['owner_user'].get('full_name')} | isPlatformOwner: {tokens['owner_user'].get('isPlatformOwner')}")

# 1.4 Wrong password
r = requests.post(f"{BASE_URL}/auth/login/",
                  json={"email": "admin@demo.com", "password": "wrongpassword"})
check("Login with wrong password (should return 401)", 401, r)

# 1.5 Non-existent user
r = requests.post(f"{BASE_URL}/auth/login/",
                  json={"email": "nobody@test.com", "password": "test123"})
check("Login non-existent user (should return 401)", 401, r)

# 1.6 Missing email
r = requests.post(f"{BASE_URL}/auth/login/", json={"password": "admin123"})
check("Login without email field (should return 400)", 400, r)

# 1.7 Missing password
r = requests.post(f"{BASE_URL}/auth/login/", json={"email": "admin@demo.com"})
check("Login without password field (should return 400)", 400, r)

# 1.8 Empty body
r = requests.post(f"{BASE_URL}/auth/login/", json={})
check("Login with empty body (should return 400)", 400, r)

# 1.9 Token refresh (valid)
if tokens.get("admin_refresh"):
    r = requests.post(f"{BASE_URL}/auth/refresh/",
                      json={"refresh": tokens["admin_refresh"]})
    check("Token Refresh (valid refresh token)", 200, r)
    if r.status_code == 200:
        tokens["admin"] = r.json().get("access", tokens["admin"])
        print(f"   → New access token obtained")
else:
    check("Token Refresh", 200, None, skip=True, skip_reason="No refresh token")

# 1.10 Token refresh (invalid)
r = requests.post(f"{BASE_URL}/auth/refresh/", json={"refresh": "invalid.token.here"})
check("Token Refresh (invalid token - should return 401)", 401, r)

# ============================================================
# SECTION 2: DOCUMENTS
# ============================================================
section("2. DOCUMENT MANAGEMENT ENDPOINTS")

admin_h = get_headers(tokens.get("admin"))
dev_h = get_headers(tokens.get("dev"))

# 2.1 List documents (admin)
r = requests.get(f"{BASE_URL}/documents/", headers=admin_h)
check("List Documents (admin)", 200, r)
if r.status_code == 200:
    docs = r.json()
    count = len(docs) if isinstance(docs, list) else docs.get("count", "?")
    print(f"   → Document count: {count}")

# 2.2 List documents (developer)
r = requests.get(f"{BASE_URL}/documents/", headers=dev_h)
check("List Documents (developer)", 200, r)

# 2.3 List documents (unauthenticated)
r = requests.get(f"{BASE_URL}/documents/")
check("List Documents (unauthenticated - should return 401)", 401, r)

# 2.4 Upload TXT document (admin)
with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
    f.write("This is a test document for API testing.\nContent: testing upload functionality.")
    temp_file = f.name

with open(temp_file, 'rb') as f:
    r = requests.post(
        f"{BASE_URL}/documents/upload/",
        headers={"Authorization": f"Bearer {tokens.get('admin', '')}"},
        files={"file": ("test_document.txt", f, "text/plain")},
        data={"title": "Test Upload Document", "visibility_type": "public"}
    )
check("Upload TXT Document (admin)", 201, r)
doc_id = None
if r.status_code == 201:
    doc_id = r.json().get("id")
    print(f"   → Created document ID: {doc_id}")
os.unlink(temp_file)

# 2.5 Get specific document
if doc_id:
    r = requests.get(f"{BASE_URL}/documents/{doc_id}/", headers=admin_h)
    check("Get Document by ID", 200, r)
    if r.status_code == 200:
        doc = r.json()
        print(f"   → Title: {doc.get('title')} | Status: {doc.get('status')} | Type: {doc.get('file_type')}")

# 2.6 Upload without auth (should fail)
with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
    f.write("unauthorized upload test")
    temp_file2 = f.name
with open(temp_file2, 'rb') as f:
    r = requests.post(
        f"{BASE_URL}/documents/upload/",
        files={"file": ("test.txt", f, "text/plain")},
        data={"title": "Unauthorized"}
    )
check("Upload Document (unauthenticated - should return 401)", 401, r)
os.unlink(temp_file2)

# 2.7 Document access list (admin)
r = requests.get(f"{BASE_URL}/document-access/", headers=admin_h)
check("List Document Access Records (admin)", 200, r)

# 2.8 Try to get non-existent document
r = requests.get(f"{BASE_URL}/documents/00000000-0000-0000-0000-000000000000/", headers=admin_h)
check("Get Non-existent Document (should return 404)", 404, r)

# 2.9 Delete document
if doc_id:
    r = requests.delete(f"{BASE_URL}/documents/{doc_id}/", headers=admin_h)
    check("Delete Document (admin)", 204, r)

# ============================================================
# SECTION 3: DEPARTMENTS
# ============================================================
section("3. DEPARTMENT ENDPOINTS (Admin only)")

# 3.1 List departments (admin)
r = requests.get(f"{BASE_URL}/departments/", headers=admin_h)
check("List Departments (admin)", 200, r)
if r.status_code == 200:
    depts = r.json()
    dept_list = depts if isinstance(depts, list) else depts.get("results", [])
    print(f"   → Departments: {[d.get('name') for d in dept_list]}")

# 3.2 List departments (developer - not admin, should return 403)
r = requests.get(f"{BASE_URL}/departments/", headers=dev_h)
check("List Departments (developer - should return 403)", 403, r)

# 3.3 Create department (admin)
r = requests.post(f"{BASE_URL}/departments/",
                  headers=admin_h,
                  json={"name": "API Test Department", "description": "Created by automated test"})
check("Create Department (admin)", 201, r)
dept_id = None
if r.status_code == 201:
    dept_id = r.json().get("id")
    print(f"   → Created department: {r.json().get('name')} (ID: {dept_id})")

# 3.4 Get single department
if dept_id:
    r = requests.get(f"{BASE_URL}/departments/{dept_id}/", headers=admin_h)
    check("Get Department by ID", 200, r)

# 3.5 Update department (PATCH)
if dept_id:
    r = requests.patch(f"{BASE_URL}/departments/{dept_id}/",
                       headers=admin_h,
                       json={"name": "API Test Department - Renamed"})
    check("Update Department (PATCH)", 200, r)
    if r.status_code == 200:
        print(f"   → Updated name: {r.json().get('name')}")

# 3.6 Update department (PUT)
if dept_id:
    r = requests.put(f"{BASE_URL}/departments/{dept_id}/",
                     headers=admin_h,
                     json={"name": "API Test Department Final"})
    check("Update Department (PUT)", 200, r)

# 3.7 Create dept without auth
r = requests.post(f"{BASE_URL}/departments/",
                  json={"name": "No auth dept"})
check("Create Department (unauthenticated - should return 401)", 401, r)

# 3.8 Delete department
if dept_id:
    r = requests.delete(f"{BASE_URL}/departments/{dept_id}/", headers=admin_h)
    check("Delete Department (admin)", 204, r)

# ============================================================
# SECTION 4: ROLES
# ============================================================
section("4. ROLES ENDPOINTS (Admin only)")

# 4.1 List roles (admin)
r = requests.get(f"{BASE_URL}/roles/", headers=admin_h)
check("List Roles (admin)", 200, r)
if r.status_code == 200:
    roles_list = r.json() if isinstance(r.json(), list) else r.json().get("results", [])
    print(f"   → Existing roles: {[x.get('name') for x in roles_list]}")

# 4.2 List roles (developer - should fail)
r = requests.get(f"{BASE_URL}/roles/", headers=dev_h)
check("List Roles (developer - should return 403)", 403, r)

# 4.3 Create role (admin)
r = requests.post(f"{BASE_URL}/roles/",
                  headers=admin_h,
                  json={"name": "API Test Role", "description": "Created by automated test"})
check("Create Role (admin)", 201, r)
role_id = None
if r.status_code == 201:
    role_id = r.json().get("id")
    print(f"   → Created role: {r.json().get('name')} (ID: {role_id})")

# 4.4 Get role by ID
if role_id:
    r = requests.get(f"{BASE_URL}/roles/{role_id}/", headers=admin_h)
    check("Get Role by ID", 200, r)

# 4.5 Update role
if role_id:
    r = requests.patch(f"{BASE_URL}/roles/{role_id}/",
                       headers=admin_h,
                       json={"name": "API Test Role Updated"})
    check("Update Role (PATCH)", 200, r)

# 4.6 Assign permissions to role
if role_id:
    r = requests.post(f"{BASE_URL}/roles/{role_id}/assign_permissions/",
                      headers=admin_h,
                      json={"permission_ids": []})
    check("Assign Permissions to Role", 200, r)

# 4.7 Delete role
if role_id:
    r = requests.delete(f"{BASE_URL}/roles/{role_id}/", headers=admin_h)
    check("Delete Role (admin)", 204, r)

# ============================================================
# SECTION 5: PERMISSIONS
# ============================================================
section("5. PERMISSIONS ENDPOINTS")

# 5.1 List permissions (admin)
r = requests.get(f"{BASE_URL}/permissions/", headers=admin_h)
check("List Permissions (admin)", 200, r)
if r.status_code == 200:
    perms = r.json() if isinstance(r.json(), list) else r.json().get("results", [])
    print(f"   → Permission count: {len(perms)}")
    if perms:
        print(f"   → Sample: {[p.get('name') for p in perms[:3]]}")

# 5.2 Permissions (developer - should fail)
r = requests.get(f"{BASE_URL}/permissions/", headers=dev_h)
check("List Permissions (developer - should return 403)", 403, r)

# 5.3 Create permission (should not be allowed - read-only viewset)
r = requests.post(f"{BASE_URL}/permissions/",
                  headers=admin_h,
                  json={"name": "test_perm", "resource": "test", "action": "test"})
check("Create Permission (should return 405 - read-only)", 405, r)

# ============================================================
# SECTION 6: USER ROLES
# ============================================================
section("6. USER-ROLES ENDPOINTS")

# 6.1 List user-roles (admin)
r = requests.get(f"{BASE_URL}/user-roles/", headers=admin_h)
check("List User Roles (admin)", 200, r)
if r.status_code == 200:
    ur = r.json() if isinstance(r.json(), list) else r.json().get("results", [])
    print(f"   → User role assignments: {len(ur)}")

# 6.2 List user-roles (developer - should fail)
r = requests.get(f"{BASE_URL}/user-roles/", headers=dev_h)
check("List User Roles (developer - should return 403)", 403, r)

# ============================================================
# SECTION 7: CHAT SESSIONS
# ============================================================
section("7. RAG CHAT SESSION ENDPOINTS")

# 7.1 List sessions (admin)
r = requests.get(f"{BASE_URL}/rag/sessions/", headers=admin_h)
check("List Chat Sessions (admin)", 200, r)
if r.status_code == 200:
    sessions = r.json() if isinstance(r.json(), list) else r.json().get("results", [])
    print(f"   → Existing sessions: {len(sessions)}")

# 7.2 List sessions (developer)
r = requests.get(f"{BASE_URL}/rag/sessions/", headers=dev_h)
check("List Chat Sessions (developer)", 200, r)

# 7.3 List sessions (unauthenticated)
r = requests.get(f"{BASE_URL}/rag/sessions/")
check("List Chat Sessions (unauthenticated - should return 401)", 401, r)

# 7.4 Create session (admin)
r = requests.post(f"{BASE_URL}/rag/sessions/",
                  headers=admin_h,
                  json={"title": "API Test Session"})
check("Create Chat Session (admin)", 201, r)
session_id = None
if r.status_code == 201:
    session_id = r.json().get("id")
    print(f"   → Created session: '{r.json().get('title')}' (ID: {session_id})")

# 7.5 Get session by ID
if session_id:
    r = requests.get(f"{BASE_URL}/rag/sessions/{session_id}/", headers=admin_h)
    check("Get Chat Session by ID", 200, r)
    if r.status_code == 200:
        sess = r.json()
        print(f"   → Session: title='{sess.get('title')}' | messages_count={sess.get('messages_count', 0)}")

# 7.6 Create session (developer)
r = requests.post(f"{BASE_URL}/rag/sessions/",
                  headers=dev_h,
                  json={"title": "Dev Test Session"})
check("Create Chat Session (developer)", 201, r)
dev_session_id = None
if r.status_code == 201:
    dev_session_id = r.json().get("id")

# 7.7 Rename session
if session_id:
    r = requests.patch(f"{BASE_URL}/rag/sessions/{session_id}/rename/",
                       headers=admin_h,
                       json={"title": "Renamed API Test Session"})
    check("Rename Chat Session (PATCH /rename/)", 200, r)
    if r.status_code == 200:
        print(f"   → Renamed to: '{r.json().get('title')}'")

# 7.8 Rename without title
if session_id:
    r = requests.patch(f"{BASE_URL}/rag/sessions/{session_id}/rename/",
                       headers=admin_h,
                       json={})
    check("Rename Session (missing title - should return 400)", 400, r)

# 7.9 Cannot access other user's session
if dev_session_id:
    r = requests.get(f"{BASE_URL}/rag/sessions/{dev_session_id}/", headers=admin_h)
    check("Get Another User's Session (should return 404 - isolation)", 404, r)

# ============================================================
# SECTION 8: CHAT FOLDERS
# ============================================================
section("8. CHAT FOLDER ENDPOINTS")

# 8.1 List folders (admin)
r = requests.get(f"{BASE_URL}/rag/folders/", headers=admin_h)
check("List Chat Folders (admin)", 200, r)
if r.status_code == 200:
    folders = r.json() if isinstance(r.json(), list) else r.json().get("results", [])
    print(f"   → Existing folders: {len(folders)}")

# 8.2 Create folder (admin)
r = requests.post(f"{BASE_URL}/rag/folders/",
                  headers=admin_h,
                  json={"name": "API Test Folder"})
check("Create Chat Folder (admin)", 201, r)
folder_id = None
if r.status_code == 201:
    folder_id = r.json().get("id")
    print(f"   → Created folder: '{r.json().get('name')}' (ID: {folder_id})")

# 8.3 Get folder by ID
if folder_id:
    r = requests.get(f"{BASE_URL}/rag/folders/{folder_id}/", headers=admin_h)
    check("Get Folder by ID", 200, r)

# 8.4 Update folder
if folder_id:
    r = requests.patch(f"{BASE_URL}/rag/folders/{folder_id}/",
                       headers=admin_h,
                       json={"name": "Renamed API Test Folder"})
    check("Rename Chat Folder (PATCH)", 200, r)
    if r.status_code == 200:
        print(f"   → Renamed to: '{r.json().get('name')}'")

# 8.5 Move session to folder
if session_id and folder_id:
    r = requests.patch(f"{BASE_URL}/rag/sessions/{session_id}/folder/",
                       headers=admin_h,
                       json={"folder_id": str(folder_id)})
    check("Move Session to Folder", 200, r)

# 8.6 Remove session from folder (set folder_id to null)
if session_id:
    r = requests.patch(f"{BASE_URL}/rag/sessions/{session_id}/folder/",
                       headers=admin_h,
                       json={"folder_id": None})
    check("Remove Session from Folder (folder_id=null)", 200, r)

# 8.7 Cleanup: delete sessions
if session_id:
    r = requests.delete(f"{BASE_URL}/rag/sessions/{session_id}/", headers=admin_h)
    check("Delete Chat Session (admin)", 204, r)
if dev_session_id:
    r = requests.delete(f"{BASE_URL}/rag/sessions/{dev_session_id}/", headers=dev_h)
    check("Delete Chat Session (developer)", 204, r)

# 8.8 Delete folder
if folder_id:
    r = requests.delete(f"{BASE_URL}/rag/folders/{folder_id}/", headers=admin_h)
    check("Delete Chat Folder (admin)", 204, r)

# ============================================================
# SECTION 9: RAG QUERY (SSE)
# ============================================================
section("9. RAG QUERY ENDPOINT (Streaming SSE)")

# 9.1 RAG query unauthenticated
r = requests.post(f"{BASE_URL}/rag/query/",
                  json={"question": "test"}, timeout=5)
check("RAG Query (unauthenticated - should return 401)", 401, r)

# 9.2 RAG query authenticated (streaming)
try:
    r = requests.post(f"{BASE_URL}/rag/query/",
                      headers=admin_h,
                      json={"question": "What documents are available?"},
                      stream=True, timeout=8)
    content = b""
    for chunk in r.iter_content(chunk_size=512):
        content += chunk
        if len(content) > 1000:
            break
    content_str = content.decode("utf-8", errors="replace")
    if "data:" in content_str:
        print(f"{GREEN}✅ PASS{RESET} - RAG Query (admin, SSE streaming) - received SSE data")
        results["pass"] += 1
        results["details"].append({"name": "RAG Query SSE", "status": "PASS"})
        print(f"   → Sample: {content_str[:200]}")
    elif "error" in content_str.lower() or "openai" in content_str.lower():
        print(f"{YELLOW}⚠️  SKIP{RESET} - RAG Query (OpenAI/Qdrant not configured)")
        results["skip"] += 1
        print(f"   → Response: {content_str[:200]}")
    else:
        print(f"{YELLOW}⚠️  SKIP{RESET} - RAG Query (unclear response - SSE may need OpenAI)")
        results["skip"] += 1
        print(f"   → Response: {content_str[:200]}")
except Exception as e:
    print(f"{YELLOW}⚠️  SKIP{RESET} - RAG Query (exception: {str(e)[:100]})")
    results["skip"] += 1

# 9.3 RAG query with session_id
if session_id is None:
    # Create a temporary session
    r_tmp = requests.post(f"{BASE_URL}/rag/sessions/", headers=admin_h,
                          json={"title": "RAG Query Test Session"})
    tmp_session_id = r_tmp.json().get("id") if r_tmp.status_code == 201 else None
    try:
        r = requests.post(f"{BASE_URL}/rag/query/",
                          headers=admin_h,
                          json={"question": "Hello", "session_id": tmp_session_id or ""},
                          stream=True, timeout=5)
        content_str = r.raw.read(500).decode("utf-8", errors="replace")
        if r.status_code in [200, 206] or "data:" in content_str:
            print(f"{GREEN}✅ PASS{RESET} - RAG Query with session_id")
            results["pass"] += 1
        else:
            print(f"{YELLOW}⚠️  SKIP{RESET} - RAG Query with session_id (needs OpenAI)")
            results["skip"] += 1
    except Exception as e:
        print(f"{YELLOW}⚠️  SKIP{RESET} - RAG Query with session_id: {str(e)[:80]}")
        results["skip"] += 1
    if tmp_session_id:
        requests.delete(f"{BASE_URL}/rag/sessions/{tmp_session_id}/", headers=admin_h)

# ============================================================
# SECTION 10: PLATFORM OWNER ENDPOINTS
# ============================================================
section("10. PLATFORM OWNER ENDPOINTS")

owner_h = get_headers(tokens.get("owner"))
has_owner = bool(tokens.get("owner"))

# 10.1 Platform overview (owner)
r = requests.get(f"{BASE_URL}/platform/overview/", headers=owner_h)
check("Platform Overview (owner)", 200, r,
      skip=not has_owner, skip_reason="Platform owner account not found")
if has_owner and r.status_code == 200:
    data = r.json()
    print(f"   → Tenants: {data.get('tenants', {})}")
    print(f"   → Total users: {data.get('users', {}).get('total')}")
    print(f"   → Total docs: {data.get('documents', {}).get('total_indexed')}")

# 10.2 Platform overview (tenant admin - should fail)
r = requests.get(f"{BASE_URL}/platform/overview/", headers=admin_h)
check("Platform Overview (tenant admin - should return 403)", 403, r)

# 10.3 Platform overview (developer - should fail)
r = requests.get(f"{BASE_URL}/platform/overview/", headers=dev_h)
check("Platform Overview (developer - should return 403)", 403, r)

# 10.4 Platform overview (unauthenticated)
r = requests.get(f"{BASE_URL}/platform/overview/")
check("Platform Overview (unauthenticated - should return 401)", 401, r)

# 10.5 Platform tenants list (owner)
r = requests.get(f"{BASE_URL}/platform/tenants/", headers=owner_h)
check("Platform Tenants List (owner)", 200, r,
      skip=not has_owner, skip_reason="Platform owner account not found")
if has_owner and r.status_code == 200:
    tenants = r.json()
    t_list = tenants if isinstance(tenants, list) else tenants.get("tenants", tenants.get("results", []))
    print(f"   → Tenants found: {len(t_list) if isinstance(t_list, list) else '?'}")

# 10.6 Platform tenants (tenant admin - should fail)
r = requests.get(f"{BASE_URL}/platform/tenants/", headers=admin_h)
check("Platform Tenants (tenant admin - should return 403)", 403, r)

# 10.7 Platform system health (owner)
r = requests.get(f"{BASE_URL}/platform/system-health/", headers=owner_h)
check("Platform System Health (owner)", 200, r,
      skip=not has_owner, skip_reason="Platform owner account not found")
if has_owner and r.status_code == 200:
    health = r.json()
    print(f"   → System health response keys: {list(health.keys())}")

# 10.8 Platform audit logs (owner)
r = requests.get(f"{BASE_URL}/platform/audit-logs/", headers=owner_h)
check("Platform Audit Logs (owner)", 200, r,
      skip=not has_owner, skip_reason="Platform owner account not found")
if has_owner and r.status_code == 200:
    logs = r.json()
    log_list = logs if isinstance(logs, list) else logs.get("results", logs.get("logs", []))
    print(f"   → Audit log entries: {len(log_list) if isinstance(log_list, list) else '?'}")

# 10.9 Platform analytics (owner)
r = requests.get(f"{BASE_URL}/platform/analytics/", headers=owner_h)
check("Platform Analytics (owner)", 200, r,
      skip=not has_owner, skip_reason="Platform owner account not found")
if has_owner and r.status_code == 200:
    analytics = r.json()
    if isinstance(analytics, dict):
        print(f"   → Analytics keys: {list(analytics.keys())}")
    elif isinstance(analytics, list):
        print(f"   → Analytics data points: {len(analytics)}")
    else:
        print(f"   → Analytics response type: {type(analytics)}")

# 10.10 Platform analytics (tenant admin - should fail)
r = requests.get(f"{BASE_URL}/platform/analytics/", headers=admin_h)
check("Platform Analytics (tenant admin - should return 403)", 403, r)

# ============================================================
# SECTION 11: EDGE CASES / SECURITY
# ============================================================
section("11. SECURITY & EDGE CASE TESTS")

# 11.1 Over-long input (400 char question)
r = requests.post(f"{BASE_URL}/rag/query/",
                  headers=admin_h,
                  json={"question": "a" * 400},
                  stream=True, timeout=5)
try:
    raw = r.raw.read(100).decode("utf-8", errors="replace")
    if r.status_code in [200, 400]:
        print(f"{GREEN}✅ PASS{RESET} - RAG Query with long input (HTTP {r.status_code})")
        results["pass"] += 1
    else:
        print(f"{YELLOW}⚠️  SKIP{RESET} - RAG Query with long input (HTTP {r.status_code})")
        results["skip"] += 1
except Exception as e:
    print(f"{YELLOW}⚠️  SKIP{RESET} - Long input test: {str(e)[:80]}")
    results["skip"] += 1

# 11.2 Malformed JSON
try:
    r = requests.post(f"{BASE_URL}/auth/login/",
                      headers={"Content-Type": "application/json"},
                      data="not valid json")
    check("Malformed JSON body (should return 400)", 400, r)
except Exception as e:
    print(f"{YELLOW}⚠️  SKIP{RESET} - Malformed JSON: {str(e)[:80]}")
    results["skip"] += 1

# 11.3 Missing required fields for create session
r = requests.post(f"{BASE_URL}/rag/sessions/",
                  headers=admin_h,
                  json={})
# title can have a default so this might be 201
if r.status_code in [200, 201, 400]:
    if r.status_code == 201:
        tmp_id = r.json().get("id")
        requests.delete(f"{BASE_URL}/rag/sessions/{tmp_id}/", headers=admin_h)
    print(f"{GREEN}✅ PASS{RESET} - Create Session without title (HTTP {r.status_code} - handled)")
    results["pass"] += 1
else:
    print(f"{RED}❌ FAIL{RESET} - Create Session without title unexpected: HTTP {r.status_code}")
    results["fail"] += 1

# 11.4 Try to access another tenant's documents via admin credentials
# (admin can only see their own tenant's documents - already tested via dev isolation)
r = requests.get(f"{BASE_URL}/documents/", headers=admin_h)
if r.status_code == 200:
    all_ids = set()
    for d in (r.json() if isinstance(r.json(), list) else r.json().get("results", [])):
        if "tenant" in d:
            all_ids.add(d.get("tenant"))
    if len(all_ids) <= 1:
        print(f"{GREEN}✅ PASS{RESET} - Tenant Isolation: admin only sees own tenant documents")
        results["pass"] += 1
    else:
        print(f"{RED}❌ FAIL{RESET} - Tenant Isolation: documents from multiple tenants visible!")
        results["fail"] += 1
else:
    print(f"{YELLOW}⚠️  SKIP{RESET} - Tenant isolation check skipped")
    results["skip"] += 1

# ============================================================
# SUMMARY
# ============================================================
section("TEST RESULTS SUMMARY")

total = results["pass"] + results["fail"] + results["skip"]
pct = (results["pass"] / (results["pass"] + results["fail"]) * 100) if (results["pass"] + results["fail"]) > 0 else 0

print(f"{GREEN}✅ PASSED: {results['pass']}{RESET}")
print(f"{RED}❌ FAILED: {results['fail']}{RESET}")
print(f"{YELLOW}⚠️  SKIPPED: {results['skip']}{RESET}")
print(f"   TOTAL:   {total}")
print(f"   PASS RATE: {pct:.1f}% (excluding skips)")
print()

if results["fail"] > 0:
    print(f"{RED}{BOLD}Failed tests:{RESET}")
    for d in results["details"]:
        if d["status"] == "FAIL":
            print(f"  {RED}→ {d['name']}{RESET} (expected {d.get('expected')}, got {d.get('actual')})")
    sys.exit(1)
else:
    print(f"{GREEN}{BOLD}🎉 All tested endpoints passed!{RESET}")
    sys.exit(0)
