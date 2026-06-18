#!/usr/bin/env bash
# Production smoke checks for www.laboutiquevip.net
set -euo pipefail

BASE="${LBV_BASE_URL:-https://www.laboutiquevip.net}"
API="${BASE}/api"

pass=0
fail=0

check() {
  local name="$1" url="$2" expect="${3:-200}"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "$url" || echo "000")
  if [[ "$code" == "$expect" ]]; then
    echo "✓ $name ($code)"
    pass=$((pass + 1))
  else
    echo "✗ $name expected $expect got $code — $url"
    fail=$((fail + 1))
  fi
}

check_post() {
  local name="$1" url="$2" expect="$3"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 -X POST "$url" \
    -H "Content-Type: application/json" -d '{}' || echo "000")
  if [[ "$code" == "$expect" ]]; then
    echo "✓ $name ($code)"
    pass=$((pass + 1))
  else
    echo "✗ $name expected $expect got $code — $url"
    fail=$((fail + 1))
  fi
}

echo "=== LBV Production Smoke — $BASE ==="

check "Homepage" "$BASE/"
check "Browse" "$BASE/browse"
check "Pricing" "$BASE/pricing"
check "Trust" "$BASE/trust"
check "Login" "$BASE/login"
check "Robots" "$BASE/robots.txt"
check "Sitemap" "$BASE/sitemap.xml"
check "API health" "$API/health"
check "Search cities" "$API/v1/search/cities?q=miami"
check "Search providers" "$API/v1/search/providers?limit=1"

# Webhook auth (invalid signature → 401)
check_post "NOWPayments webhook rejects bad sig" "$API/v1/webhooks/nowpayments" "401"
check_post "Didit webhook rejects bad sig" "$API/v1/webhooks/didit" "401"
check "Agency API requires auth" "$API/v1/agency/profiles" "401"

# Profile page (first search result)
PROFILE_ID=$(curl -sS "$API/v1/search/providers?limit=1" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('items') or [{}])[0].get('id',''))" 2>/dev/null || echo "")
if [[ -n "$PROFILE_ID" ]]; then
  check "View profile" "$BASE/viewprofile?id=$PROFILE_ID"
else
  echo "✗ View profile — no provider id from search"
  fail=$((fail + 1))
fi

# Premium agency models visible
premium=$(curl -sS "$API/v1/search/providers?premium=true&limit=20" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total',0))" 2>/dev/null || echo 0)
if [[ "$premium" -ge 10 ]]; then
  echo "✓ Premium providers ($premium)"
  pass=$((pass + 1))
else
  echo "✗ Premium providers low: $premium (expected >= 10)"
  fail=$((fail + 1))
fi

echo "---"
echo "Pass: $pass  Fail: $fail"
[[ "$fail" -eq 0 ]]
