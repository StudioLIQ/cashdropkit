#!/usr/bin/env sh

set -eu

WEB_BASE="${WEB_BASE:-https://www.cashdropkit.com}"
API_BASE="${API_BASE:-https://api.cashdropkit.com}"
API_TOKEN="${API_TOKEN:-cashdropkit-public-client-token}"
CURL_MAX_TIME="${CURL_MAX_TIME:-25}"
CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-10}"
FAIL=0
PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0
FAILED_CHECKS=""
START_TS="$(date +%s)"

HEADERS_FILE="$(mktemp -t cashdropkit-smoke-headers.XXXXXX)"
BODY_FILE="$(mktemp -t cashdropkit-smoke-body.XXXXXX)"
REQ_CODE=""
REQ_TIME="0"
REQ_SIZE="0"

cleanup() {
  rm -f "$HEADERS_FILE" "$BODY_FILE"
}

trap cleanup EXIT INT TERM

say() {
  printf '%s\n' "$1"
}

pass() {
  printf '[PASS] %s\n' "$1"
  PASS_COUNT=$((PASS_COUNT + 1))
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
}

fail() {
  printf '[FAIL] %s\n' "$1"
  FAIL=1
  FAIL_COUNT=$((FAIL_COUNT + 1))
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  if [ -z "$FAILED_CHECKS" ]; then
    FAILED_CHECKS="$1"
  else
    FAILED_CHECKS="$FAILED_CHECKS
$1"
  fi
}

request() {
  method="$1"
  url="$2"
  shift 2
  : >"$HEADERS_FILE"
  : >"$BODY_FILE"
  raw="$(
    curl -L -sS \
      --max-time "$CURL_MAX_TIME" \
      --connect-timeout "$CURL_CONNECT_TIMEOUT" \
      -X "$method" \
      -D "$HEADERS_FILE" \
      -o "$BODY_FILE" \
      "$@" \
      -w '%{http_code}|%{time_total}|%{size_download}' \
      "$url" || true
  )"
  REQ_CODE="$(printf '%s' "$raw" | awk -F'|' '{print $1}')"
  REQ_TIME="$(printf '%s' "$raw" | awk -F'|' '{print $2}')"
  REQ_SIZE="$(printf '%s' "$raw" | awk -F'|' '{print $3}')"
}

assert_code() {
  name="$1"
  expected="$2"
  if [ "$REQ_CODE" = "$expected" ]; then
    pass "$name (code=$REQ_CODE, t=${REQ_TIME}s)"
  else
    fail "$name (expected $expected, got $REQ_CODE, t=${REQ_TIME}s)"
  fi
}

assert_code_in() {
  name="$1"
  allowed="$2"
  matched=0
  for code in $allowed; do
    if [ "$REQ_CODE" = "$code" ]; then
      matched=1
      break
    fi
  done
  if [ "$matched" -eq 1 ]; then
    pass "$name (code=$REQ_CODE, t=${REQ_TIME}s)"
  else
    fail "$name (expected one of: $allowed, got $REQ_CODE, t=${REQ_TIME}s)"
  fi
}

header_value() {
  header_name="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  awk -v key="$header_name" '
    {
      line = $0
      sub(/\r$/, "", line)
      low = tolower(line)
      if (index(low, key ":") == 1) {
        sub(/^[^:]*:[ ]*/, "", line)
        print line
        exit
      }
    }
  ' "$HEADERS_FILE"
}

assert_header_contains() {
  name="$1"
  header_name="$2"
  needle="$3"
  value="$(header_value "$header_name")"
  if [ -n "$value" ] && printf '%s' "$value" | grep -Fqi "$needle"; then
    pass "$name"
  else
    fail "$name (header '$header_name' missing '$needle')"
  fi
}

assert_header_equals() {
  name="$1"
  header_name="$2"
  expected="$3"
  value="$(header_value "$header_name")"
  if [ "$value" = "$expected" ]; then
    pass "$name"
  else
    fail "$name (header '$header_name' expected '$expected', got '${value:-<empty>}')"
  fi
}

