#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <base-url> [connections] [duration-seconds]"
  echo "example: $0 http://127.0.0.1:8787 25 30"
  exit 1
fi

BASE_URL="${1%/}"
CONNECTIONS="${2:-25}"
DURATION="${3:-30}"
SEARCH_PATH="/api/v1/search/providers?limit=20&sort=newest"
HEALTH_PATH="/api/health"

echo "[lbv] base url: ${BASE_URL}"
echo "[lbv] checking baseline endpoints"
curl -fsS -D - "${BASE_URL}${HEALTH_PATH}" -o /tmp/lbv-health.out
curl -fsS -D - "${BASE_URL}${SEARCH_PATH}" -o /tmp/lbv-search.out

echo "[lbv] health body"
cat /tmp/lbv-health.out

echo "[lbv] search body bytes"
wc -c /tmp/lbv-search.out

echo "[lbv] running autocannon"
npx --yes autocannon \
  --connections "${CONNECTIONS}" \
  --duration "${DURATION}" \
  --renderStatusCodes \
  "${BASE_URL}${SEARCH_PATH}"
