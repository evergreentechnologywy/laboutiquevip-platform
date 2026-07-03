#!/usr/bin/env bash
# Daily Eros photo refresh → R2 + capped incremental import. No ultragfe.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/laboutiquevip-eros-photo-update.lock}"
DELAY_MS="${DELAY_MS:-350}"
PROFILES_PER_CITY="${PROFILES_PER_CITY:-50}"
PROFILES_PER_STATE="${PROFILES_PER_STATE:-100}"
LOG_FILE="${LOG_DIR}/eros-photo-update.log"
REPORT_FILE="${LOG_DIR}/eros-photo-update-report.log"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"

set -a
# shellcheck disable=SC1091
. ./.env
set +a
export NODE_PATH="$REPO_DIR/node_modules"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") skipped lock_busy" >> "$REPORT_FILE"
  exit 0
fi

{
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") eros photo update start ==="

  echo "--- dedupe imported providers ---"
  node "$REPO_DIR/scripts/dedupe-imported-providers.cjs" || true

  echo "--- refresh Eros photos → R2 ---"
  node "$REPO_DIR/scripts/populate-r2-from-eros.cjs" --delay-ms="$DELAY_MS"

  echo "--- incremental Eros catalog (city-seeded, capped) ---"
  node "$REPO_DIR/scripts/import-eros.mjs" \
    --delay-ms="$DELAY_MS" \
    --max-pages=2500 \
    --from-cities \
    --profiles-per-city="$PROFILES_PER_CITY" \
    --profiles-per-state="$PROFILES_PER_STATE" || true

  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") eros photo update done ==="
} 2>&1 | tee -a "$LOG_FILE"

echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") status=ok" >> "$REPORT_FILE"
