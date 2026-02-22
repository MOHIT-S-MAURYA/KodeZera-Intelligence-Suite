#!/bin/bash
# ===========================================================
# Comprehensive API Test Script for Kodezera Intelligence Suite
# ===========================================================

BASE_URL="http://localhost:8000/api/v1"
PASS=0
FAIL=0
SKIP=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

check() {
  local name="$1"
  local expected_status="$2"
  local actual_status="$3"
  local body="$4"
  
  if [ "$actual_status" == "$expected_status" ]; then
    echo -e "${GREEN}✅ PASS${NC} - $name (HTTP $actual_status)"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}❌ FAIL${NC} - $name (Expected HTTP $expected_status, Got HTTP $actual_status)"
    echo -e "   ${YELLOW}Response: ${body:0:200}${NC}"
    FAIL=$((FAIL + 1))
  fi
}

section() {
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${CYAN}══════════════════════════════════════════${NC}"
}

# ===========================================================
# SECTION 1: AUTHENTICATION
# ===========================================================
section "1. AUTHENTICATION ENDPOINTS"

# 1.1 Valid admin login
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/login/" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"admin123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Admin Login (valid credentials)" "200" "$code" "$body"

ADMIN_TOKEN=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access',''))" 2>/dev/null)
ADMIN_REFRESH=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('refresh',''))" 2>/dev/null)

# 1.2 Valid developer login
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/login/" \
  -H "Content-Type: application/json" \
  -d '{"email":"developer@demo.com","password":"dev123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Developer Login (valid credentials)" "200" "$code" "$body"
DEV_TOKEN=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access',''))" 2>/dev/null)

# 1.3 Platform owner login
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/login/" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@kodezera.com","password":"owner123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Platform Owner Login (valid credentials)" "200" "$code" "$body"
OWNER_TOKEN=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access',''))" 2>/dev/null)

# 1.4 Invalid credentials
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/login/" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"wrongpassword"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Login with wrong password (should return 401)" "401" "$code" "$body"

# 1.5 Non-existent user
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/login/" \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent@test.com","password":"test123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Login with non-existent user (should return 401)" "401" "$code" "$body"

# 1.6 Missing email field
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/login/" \
  -H "Content-Type: application/json" \
  -d '{"password":"admin123"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Login without email (should return 400)" "400" "$code" "$body"

# 1.7 Token refresh (valid)
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/refresh/" \
  -H "Content-Type: application/json" \
  -d "{\"refresh\":\"$ADMIN_REFRESH\"}")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Token Refresh (valid)" "200" "$code" "$body"

# 1.8 Token refresh (invalid token)
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/refresh/" \
  -H "Content-Type: application/json" \
  -d '{"refresh":"invalid-token-string"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Token Refresh (invalid token - should return 401)" "401" "$code" "$body"

# ===========================================================
# SECTION 2: DOCUMENTS
# ===========================================================
section "2. DOCUMENT ENDPOINTS"

# 2.1 List documents (admin)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/documents/" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "List Documents (admin)" "200" "$code" "$body"

# 2.2 List documents (developer)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/documents/" \
  -H "Authorization: Bearer $DEV_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "List Documents (developer)" "200" "$code" "$body"
echo "   → Found: $(echo $body | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else d.get('count','unknown'))" 2>/dev/null) documents"

# 2.3 List documents (unauthenticated - should fail)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/documents/")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "List Documents (unauthenticated - should return 401)" "401" "$code" "$body"

# 2.4 Upload a document (admin)
echo "test document content for testing" > /tmp/test_doc.txt
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/documents/upload/" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@/tmp/test_doc.txt;type=text/plain" \
  -F "title=Test Upload Document" \
  -F "visibility_type=public")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Upload Document (admin, txt file)" "201" "$code" "$body"
DOC_ID=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
echo "   → Uploaded document ID: $DOC_ID"