assert_header_absent() {
  name="$1"
  header_name="$2"
  value="$(header_value "$header_name")"
  if [ -z "$value" ]; then
    pass "$name"
  else
    fail "$name (header '$header_name' should be absent, got '$value')"
  fi
}

assert_body_contains() {
  name="$1"
  needle="$2"
  if grep -Fq "$needle" "$BODY_FILE"; then
    pass "$name"
  else
    fail "$name (body missing '$needle')"
  fi
}

check_web_200() {
  path="$1"
  request GET "$WEB_BASE$path"
  assert_code "web $path status" "200"
  assert_header_contains "web $path content-type html" "content-type" "text/html"
}

check_api_json_200() {
  path="$1"
  request GET "$API_BASE$path"
  assert_code "api $path status" "200"
  assert_header_contains "api $path content-type json" "content-type" "application/json"
}

AUTH_HEADER="Authorization: Bearer $API_TOKEN"
BAD_AUTH_HEADER="Authorization: Bearer smoke-invalid-token"
ALLOWED_ORIGIN="https://www.cashdropkit.com"
BLOCKED_ORIGIN="https://smoke-deny.example.com"

say "== CashDropKit Production Smoke (Hardened) =="
say "WEB_BASE=$WEB_BASE"
say "API_BASE=$API_BASE"
say "CURL_TIMEOUT=${CURL_CONNECT_TIMEOUT}s/${CURL_MAX_TIME}s"

say ""
say "-- Web routes + HTML contract --"
check_web_200 "/"
check_web_200 "/dashboard"
check_web_200 "/airdrops"
check_web_200 "/airdrops/new"
check_web_200 "/vesting"
check_web_200 "/vesting/new"
check_web_200 "/wallets"
check_web_200 "/settings"

say ""
say "-- API public routes + JSON contract --"
check_api_json_200 "/health"
assert_body_contains "api /health status ok" '"status":"ok"'
assert_body_contains "api /health service id" '"service":"@cashdropkit/api"'

check_api_json_200 "/api/v1"
assert_body_contains "api /api/v1 lists campaigns endpoint" '"campaigns"'
assert_body_contains "api /api/v1 lists vesting endpoint" '"vesting"'
assert_body_contains "api /api/v1 lists health endpoint" '"GET /health"'

say ""
say "-- API auth gates --"
request GET "$API_BASE/api/v1/campaigns"
assert_code "campaigns without token -> 401" "401"
assert_header_contains "campaigns without token json" "content-type" "application/json"
assert_body_contains "campaigns without token error code" '"code":"UNAUTHORIZED"'

request GET "$API_BASE/api/v1/campaigns" -H "$BAD_AUTH_HEADER"
assert_code "campaigns with wrong token -> 401" "401"
assert_body_contains "campaigns with wrong token error code" '"code":"UNAUTHORIZED"'

request GET "$API_BASE/api/v1/campaigns" -H "$AUTH_HEADER"
assert_code "campaigns with token list -> 200" "200"
assert_header_contains "campaigns with token json" "content-type" "application/json"
assert_body_contains "campaigns with token success true" '"success":true'
assert_body_contains "campaigns payload has items" '"items"'

request GET "$API_BASE/api/v1/vesting" -H "$AUTH_HEADER"
assert_code "vesting with token list -> 200" "200"
assert_header_contains "vesting with token json" "content-type" "application/json"
assert_body_contains "vesting with token success true" '"success":true'

say ""
say "-- API validation + error contract --"
request GET "$API_BASE/api/v1/campaigns?page=0&pageSize=999" -H "$AUTH_HEADER"
assert_code "campaigns pagination sanitization status" "200"
assert_body_contains "campaigns pagination clamps page" '"page":1'
assert_body_contains "campaigns pagination clamps pageSize" '"pageSize":100'

request GET "$API_BASE/api/v1/campaigns?network=mainnet" -H "$AUTH_HEADER"
assert_code "campaigns network mainnet rejected" "400"
assert_body_contains "campaigns network mainnet error code" '"code":"UNSUPPORTED_NETWORK"'

