#!/usr/bin/env sh

set -eu

WEB_BASE="${WEB_BASE:-https://www.cashdropkit.com}"
API_BASE="${API_BASE:-https://api.cashdropkit.com}"
API_TOKEN="${API_TOKEN:-cashdropkit-public-client-token}"
FAIL=0

say() {
  printf '%s\n' "$1"
}

pass() {
  printf '[PASS] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1"
  FAIL=1
}

check_http_200() {
  name="$1"
  url="$2"
  code="$(curl -L -s -o /dev/null -w '%{http_code}' "$url" || true)"
  if [ "$code" = "200" ]; then
    pass "$name ($code)"
  else
    fail "$name (got $code) -> $url"
  fi
}

check_http_401() {
  name="$1"
  url="$2"
  code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)"
  if [ "$code" = "401" ]; then
    pass "$name ($code)"
  else
    fail "$name (got $code) -> $url"
  fi
}

check_contains() {
  name="$1"
  body="$2"
  needle="$3"
  if printf '%s' "$body" | grep -q "$needle"; then
    pass "$name"
  else
    fail "$name (missing: $needle)"
  fi
}

say "== CashDropKit Production Smoke =="
say "WEB_BASE=$WEB_BASE"
say "API_BASE=$API_BASE"

say ""
say "-- Web routes --"
check_http_200 "web /" "$WEB_BASE/"
check_http_200 "web /dashboard" "$WEB_BASE/dashboard"
check_http_200 "web /airdrops" "$WEB_BASE/airdrops"
check_http_200 "web /vesting" "$WEB_BASE/vesting"
check_http_200 "web /wallets" "$WEB_BASE/wallets"

say ""
say "-- API health/public --"
health="$(curl -s "$API_BASE/health" || true)"
if [ -n "$health" ]; then
  check_contains "api /health has status ok" "$health" '"status":"ok"'
else
  fail "api /health returned empty body"
fi
check_http_200 "api /api/v1" "$API_BASE/api/v1"

say ""
say "-- API auth gates --"
check_http_401 "api campaigns without token" "$API_BASE/api/v1/campaigns"

auth_code="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $API_TOKEN" "$API_BASE/api/v1/campaigns" || true)"
if [ "$auth_code" = "200" ]; then
  pass "api campaigns with token (200)"
else
  fail "api campaigns with token (got $auth_code)"
fi

say ""
if [ "$FAIL" -eq 0 ]; then
  say "ALL CHECKS PASSED"
else
  say "SMOKE CHECKS FAILED"
  exit 1
fi