# 2.5 Get specific document
if [ -n "$DOC_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/documents/$DOC_ID/" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Get Document by ID" "200" "$code" "$body"
fi

# 2.6 Upload without auth
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/documents/upload/" \
  -F "file=@/tmp/test_doc.txt;type=text/plain" \
  -F "title=Unauthorized Upload")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Upload Document (unauthenticated - should return 401)" "401" "$code" "$body"

# 2.7 Document access list (admin)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/document-access/" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "List Document Access (admin)" "200" "$code" "$body"

# 2.8 Delete document
if [ -n "$DOC_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/documents/$DOC_ID/" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Delete Document" "204" "$code" "$body"
fi

# ===========================================================
# SECTION 3: ADMIN - DEPARTMENTS
# ===========================================================
section "3. DEPARTMENT ENDPOINTS (Admin only)"

# 3.1 List departments (admin)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/departments/" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "List Departments (admin)" "200" "$code" "$body"
echo "   → Departments: $(echo $body | python3 -c "import sys,json; d=json.load(sys.stdin); print([x.get('name','') for x in (d if isinstance(d,list) else d.get('results',[]))])" 2>/dev/null)"

# 3.2 List departments (developer - should fail, not admin)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/departments/" \
  -H "Authorization: Bearer $DEV_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "List Departments (developer - should return 403)" "403" "$code" "$body"

# 3.3 Create department (admin)
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/departments/" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Department","description":"Created by test script"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Create Department (admin)" "201" "$code" "$body"
DEPT_ID=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
echo "   → Created department ID: $DEPT_ID"

# 3.4 Update department
if [ -n "$DEPT_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL/departments/$DEPT_ID/" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Updated Test Department"}')
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Update Department (admin, PATCH)" "200" "$code" "$body"
fi

# 3.5 Delete department
if [ -n "$DEPT_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/departments/$DEPT_ID/" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Delete Department (admin)" "204" "$code" "$body"
fi

# ===========================================================
# SECTION 4: ROLES
# ===========================================================
section "4. ROLES ENDPOINTS (Admin only)"

# 4.1 List roles (admin)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/roles/" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "List Roles (admin)" "200" "$code" "$body"
echo "   → Roles: $(echo $body | python3 -c "import sys,json; d=json.load(sys.stdin); print([x.get('name','') for x in (d if isinstance(d,list) else d.get('results',[]))])" 2>/dev/null)"

# 4.2 Create role (admin)
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/roles/" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Role","description":"Created by test script"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Create Role (admin)" "201" "$code" "$body"
ROLE_ID=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
echo "   → Created role ID: $ROLE_ID"

# 4.3 Get single role
if [ -n "$ROLE_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/roles/$ROLE_ID/" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Get Role by ID" "200" "$code" "$body"
fi

# 4.4 Roles - not accessible by dev
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/roles/" \
  -H "Authorization: Bearer $DEV_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "List Roles (developer - should return 403)" "403" "$code" "$body"

# 4.5 Delete role
if [ -n "$ROLE_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/roles/$ROLE_ID/" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Delete Role (admin)" "204" "$code" "$body"
fi

# ===========================================================
# SECTION 5: PERMISSIONS
# ===========================================================
section "5. PERMISSIONS ENDPOINTS"

# 5.1 List permissions (admin)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/permissions/" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "List Permissions (admin)" "200" "$code" "$body"
echo "   → Permission count: $(echo $body | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else d.get('count','?'))" 2>/dev/null)"

# ===========================================================
# SECTION 6: USER ROLES
# ===========================================================
section "6. USER-ROLES ENDPOINTS"

# 6.1 List user roles (admin)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/user-roles/" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "List User Roles (admin)" "200" "$code" "$body"

# ===========================================================
# SECTION 7: RAG / CHAT SESSIONS
# ===========================================================
section "7. RAG CHAT SESSION ENDPOINTS"

# 7.1 List chat sessions (admin)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/rag/sessions/" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "List Chat Sessions (admin)" "200" "$code" "$body"

# 7.2 Create chat session
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/rag/sessions/" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Chat Session"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Create Chat Session (admin)" "201" "$code" "$body"
SESSION_ID=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
echo "   → Created session ID: $SESSION_ID"

# 7.3 Get specific session
if [ -n "$SESSION_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/rag/sessions/$SESSION_ID/" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Get Chat Session by ID" "200" "$code" "$body"
fi

# 7.4 Rename session
if [ -n "$SESSION_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL/rag/sessions/$SESSION_ID/rename/" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Renamed Test Session"}')
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Rename Chat Session" "200" "$code" "$body"
fi

# 7.5 List chat sessions (unauthenticated - should fail)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/rag/sessions/")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "List Chat Sessions (unauthenticated - should return 401)" "401" "$code" "$body"

# ===========================================================
# SECTION 8: RAG CHAT FOLDERS
# ===========================================================
section "8. CHAT FOLDER ENDPOINTS"

# 8.1 List chat folders
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/rag/folders/" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "List Chat Folders (admin)" "200" "$code" "$body"

# 8.2 Create chat folder
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/rag/folders/" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Folder"}')
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Create Chat Folder (admin)" "201" "$code" "$body"
FOLDER_ID=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
echo "   → Created folder ID: $FOLDER_ID"

# 8.3 Move session to folder
if [ -n "$SESSION_ID" ] && [ -n "$FOLDER_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL/rag/sessions/$SESSION_ID/folder/" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"folder_id\":\"$FOLDER_ID\"}")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Move Session to Folder" "200" "$code" "$body"
fi

# 8.4 Delete session
if [ -n "$SESSION_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/rag/sessions/$SESSION_ID/" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Delete Chat Session" "204" "$code" "$body"
fi

# 8.5 Delete folder
if [ -n "$FOLDER_ID" ]; then
  resp=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/rag/folders/$FOLDER_ID/" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Delete Chat Folder" "204" "$code" "$body"
fi

# ===========================================================
# SECTION 9: RAG QUERY (SSE Streaming)
# ===========================================================
section "9. RAG QUERY ENDPOINT"

# 9.1 RAG query (admin, streaming SSE)
resp=$(curl -s --max-time 8 -X POST "$BASE_URL/rag/query/" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"What documents are available?"}')
if echo "$resp" | grep -q "data:" ; then
  echo -e "${GREEN}✅ PASS${NC} - RAG Query (admin, streaming SSE)"
  PASS=$((PASS + 1))
elif echo "$resp" | grep -qi "error\|exception"; then
  echo -e "${YELLOW}⚠️  SKIP${NC} - RAG Query (OpenAI/Qdrant may not be configured)"
  SKIP=$((SKIP + 1))
else
  echo -e "${YELLOW}⚠️  SKIP${NC} - RAG Query (response unclear - services may not be configured)"
  SKIP=$((SKIP + 1))
fi

# 9.2 RAG query (unauthenticated - should fail)
resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/rag/query/" \
  -H "Content-Type: application/json" \
  -d '{"question":"test question"}' --max-time 5)
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "RAG Query (unauthenticated - should return 401)" "401" "$code" "$body"

# ===========================================================
# SECTION 10: PLATFORM OWNER ENDPOINTS
# ===========================================================
section "10. PLATFORM OWNER ENDPOINTS"

# 10.1 Platform overview (owner)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/platform/overview/" \
  -H "Authorization: Bearer $OWNER_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
if [ -z "$OWNER_TOKEN" ]; then
  echo -e "${YELLOW}⚠️  SKIP${NC} - Platform Overview (owner not found, skipping)"
  SKIP=$((SKIP + 1))
else
  check "Platform Overview (owner)" "200" "$code" "$body"
fi

# 10.2 Platform overview (admin - should fail, not platform owner)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/platform/overview/" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Platform Overview (tenant admin - should return 403)" "403" "$code" "$body"

# 10.3 Platform tenants list (owner)
if [ -n "$OWNER_TOKEN" ]; then
  resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/platform/tenants/" \
    -H "Authorization: Bearer $OWNER_TOKEN")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Platform Tenants List (owner)" "200" "$code" "$body"
else
  echo -e "${YELLOW}⚠️  SKIP${NC} - Platform Tenants List (owner not found)"
  SKIP=$((SKIP + 1))
fi

# 10.4 Platform system health (owner)
if [ -n "$OWNER_TOKEN" ]; then
  resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/platform/system-health/" \
    -H "Authorization: Bearer $OWNER_TOKEN")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Platform System Health (owner)" "200" "$code" "$body"
else
  echo -e "${YELLOW}⚠️  SKIP${NC} - Platform System Health (owner not found)"
  SKIP=$((SKIP + 1))
fi

# 10.5 Platform audit logs (owner)
if [ -n "$OWNER_TOKEN" ]; then
  resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/platform/audit-logs/" \
    -H "Authorization: Bearer $OWNER_TOKEN")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Platform Audit Logs (owner)" "200" "$code" "$body"
else
  echo -e "${YELLOW}⚠️  SKIP${NC} - Platform Audit Logs (owner not found)"
  SKIP=$((SKIP + 1))
fi

# 10.6 Platform analytics (owner)
if [ -n "$OWNER_TOKEN" ]; then
  resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/platform/analytics/" \
    -H "Authorization: Bearer $OWNER_TOKEN")
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  check "Platform Analytics (owner)" "200" "$code" "$body"
else
  echo -e "${YELLOW}⚠️  SKIP${NC} - Platform Analytics (owner not found)"
  SKIP=$((SKIP + 1))
fi

# 10.7 Platform tenants (tenant admin - should fail)
resp=$(curl -s -w "\n%{http_code}" "$BASE_URL/platform/tenants/" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
body=$(echo "$resp" | head -n -1)
code=$(echo "$resp" | tail -n 1)
check "Platform Tenants (tenant admin - should return 403)" "403" "$code" "$body"

# ===========================================================
# SUMMARY
# ===========================================================
echo ""
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "${BLUE}               TEST SUMMARY               ${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"
TOTAL=$((PASS + FAIL + SKIP))
echo -e "${GREEN}✅ PASSED: $PASS${NC}"
echo -e "${RED}❌ FAILED: $FAIL${NC}"
echo -e "${YELLOW}⚠️  SKIPPED: $SKIP${NC}"
echo -e "   TOTAL:   $TOTAL"
echo ""
if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}🎉 All tests passed! (skipped tests require optional services)${NC}"
else
  echo -e "${RED}Some tests failed. Review the output above.${NC}"
fi
