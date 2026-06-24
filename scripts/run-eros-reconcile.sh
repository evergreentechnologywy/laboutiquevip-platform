#!/usr/bin/env bash
# Weekly Eros Reconciliation Wrapper Script
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/laboutiquevip-eros-reconcile.lock}"
LOG_FILE="${LOG_DIR}/eros-reconcile.log"
REPORT_FILE="${LOG_DIR}/eros-reconcile-report.log"

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
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") eros reconciliation start ==="
  node "$REPO_DIR/scripts/reconcile-eros.mjs"
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") eros reconciliation done ==="
} 2>&1 | tee -a "$LOG_FILE"

echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") status=ok" >> "$REPORT_FILE"
