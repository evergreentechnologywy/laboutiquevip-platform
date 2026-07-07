#!/usr/bin/env bash
# US catalog scan (8 PM Mountain): crawl Eros + Tryst, verify, stage to cache only.
# Production DB merge runs separately at midnight via run-us-verified-catalog-merge.sh
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/laboutiquevip-us-verified-scan.lock}"
LOG_FILE="${LOG_DIR}/us-verified-catalog-scan.log"
REPORT_FILE="${LOG_DIR}/us-verified-catalog-scan-report.log"
CACHE_ROOT="${CATALOG_SCAN_CACHE_ROOT:-/var/run/lboutiquevip/catalog-scan-cache}"
SCAN_DATE="$(TZ="${CATALOG_SCAN_TZ:-America/Denver}" date +%Y%m%d)"
export CATALOG_SCAN_CACHE_DIR="${CATALOG_SCAN_CACHE_DIR:-${CACHE_ROOT}/${SCAN_DATE}}"

mkdir -p "$LOG_DIR" "$CATALOG_SCAN_CACHE_DIR"
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
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") US verified catalog scan (cache-only) start ==="
  echo "cacheDir=${CATALOG_SCAN_CACHE_DIR}"
  echo "eros caps: city=${PROFILES_PER_CITY} state=${PROFILES_PER_STATE} maxPages=${EROS_MAX_PAGES}"
  echo "tryst caps: profilesPerCity=${TRYST_MAX_PROFILES_PER_CITY} citiesPerState=${TRYST_MAX_CITIES_PER_STATE}"

  node "$REPO_DIR/scripts/import-eros.mjs" \
    --cache-only \
    --delay-ms="$DELAY_MS" \
    --max-pages="$EROS_MAX_PAGES" \
    --from-cities \
    --profiles-per-city="$PROFILES_PER_CITY" \
    --profiles-per-state="$PROFILES_PER_STATE"

  node "$REPO_DIR/scripts/import-tryst.mjs" --cache-only

  node -e "
    import { finalizeCacheDir } from './scripts/lib/catalog-scan-cache.mjs';
    finalizeCacheDir(process.env.CATALOG_SCAN_CACHE_DIR, {
      phase: 'scan',
      scanDate: '${SCAN_DATE}',
    });
  "

  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") US verified catalog scan (cache-only) done ==="
} 2>&1 | tee -a "$LOG_FILE" | tee "$RUN_LOG" >/dev/null
RUN_EXIT=${PIPESTATUS[0]}
set -e

TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
if [[ "$RUN_EXIT" -eq 0 ]]; then
  echo "$TS status=ok exit=0 phase=scan cache=${CATALOG_SCAN_CACHE_DIR}" >> "$REPORT_FILE"
  SCAN_STATUS=ok
else
  echo "$TS status=failed exit=$RUN_EXIT phase=scan" >> "$REPORT_FILE"
  SCAN_STATUS=failed
fi

export NODE_PATH="$REPO_DIR/node_modules"
export CATALOG_SCAN_SCHEDULE_NOTE="Staged for production merge at midnight America/Denver. Live site unchanged until then."
node "$REPO_DIR/scripts/lbv-catalog-scan-notify.mjs" \
  --log="$RUN_LOG" \
  --status="$SCAN_STATUS" \
  --exit="$RUN_EXIT" \
  --phase=scan >> "${LOG_DIR}/catalog-scan-notify.log" 2>&1 || true

exit "$RUN_EXIT"
