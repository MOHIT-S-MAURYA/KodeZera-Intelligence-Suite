#!/usr/bin/env zsh
# ─────────────────────────────────────────────────────────────
# Audit Logs API — Full Test Suite
# Run with:  export TOKEN=<jwt>; zsh scripts/test_auditlogs_api.sh
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

# Generate a write action so there's at least one audit log entry
curl -s -o /dev/null -X POST "$BASE/roles/" -H "$AUTH" -H "$CT" \
    -d '{"name":"_AuditTestRole_","description":"Temporary"}' 2>/dev/null
# brief pause to let middleware background thread write the row
sleep 0.5

# ────────────────────────────────────────────────────────────
sep
echo "T1 · GET /audit-logs/  →  list (read-only, paginated)"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/audit-logs/" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Payload: $(echo "$BODY" | python3 -m json.tool --compact 2>/dev/null | head -c 700)"
expect "list:200"                  "$CODE"  "HTTP_200"
expect "list:count-key"            "$BODY"  '"count"'
expect "list:results-key"          "$BODY"  '"results"'
expect "list:action-field"         "$BODY"  '"action"'
expect "list:resource_type-field"  "$BODY"  '"resource_type"'
expect "list:user_email-field"     "$BODY"  '"user_email"'
expect "list:user_name-field"      "$BODY"  '"user_name"'
absent "list:no-user_agent"        "$BODY"  '"user_agent"'    # deferred; not in API

# ────────────────────────────────────────────────────────────
sep
echo "T2 · GET /audit-logs/?action=create  →  filter by action"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/audit-logs/?action=create" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
echo "  Count  : $(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('count=',d.get('count','?'))" 2>/dev/null)"
expect "filter-action:200"         "$CODE"  "HTTP_200"
# All results must have action=create
HAS_NON_CREATE=$(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
bad=[r['action'] for r in d.get('results',[]) if r['action']!='create']
print('FAIL' if bad else 'PASS')
" 2>/dev/null)
if [[ "$HAS_NON_CREATE" == "PASS" ]]; then
    echo "  ✅ PASS  [filter-action:only-creates]"
    ((pass++))
else
    echo "  ❌ FAIL  [filter-action:only-creates]  non-create entries found"
    ((fail++))
fi

# ────────────────────────────────────────────────────────────
sep
echo "T3 · GET /audit-logs/?date_from=2020-01-01&date_to=2099-12-31  →  date range returns records"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" \
    "$BASE/audit-logs/?date_from=2020-01-01&date_to=2099-12-31" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null)
echo "  Count  : $COUNT"
expect "date-range:200"            "$CODE"  "HTTP_200"
if [[ "$COUNT" -gt 0 ]]; then
    echo "  ✅ PASS  [date-range:has-results]  count=$COUNT"
    ((pass++))
else
    echo "  ❌ FAIL  [date-range:has-results]  no entries in full date range"
    ((fail++))
fi

# ────────────────────────────────────────────────────────────
sep
echo "T4 · GET /audit-logs/?date_from=2099-01-01  →  future date returns empty"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" \
    "$BASE/audit-logs/?date_from=2099-01-01" -H "$AUTH")
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null)
echo "  Count  : $COUNT"
expect "future-date:200"           "$CODE"  "HTTP_200"
if [[ "$COUNT" -eq 0 ]]; then
    echo "  ✅ PASS  [future-date:empty]  count=0 as expected"
    ((pass++))
else
    echo "  ❌ FAIL  [future-date:empty]  expected 0, got $COUNT"
    ((fail++))
fi

# ────────────────────────────────────────────────────────────
sep
echo "T5 · POST /audit-logs/  →  405 (read-only)"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$BASE/audit-logs/" \
    -H "$AUTH" -H "$CT" -d '{"action":"login"}')
BODY=$(echo "$R" | head -1)
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE  (must not be 201)"
expect "readonly:405"              "$CODE"  "HTTP_405"

# ────────────────────────────────────────────────────────────
sep
echo "T6 · DELETE /audit-logs/{id}/  →  405 (read-only)"
sep
# Get first log ID
FIRST_ID=$(curl -s "$BASE/audit-logs/" -H "$AUTH" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d['results'][0]['id'] if d.get('results') else '')" 2>/dev/null)
if [[ -n "$FIRST_ID" ]]; then
    R=$(curl -s -w "\nHTTP_%{http_code}" -X DELETE "$BASE/audit-logs/$FIRST_ID/" -H "$AUTH")
    CODE=$(echo "$R" | tail -1)
    echo "  HTTP   : $CODE  (must not be 204)"
    expect "readonly-del:405"          "$CODE"  "HTTP_405"
else
    echo "  ⚠️  SKIP  [readonly-del:405]  no entries to test with"
fi

# ────────────────────────────────────────────────────────────
sep
echo "T7 · GET /audit-logs/ — no token  →  401"
sep
R=$(curl -s -w "\nHTTP_%{http_code}" "$BASE/audit-logs/")
CODE=$(echo "$R" | tail -1)
echo "  HTTP   : $CODE"
expect "no-auth:401"               "$CODE"  "HTTP_401"

# ────────────────────────────────────────────────────────────
# Clean up the temp role created at the start
TEMP_ID=$(curl -s "$BASE/roles/" -H "$AUTH" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(next((x['id'] for x in d.get('results',[]) if x['name']=='_AuditTestRole_'),''))")
[[ -n "$TEMP_ID" ]] && curl -s -o /dev/null -X DELETE "$BASE/roles/$TEMP_ID/" -H "$AUTH"

printf "\n%s\n" "══════════════════════════════════════════════════════"
printf "  RESULTS:  ✅ %d passed   ❌ %d failed   Total %d\n" "$pass" "$fail" "$((pass+fail))"
printf "%s\n" "══════════════════════════════════════════════════════"
