#!/usr/bin/env bash
# Manual Eros photo refresh → R2 only (no live import). Scheduled runs use midnight merge.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/lboutiquevip-eros-photo-update.lock}"
DELAY_MS="${DELAY_MS:-350}"
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
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") eros photo update (R2 only) start ==="
  node "$REPO_DIR/scripts/populate-r2-from-eros.cjs" --delay-ms="$DELAY_MS"
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") eros photo update done ==="
} 2>&1 | tee -a "$LOG_FILE"

echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") status=ok" >> "$REPORT_FILE"
