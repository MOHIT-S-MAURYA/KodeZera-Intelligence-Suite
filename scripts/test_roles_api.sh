#!/usr/bin/env zsh
# ─────────────────────────────────────────────────────────────
# Roles API — Full Test Suite
# Run with:  export TOKEN=<jwt>; zsh scripts/test_roles_api.sh
# ─────────────────────────────────────────────────────────────

BASE="http://localhost:8000/api/v1"
AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"

pass=0
fail=0

sep() { printf "\n%-52s\n" "────────────────────────────────────────────────────" }
expect() {
  local label="$1" actual="$2" want="$3"
  if [[ "$actual" == *"$want"* ]]; then
    echo "  ✅ PASS  [$label]  (matched: $want)"
    ((pass++))
  else
    echo "  ❌ FAIL  [$label]  expected '$want'"
    echo "     got  : $(echo "$actual" | head -c 400)"
    ((fail++))
  fi
}
absent() {
  local label="$1" actual="$2" banned="$3"
  if [[ "$actual" != *"$banned"* ]]; then
    echo "  ✅ PASS  [$label]  (absent: $banned)"
    ((pass++))
  else
    echo "  ❌ FAIL  [$label]  '$banned' must NOT appear"
    echo "     got  : $(echo "$actual" | head -c 400)"
    ((fail++))
  fi
}

# ────────────────────────────────────────────────────────────
sep
echo "T1 · GET /roles/  →  list (with counts)"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/roles/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $(echo "$BODY" | python3 -m json.tool --compact 2>/dev/null | head -c 600)"
expect "list:200"              "$CODE"  "HTTP_200"
expect "list:count-key"        "$BODY"  '"count"'
expect "list:results-key"      "$BODY"  '"results"'
expect "list:user_count"       "$BODY"  '"user_count"'
expect "list:permission_count" "$BODY"  '"permission_count"'

# ────────────────────────────────────────────────────────────
sep
echo "T2 · POST /roles/  →  create top-level role"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/roles/" \
    -H "$AUTH" -H "$CT" \
    -d '{"name":"TestRole","description":"Role for API tests"}')
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "create:201"             "$CODE"  "HTTP_201"
expect "create:name"            "$BODY"  '"TestRole"'
expect "create:description"     "$BODY"  '"Role for API tests"'
expect "create:user_count-0"    "$BODY"  '"user_count":0'
expect "create:perm_count-0"    "$BODY"  '"permission_count":0'
absent "create:no-tenant-leak"  "$BODY"  '"tenant"'
PARENT_ROLE_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','ERR'))" 2>/dev/null)
echo "  Parent Role ID: $PARENT_ROLE_ID"

# ────────────────────────────────────────────────────────────
sep
echo "T3 · POST /roles/  →  create child role (parent set)"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/roles/" \
    -H "$AUTH" -H "$CT" \
    -d "{\"name\":\"TestChildRole\",\"description\":\"Inherits TestRole\",\"parent\":\"$PARENT_ROLE_ID\"}")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "child:201"             "$CODE"  "HTTP_201"
expect "child:parent_name"     "$BODY"  '"parent_name":"TestRole"'
expect "child:parent-uuid"     "$BODY"  "\"parent\":\"$PARENT_ROLE_ID\""
CHILD_ROLE_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','ERR'))" 2>/dev/null)
echo "  Child Role ID: $CHILD_ROLE_ID"

# ────────────────────────────────────────────────────────────
sep
echo "T4 · GET /roles/{id}/  →  retrieve role"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/roles/$PARENT_ROLE_ID/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "retrieve:200"           "$CODE"  "HTTP_200"
expect "retrieve:name"          "$BODY"  '"TestRole"'

# ────────────────────────────────────────────────────────────
sep
echo "T5 · PATCH /roles/{id}/  →  rename + change description"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X PATCH "$BASE/roles/$PARENT_ROLE_ID/" \
    -H "$AUTH" -H "$CT" \
    -d '{"name":"TestRole-Updated","description":"Updated description"}')
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "patch:200"              "$CODE"  "HTTP_200"
expect "patch:name-updated"     "$BODY"  '"TestRole-Updated"'
expect "patch:desc-updated"     "$BODY"  '"Updated description"'

# ────────────────────────────────────────────────────────────
sep
echo "T6 · DELETE child role  →  204"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X DELETE "$BASE/roles/$CHILD_ROLE_ID/" -H "$AUTH")
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
expect "delete-child:204"       "$CODE"  "HTTP_204"

# ────────────────────────────────────────────────────────────
sep
echo "T7 · DELETE parent role (no children, no users)  →  204"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X DELETE "$BASE/roles/$PARENT_ROLE_ID/" -H "$AUTH")
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
expect "delete-parent:204"      "$CODE"  "HTTP_204"

# ────────────────────────────────────────────────────────────
sep
echo "T8 · GET deleted role  →  404"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/roles/$PARENT_ROLE_ID/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
expect "deleted:404"            "$CODE"  "HTTP_404"

# ────────────────────────────────────────────────────────────
sep
echo "T9 · POST duplicate name  →  400"
sep
curl -s -X POST "$BASE/roles/" -H "$AUTH" -H "$CT" -d '{"name":"DuplicateRoleTest"}' > /dev/null
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/roles/" \
    -H "$AUTH" -H "$CT" -d '{"name":"DuplicateRoleTest"}')
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "dup:400"                "$CODE"  "HTTP_400"
# clean up
DUP_ID=$(curl -s "$BASE/roles/" -H "$AUTH" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(next((x['id'] for x in d.get('results',[]) if x['name']=='DuplicateRoleTest'),''))")
[[ -n "$DUP_ID" ]] && curl -s -o /dev/null -X DELETE "$BASE/roles/$DUP_ID/" -H "$AUTH"

# ────────────────────────────────────────────────────────────
sep
echo "T10 · POST missing name  →  400"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/roles/" \
    -H "$AUTH" -H "$CT" -d '{"description":"No name"}')
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "missing-name:400"       "$CODE"  "HTTP_400"

# ────────────────────────────────────────────────────────────
sep
echo "T11 · GET /roles/ — no token  →  401"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/roles/")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
expect "no-auth:401"            "$CODE"  "HTTP_401"

# ────────────────────────────────────────────────────────────
printf "\n%s\n" "══════════════════════════════════════════════════════"
printf "  RESULTS:  ✅ %d passed   ❌ %d failed   Total %d\n" "$pass" "$fail" "$((pass+fail))"
printf "%s\n" "══════════════════════════════════════════════════════"
