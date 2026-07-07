#!/usr/bin/env bash
# Tryst photo → R2 backfill. Skips when Eros/Tryst import locks are held.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/laboutiquevip-tryst-r2.lock}"
BUSY_LOCKS=(
  /tmp/laboutiquevip-eros-import.lock
  /tmp/laboutiquevip-eros-reconcile.lock
  /tmp/laboutiquevip-eros-photo-update.lock
  /tmp/laboutiquevip-tryst-import.lock
)
LOG_FILE="${LOG_DIR}/tryst-r2.log"
REPORT_FILE="${LOG_DIR}/tryst-r2-report.log"
LIMIT="${TRYST_R2_LIMIT:-50}"
DELAY_MS="${TRYST_R2_DELAY_MS:-400}"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"

set -a
# shellcheck disable=SC1091
. ./.env
set +a
export NODE_PATH="$REPO_DIR/node_modules"

for busy in "${BUSY_LOCKS[@]}"; do
  exec 8>"$busy"
  if ! flock -n 8; then
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") skipped busy_lock path=$busy" >> "$REPORT_FILE"
    exit 0
  fi
  flock -u 8
done

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") skipped tryst_r2_lock_busy" >> "$REPORT_FILE"
  exit 0
fi

RUN_LOG="$(mktemp)"
cleanup() { rm -f "$RUN_LOG"; }
trap cleanup EXIT

set +e
{
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") tryst r2 start limit=$LIMIT ==="
  node "$REPO_DIR/scripts/populate-r2-from-tryst.cjs" --limit="$LIMIT" --delay-ms="$DELAY_MS"
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") tryst r2 done ==="
} 2>&1 | tee -a "$LOG_FILE" | tee "$RUN_LOG" >/dev/null
RUN_EXIT=${PIPESTATUS[0]}
set -e

echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") status=$([ "$RUN_EXIT" -eq 0 ] && echo ok || echo failed) exit=$RUN_EXIT" >> "$REPORT_FILE"
exit "$RUN_EXIT"