request POST "$API_BASE/api/v1/campaigns" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  --data-raw '{"broken":'
assert_code "campaign create invalid json -> 400" "400"
assert_body_contains "campaign create invalid json error code" '"code":"INVALID_JSON"'

request POST "$API_BASE/api/v1/campaigns" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  --data-raw '{"id":"smoke-secret-block","name":"smoke","network":"testnet","tokenId":"token","mnemonic":"forbidden"}'
assert_code "campaign create secret field blocked" "400"
assert_body_contains "campaign create secret field error code" '"code":"SECRET_DETECTED"'

request POST "$API_BASE/api/v1/campaigns" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  --data-raw '{"id":"smoke-mainnet-block","name":"smoke","network":"mainnet","tokenId":"token"}'
assert_code "campaign create unsupported network -> 400" "400"
assert_body_contains "campaign create unsupported network error code" '"code":"UNSUPPORTED_NETWORK"'

say ""
say "-- API routing + CORS contract --"
request GET "$API_BASE/api/v1/not-found-smoke"
assert_code "api not found route -> 404" "404"
assert_body_contains "api not found error code" '"code":"NOT_FOUND"'

request POST "$API_BASE/health"
assert_code "api method mismatch POST /health -> 404" "404"
assert_header_contains "api method mismatch json" "content-type" "application/json"

request GET "$API_BASE/health" -H "Origin: $ALLOWED_ORIGIN"
assert_code "cors allowed origin status" "200"
assert_header_equals "cors allowed origin reflected" "access-control-allow-origin" "$ALLOWED_ORIGIN"
assert_header_contains "cors allowed origin credentials true" "access-control-allow-credentials" "true"
assert_header_contains "cors allowed origin vary" "vary" "Origin"

request GET "$API_BASE/health" -H "Origin: $BLOCKED_ORIGIN"
assert_code "cors blocked origin status" "200"
assert_header_absent "cors blocked origin omits ACAO" "access-control-allow-origin"

request OPTIONS "$API_BASE/api/v1/campaigns" \
  -H "Origin: $ALLOWED_ORIGIN" \
  -H "Access-Control-Request-Method: GET"
assert_code_in "cors preflight status" "204 200"
assert_header_equals "cors preflight ACAO reflected" "access-control-allow-origin" "$ALLOWED_ORIGIN"
assert_header_contains "cors preflight methods include GET" "access-control-allow-methods" "GET"

say ""
DURATION_SEC=$(( $(date +%s) - START_TS ))
if [ "$TOTAL_COUNT" -gt 0 ]; then
  PASS_RATE=$((PASS_COUNT * 100 / TOTAL_COUNT))
else
  PASS_RATE=0
fi
say "SUMMARY total=$TOTAL_COUNT pass=$PASS_COUNT fail=$FAIL_COUNT pass_rate=${PASS_RATE}% duration=${DURATION_SEC}s"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    printf '## Production Smoke Summary\n'
    printf '\n'
    printf '| Metric | Value |\n'
    printf '|---|---|\n'
    printf '| Web Base | `%s` |\n' "$WEB_BASE"
    printf '| API Base | `%s` |\n' "$API_BASE"
    printf '| Total Checks | `%s` |\n' "$TOTAL_COUNT"
    printf '| Passed | `%s` |\n' "$PASS_COUNT"
    printf '| Failed | `%s` |\n' "$FAIL_COUNT"
    printf '| Pass Rate | `%s%%` |\n' "$PASS_RATE"
    printf '| Duration | `%ss` |\n' "$DURATION_SEC"
    if [ "$FAIL_COUNT" -gt 0 ]; then
      printf '\n'
      printf '### Failed Checks\n'
      printf '%s\n' "$FAILED_CHECKS" | sed 's/^/- /'
    fi
  } >> "$GITHUB_STEP_SUMMARY"
fi

if [ "$FAIL" -eq 0 ]; then
  say "ALL CHECKS PASSED"
else
  say "FAILED CHECKS:"
  printf '%s\n' "$FAILED_CHECKS" | sed 's/^/ - /'
  say "SMOKE CHECKS FAILED"
  exit 1
fi
