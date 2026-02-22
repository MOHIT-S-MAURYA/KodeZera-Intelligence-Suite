#!/usr/bin/env zsh

BASE="http://localhost:8000/api/v1"
AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"

pass=0
fail=0

sep() { printf "\n%-50s\n" "──────────────────────────────────────────────────" }
expect() {
  local label="$1" actual="$2" want="$3"
  if [[ "$actual" == *"$want"* ]]; then
    echo "  ✅ PASS  [$label]  (matched: $want)"
    ((pass++))
  else
    echo "  ❌ FAIL  [$label]  expected '$want'"
    echo "     got  : $(echo "$actual" | head -c 300)"
    ((fail++))
  fi
}

# ────────────────────────────────────────────────────────────
sep
echo "T1 · GET /users/  →  list all users in tenant"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/users/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $(echo "$BODY" | python3 -m json.tool --compact 2>/dev/null | head -c 500)"
expect "list:status-200"      "$CODE"  "HTTP_200"
expect "list:count-key"       "$BODY"  '"count"'
expect "list:results-key"     "$BODY"  '"results"'
expect "list:admin-present"   "$BODY"  "admin@demo.com"

# ────────────────────────────────────────────────────────────
sep
echo "T2 · POST /users/  →  create testuser@demo.com"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/users/" \
    -H "$AUTH" -H "$CT" \
    -d '{"first_name":"Test","last_name":"User","email":"testuser@demo.com","password":"testpass123","is_tenant_admin":false}')
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "create:status-201"     "$CODE"  "HTTP_201"
expect "create:email-echoed"   "$BODY"  "testuser@demo.com"
expect "create:id-present"     "$BODY"  '"id"'
# Password MUST NOT appear in response
if [[ "$BODY" == *"testpass123"* ]]; then
  echo "  ❌ SECURITY FAIL: raw password leaked in response"
  ((fail++))
else
  echo "  ✅ PASS  [create:no-password-leak]"
  ((pass++))
fi
NEW_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','ERR'))" 2>/dev/null)
echo "  New ID : $NEW_ID"

# ────────────────────────────────────────────────────────────
sep
echo "T3 · POST /users/ duplicate email  →  400/409 expected"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/users/" \
    -H "$AUTH" -H "$CT" \
    -d '{"first_name":"Test","last_name":"User","email":"testuser@demo.com","password":"testpass123"}')
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "dup:4xx-error"         "$CODE"  "HTTP_4"

# ────────────────────────────────────────────────────────────
sep
echo "T4 · POST /users/ missing email  →  400 expected"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/users/" \
    -H "$AUTH" -H "$CT" \
    -d '{"first_name":"NoEmail","last_name":"User","password":"pass1234"}')
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "missing-email:400"     "$CODE"  "HTTP_400"

# ────────────────────────────────────────────────────────────
sep
echo "T5 · GET /users/{id}/  →  retrieve by UUID"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/users/$NEW_ID/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "retrieve:200"          "$CODE"  "HTTP_200"
expect "retrieve:email"        "$BODY"  "testuser@demo.com"
if [[ "$BODY" == *'"password"'* ]]; then
  echo "  ❌ SECURITY FAIL: password field present in GET response"
  ((fail++))
else
  echo "  ✅ PASS  [retrieve:no-password-field-in-response]"
  ((pass++))
fi

# ────────────────────────────────────────────────────────────
sep
echo "T6 · PATCH /users/{id}/  →  update name"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X PATCH "$BASE/users/$NEW_ID/" \
    -H "$AUTH" -H "$CT" \
    -d '{"first_name":"Updated","last_name":"Name"}')
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "patch:200"             "$CODE"  "HTTP_200"
expect "patch:full_name"       "$BODY"  "Updated Name"
expect "patch:email-unchanged" "$BODY"  "testuser@demo.com"

# ────────────────────────────────────────────────────────────
sep
echo "T7 · POST /users/{id}/toggle-status/  →  active → inactive"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/users/$NEW_ID/toggle-status/" \
    -H "$AUTH" -H "$CT")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "toggle-off:200"        "$CODE"  "HTTP_200"
expect "toggle-off:is_active"  "$BODY"  '"is_active":false'

# ────────────────────────────────────────────────────────────
sep
echo "T8 · POST /users/{id}/toggle-status/  →  inactive → active"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/users/$NEW_ID/toggle-status/" \
    -H "$AUTH" -H "$CT")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "toggle-on:200"         "$CODE"  "HTTP_200"
expect "toggle-on:is_active"   "$BODY"  '"is_active":true'

# ────────────────────────────────────────────────────────────
sep
echo "T9 · DELETE self  →  403 expected"
sep
ADMIN_ID=$(curl -s "$BASE/users/" -H "$AUTH" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(next((u['id'] for u in d.get('results',[]) if u['email']=='admin@demo.com'),''))")
echo "  Admin ID: $ADMIN_ID"
R=$(curl -s -w "\nHTTP_%{http_code}" -X DELETE "$BASE/users/$ADMIN_ID/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "self-delete:403"       "$CODE"  "HTTP_403"

# ────────────────────────────────────────────────────────────
sep
echo "T10 · DELETE /users/{id}/  →  delete testuser"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X DELETE "$BASE/users/$NEW_ID/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE  (empty body = correct)"
echo "  Body   : '${BODY}'"
expect "delete:204"            "$CODE"  "HTTP_204"

# ────────────────────────────────────────────────────────────
sep
echo "T11 · GET deleted user  →  404"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/users/$NEW_ID/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "deleted:404"           "$CODE"  "HTTP_404"

# ────────────────────────────────────────────────────────────
sep
echo "T12 · GET /users/ without token  →  401"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/users/")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $BODY"
expect "no-auth:401"           "$CODE"  "HTTP_401"

# ────────────────────────────────────────────────────────────
printf "\n%s\n" "══════════════════════════════════════════════════════"
printf "  RESULTS:  ✅ %d passed   ❌ %d failed   Total %d\n" "$pass" "$fail" "$((pass+fail))"
printf "%s\n" "══════════════════════════════════════════════════════"
