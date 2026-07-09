#!/usr/bin/env bash
# Midnight production merge: apply staged 8 PM scan → DB, staged photos → R2,
# Eros/Tryst reconcile, P411+review match, dedupe, full Eros/Tryst photo refresh.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/lboutiquevip-us-verified-merge.lock}"
FLAG_PATH="${IMPORT_FLAG_PATH:-/var/run/lboutiquevip/import-in-progress}"
DELAY_MS="${DELAY_MS:-350}"
LOG_FILE="${LOG_DIR}/us-verified-catalog-merge.log"
REPORT_FILE="${LOG_DIR}/us-verified-catalog-merge-report.log"

mkdir -p "$LOG_DIR" /var/run/lboutiquevip
cd "$REPO_DIR"

bash "$REPO_DIR/scripts/ensure-lbv-scripts-executable.sh"

set -a
# shellcheck disable=SC1091
. ./.env
set +a
export NODE_PATH="$REPO_DIR/node_modules"
# shellcheck disable=SC1091
. "$REPO_DIR/scripts/lib/lbv-import-defaults.sh"
resolve_catalog_cache_dir() {
  for root in /run/laboutiquevip/catalog-scan-cache /var/run/laboutiquevip/catalog-scan-cache; do
    if [[ -L "$root/latest" ]]; then
      echo "$(readlink -f "$root/latest")"
      return 0
    fi
    local latest_dated
    latest_dated="$(ls -1d "$root"/202* 2>/dev/null | sort | tail -1)"
    if [[ -n "$latest_dated" ]]; then
      echo "$latest_dated"
      return 0
    fi
  done
}
export CATALOG_SCAN_CACHE_DIR="${CATALOG_SCAN_CACHE_DIR:-$(resolve_catalog_cache_dir)}"
export REVIEW_MATCH_LIMIT="${REVIEW_MATCH_LIMIT:-0}"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") skipped merge_lock_busy" >> "$REPORT_FILE"
  exit 2
fi

write_flag() {
  printf '{"startedAt":"%s","source":"us-verified-catalog-merge","phase":"%s","mode":"soft"}\n' \
    "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1" >"$FLAG_PATH"
}

clear_flag() {
  rm -f "$FLAG_PATH"
}

RUN_LOG="$(mktemp)"
cleanup() {
  clear_flag
  rm -f "$RUN_LOG"
}
trap cleanup EXIT

set +e
{
  write_flag "merge-cache"
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") US verified catalog merge start ==="

  # shellcheck disable=SC1091
  . "$REPO_DIR/scripts/lib/ensure-prisma-client.sh"
  node "$REPO_DIR/scripts/merge-catalog-scan-cache.mjs"
  write_flag "staged-r2-photos"
  if [[ -n "${CATALOG_SCAN_CACHE_DIR}" && -d "${CATALOG_SCAN_CACHE_DIR}" ]]; then
    node "$REPO_DIR/scripts/populate-r2-from-staged-cache.mjs" --cache-dir="$CATALOG_SCAN_CACHE_DIR"
  else
    echo "WARN: no staged cache dir; skipping populate-r2-from-staged-cache"
  fi
  write_flag "reconcile-eros"
  node "$REPO_DIR/scripts/reconcile-eros.mjs" \
    --profiles-per-city="$PROFILES_PER_CITY" \
    --profiles-per-state="$PROFILES_PER_STATE" \
    --skip-deactivate
  write_flag "reconcile-tryst"
  node "$REPO_DIR/scripts/reconcile-tryst.mjs"
  write_flag "hide-stale-catalog"
  node "$REPO_DIR/scripts/hide-stale-catalog-providers.mjs"
  write_flag "match-review"
  # shellcheck disable=SC1091
  . "$REPO_DIR/scripts/lib/ensure-prisma-client.sh"
  node "$REPO_DIR/scripts/match-review-profiles.mjs" --all-sites || true
  write_flag "dedupe"
  node "$REPO_DIR/scripts/dedupe-imported-providers.cjs" || true
  write_flag "evergreen-models"
  node "$REPO_DIR/scripts/import-evergreen-models.mjs" >> "${LOG_DIR}/evergreen-models.log" 2>&1 || true
  node "$REPO_DIR/scripts/filter-provider-photos.cjs" --scope=elite >> "${LOG_DIR}/evergreen-models.log" 2>&1 || true
  write_flag "eros-r2-photos"
  node "$REPO_DIR/scripts/populate-r2-from-eros.cjs" --delay-ms="$DELAY_MS"
  write_flag "tryst-r2-photos"
  node "$REPO_DIR/scripts/populate-r2-from-tryst.cjs" --delay-ms="$DELAY_MS"

  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") US verified catalog merge done ==="
} 2>&1 | tee -a "$LOG_FILE" | tee "$RUN_LOG" >/dev/null
RUN_EXIT=${PIPESTATUS[0]}
set -e

TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
if [[ "$RUN_EXIT" -eq 0 ]]; then
  echo "$TS status=ok exit=0 phase=merge" >> "$REPORT_FILE"
  MERGE_STATUS=ok
  mkdir -p /var/log/laboutiquevip/heartbeats
  for hb in eros-photo eros-reconcile catalog-merge; do
    {
      echo "timestamp=$TS"
      echo "status=ok"
      echo "detail=source=$REPORT_FILE phase=merge"
    } >"/var/log/laboutiquevip/heartbeats/${hb}.last"
  done
else
  echo "$TS status=failed exit=$RUN_EXIT phase=merge" >> "$REPORT_FILE"
  MERGE_STATUS=failed
fi

export NODE_PATH="$REPO_DIR/node_modules"
export CATALOG_SCAN_SCHEDULE_NOTE="Next scan 8:00 PM America/Denver; merge at midnight includes Eros + Tryst photos to R2."
node "$REPO_DIR/scripts/lbv-catalog-scan-notify.mjs" \
  --log="$RUN_LOG" \
  --status="$MERGE_STATUS" \
  --exit="$RUN_EXIT" \
  --phase=merge >> "${LOG_DIR}/catalog-merge-notify.log" 2>&1 || true

exit "$RUN_EXIT"
