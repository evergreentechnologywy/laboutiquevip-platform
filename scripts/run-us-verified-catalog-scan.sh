#!/usr/bin/env bash
# US-wide verified catalog scan: Eros + Tryst with standard caps (250/city, 5 cities/state).
# Pre-import gate keeps only providers with P411 and/or review (TER/PD/TOB) match.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/laboutiquevip-us-verified-scan.lock}"
LOG_FILE="${LOG_DIR}/us-verified-catalog-scan.log"
REPORT_FILE="${LOG_DIR}/us-verified-catalog-scan-report.log"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"

set -a
# shellcheck disable=SC1091
. ./.env
set +a
export NODE_PATH="$REPO_DIR/node_modules"
# shellcheck disable=SC1091
. "$REPO_DIR/scripts/lib/lbv-import-defaults.sh"
export DELAY_MS="${DELAY_MS:-600}"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") skipped lock_busy" >> "$REPORT_FILE"
  exit 2
fi

RUN_LOG="$(mktemp)"
cleanup() { rm -f "$RUN_LOG"; }
trap cleanup EXIT

set +e
{
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") US verified catalog scan start ==="
  echo "eros caps: city=${PROFILES_PER_CITY} state=${PROFILES_PER_STATE} maxPages=${EROS_MAX_PAGES}"
  echo "tryst caps: profilesPerCity=${TRYST_MAX_PROFILES_PER_CITY} citiesPerState=${TRYST_MAX_CITIES_PER_STATE}"

  node "$REPO_DIR/scripts/import-eros.mjs" \
    --delay-ms="$DELAY_MS" \
    --max-pages="$EROS_MAX_PAGES" \
    --from-cities \
    --profiles-per-city="$PROFILES_PER_CITY" \
    --profiles-per-state="$PROFILES_PER_STATE"

  node "$REPO_DIR/scripts/import-tryst.mjs"
  node "$REPO_DIR/scripts/reconcile-tryst.mjs"
  node "$REPO_DIR/scripts/match-review-profiles.mjs" || true

  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") US verified catalog scan done ==="
} 2>&1 | tee -a "$LOG_FILE" | tee "$RUN_LOG" >/dev/null
RUN_EXIT=${PIPESTATUS[0]}
set -e

TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
if [[ "$RUN_EXIT" -eq 0 ]]; then
  echo "$TS status=ok exit=0 caps=city${PROFILES_PER_CITY}_state${TRYST_MAX_CITIES_PER_STATE}" >> "$REPORT_FILE"
  SCAN_STATUS=ok
else
  echo "$TS status=failed exit=$RUN_EXIT" >> "$REPORT_FILE"
  SCAN_STATUS=failed
fi

export NODE_PATH="$REPO_DIR/node_modules"
node "$REPO_DIR/scripts/lbv-catalog-scan-notify.mjs" \
  --log="$RUN_LOG" \
  --status="$SCAN_STATUS" \
  --exit="$RUN_EXIT" >> "${LOG_DIR}/catalog-scan-notify.log" 2>&1 || true

exit "$RUN_EXIT"
