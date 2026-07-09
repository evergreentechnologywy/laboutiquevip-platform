#!/usr/bin/env bash
# US catalog scan (8 PM Mountain): daily scrape Eros + Tryst with P411/review verification gate,
# stage profiles + source photo URLs to cache. Production import + R2 at midnight merge.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/lboutiquevip-us-verified-scan.lock}"
SCAN_FLAG_PATH="${SCAN_FLAG_PATH:-/var/run/lboutiquevip/catalog-scan-in-progress.json}"
LOG_FILE="${LOG_DIR}/us-verified-catalog-scan.log"
REPORT_FILE="${LOG_DIR}/us-verified-catalog-scan-report.log"
CACHE_ROOT="${CATALOG_SCAN_CACHE_ROOT:-/var/run/lboutiquevip/catalog-scan-cache}"
SCAN_DATE="$(TZ="${CATALOG_SCAN_TZ:-America/Denver}" date +%Y%m%d)"
export CATALOG_SCAN_CACHE_DIR="${CATALOG_SCAN_CACHE_DIR:-${CACHE_ROOT}/${SCAN_DATE}}"

mkdir -p "$LOG_DIR" "$CATALOG_SCAN_CACHE_DIR"
cd "$REPO_DIR"

bash "$REPO_DIR/scripts/ensure-lbv-scripts-executable.sh"

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
write_scan_flag() {
  printf '{"startedAt":"%s","source":"us-verified-catalog-scan","phase":"%s","cacheDir":"%s"}\n' \
    "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1" "$CATALOG_SCAN_CACHE_DIR" >"$SCAN_FLAG_PATH"
}
clear_scan_flag() {
  rm -f "$SCAN_FLAG_PATH"
}
cleanup() {
  clear_scan_flag
  rm -f "$RUN_LOG"
}
trap cleanup EXIT

write_scan_flag "eros-import"

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

  write_scan_flag "tryst-import"
  node "$REPO_DIR/scripts/import-tryst.mjs" --cache-only
  write_scan_flag "finalize-cache"

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
export CATALOG_SCAN_SCHEDULE_NOTE="Staged for midnight merge (DB + Eros/Tryst photos → R2). Live site unchanged until then."
node "$REPO_DIR/scripts/lbv-catalog-scan-notify.mjs" \
  --log="$RUN_LOG" \
  --status="$SCAN_STATUS" \
  --exit="$RUN_EXIT" \
  --phase=scan >> "${LOG_DIR}/catalog-scan-notify.log" 2>&1 || true

exit "$RUN_EXIT"
