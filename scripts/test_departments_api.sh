#!/usr/bin/env zsh
# ─────────────────────────────────────────────────────────────
# Department Management API — Full Test Suite
# Run with:  export TOKEN=<jwt>; zsh scripts/test_departments_api.sh
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
echo "T1 · GET /departments/  →  list (with counts)"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/departments/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $(echo "$BODY" | python3 -m json.tool --compact 2>/dev/null | head -c 600)"
expect "list:200"              "$CODE"  "HTTP_200"
expect "list:count-key"        "$BODY"  '"count"'
expect "list:results-key"      "$BODY"  '"results"'
expect "list:user_count"       "$BODY"  '"user_count"'
expect "list:children_count"   "$BODY"  '"children_count"'

# ────────────────────────────────────────────────────────────
sep
echo "T2 · POST /departments/  →  create top-level dept"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/departments/" \
    -H "$AUTH" -H "$CT" \
    -d '{"name":"TestDept","description":"Test department for API tests"}')
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "create:201"            "$CODE"  "HTTP_201"
expect "create:name"           "$BODY"  '"TestDept"'
expect "create:description"    "$BODY"  '"Test department for API tests"'
expect "create:id"             "$BODY"  '"id"'
expect "create:user_count-0"   "$BODY"  '"user_count":0'
absent "create:no-tenant-leak" "$BODY"  '"tenant"'
PARENT_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','ERR'))" 2>/dev/null)
echo "  Parent ID: $PARENT_ID"

# ────────────────────────────────────────────────────────────
sep
echo "T3 · POST /departments/  →  create child dept (parent set)"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/departments/" \
    -H "$AUTH" -H "$CT" \
    -d "{\"name\":\"TestChild\",\"description\":\"Child of TestDept\",\"parent\":\"$PARENT_ID\"}")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "child:201"             "$CODE"  "HTTP_201"
expect "child:parent_name"     "$BODY"  '"parent_name":"TestDept"'
expect "child:parent-uuid"     "$BODY"  "\"parent\":\"$PARENT_ID\""
CHILD_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','ERR'))" 2>/dev/null)
echo "  Child ID: $CHILD_ID"

# ────────────────────────────────────────────────────────────
sep
echo "T4 · GET /departments/{id}/  →  retrieve parent, children_count should be 1"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/departments/$PARENT_ID/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "retrieve:200"              "$CODE"  "HTTP_200"
expect "retrieve:children_count-1" "$BODY"  '"children_count":1'

# ────────────────────────────────────────────────────────────
sep
echo "T5 · PATCH /departments/{id}/  →  rename + change description"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X PATCH "$BASE/departments/$PARENT_ID/" \
    -H "$AUTH" -H "$CT" \
    -d '{"name":"TestDept-Updated","description":"Updated description"}')
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "patch:200"                 "$CODE"  "HTTP_200"
expect "patch:name-updated"        "$BODY"  '"TestDept-Updated"'
expect "patch:desc-updated"        "$BODY"  '"Updated description"'

# ────────────────────────────────────────────────────────────
sep
echo "T6 · DELETE parent with child  →  409 Conflict"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X DELETE "$BASE/departments/$PARENT_ID/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "delete-blocked:409"    "$CODE"  "HTTP_409"
expect "delete-blocked:error"  "$BODY"  '"error"'

# ────────────────────────────────────────────────────────────
sep
echo "T7 · DELETE child dept  →  204"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X DELETE "$BASE/departments/$CHILD_ID/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE  (empty body = correct)"
echo "  Body   : '$BODY'"
expect "delete-child:204"      "$CODE"  "HTTP_204"

# ────────────────────────────────────────────────────────────
sep
echo "T8 · DELETE parent now (no children left)  →  204"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X DELETE "$BASE/departments/$PARENT_ID/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE  (empty body = correct)"
echo "  Body   : '$BODY'"
expect "delete-parent:204"     "$CODE"  "HTTP_204"

# ────────────────────────────────────────────────────────────
sep
echo "T9 · GET /departments/{deleted-id}/  →  404"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/departments/$PARENT_ID/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "deleted:404"           "$CODE"  "HTTP_404"

# ────────────────────────────────────────────────────────────
sep
echo "T10 · POST dup name (same tenant)  →  400 unique_together"
sep
# First create a dept, then try to create it again at same level
curl -s -X POST "$BASE/departments/" -H "$AUTH" -H "$CT" \
    -d '{"name":"DuplicateTest"}' > /dev/null
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/departments/" \
    -H "$AUTH" -H "$CT" \
    -d '{"name":"DuplicateTest"}')
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "dup:400"               "$CODE"  "HTTP_400"
# clean up
DUP_ID=$(curl -s "$BASE/departments/" -H "$AUTH" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(next((x['id'] for x in d.get('results',[]) if x['name']=='DuplicateTest'),''))")
[[ -n "$DUP_ID" ]] && curl -s -o /dev/null -X DELETE "$BASE/departments/$DUP_ID/" -H "$AUTH"

# ────────────────────────────────────────────────────────────
sep
echo "T11 · POST missing name  →  400"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/departments/" \
    -H "$AUTH" -H "$CT" \
    -d '{"description":"No name here"}')
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "missing-name:400"      "$CODE"  "HTTP_400"

# ────────────────────────────────────────────────────────────
sep
echo "T12 · GET /departments/ no token  →  401"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/departments/")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "no-auth:401"           "$CODE"  "HTTP_401"

# ────────────────────────────────────────────────────────────
printf "\n%s\n" "══════════════════════════════════════════════════════"
printf "  RESULTS:  ✅ %d passed   ❌ %d failed   Total %d\n" "$pass" "$fail" "$((pass+fail))"
printf "%s\n" "══════════════════════════════════════════════════════"
