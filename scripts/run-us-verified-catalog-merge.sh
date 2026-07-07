#!/usr/bin/env bash
# Midnight production merge: apply staged 8 PM scan cache to DB, Eros hub reconcile,
# Tryst reconcile, review match, dedupe, and Eros photo → R2 refresh.
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

set -a
# shellcheck disable=SC1091
. ./.env
set +a
export NODE_PATH="$REPO_DIR/node_modules"
# shellcheck disable=SC1091
. "$REPO_DIR/scripts/lib/lbv-import-defaults.sh"

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

  node "$REPO_DIR/scripts/merge-catalog-scan-cache.mjs"
  write_flag "reconcile-eros"
  node "$REPO_DIR/scripts/reconcile-eros.mjs" \
    --profiles-per-city="$PROFILES_PER_CITY" \
    --profiles-per-state="$PROFILES_PER_STATE"
  write_flag "reconcile-tryst"
  node "$REPO_DIR/scripts/reconcile-tryst.mjs"
  write_flag "match-review"
  node "$REPO_DIR/scripts/match-review-profiles.mjs" || true
  write_flag "dedupe"
  node "$REPO_DIR/scripts/dedupe-imported-providers.cjs" || true
  write_flag "eros-r2-photos"
  node "$REPO_DIR/scripts/populate-r2-from-eros.cjs" --delay-ms="$DELAY_MS"

  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") US verified catalog merge done ==="
} 2>&1 | tee -a "$LOG_FILE" | tee "$RUN_LOG" >/dev/null
RUN_EXIT=${PIPESTATUS[0]}
set -e

TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
if [[ "$RUN_EXIT" -eq 0 ]]; then
  echo "$TS status=ok exit=0 phase=merge" >> "$REPORT_FILE"
  MERGE_STATUS=ok
else
  echo "$TS status=failed exit=$RUN_EXIT phase=merge" >> "$REPORT_FILE"
  MERGE_STATUS=failed
fi

export NODE_PATH="$REPO_DIR/node_modules"
export CATALOG_SCAN_SCHEDULE_NOTE="Next scan 8:00 PM America/Denver; merge at midnight."
node "$REPO_DIR/scripts/lbv-catalog-scan-notify.mjs" \
  --log="$RUN_LOG" \
  --status="$MERGE_STATUS" \
  --exit="$RUN_EXIT" \
  --phase=merge >> "${LOG_DIR}/catalog-merge-notify.log" 2>&1 || true

exit "$RUN_EXIT"
