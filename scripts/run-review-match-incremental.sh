#!/usr/bin/env bash
# Incremental review matching — runs every 2 hours, processes 50 unverified providers.
# Safe to run alongside midnight merge; uses flock to prevent overlap.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/lboutiquevip-review-match-incremental.lock}"
LOG_FILE="${LOG_DIR}/review-match-incremental.log"
REPORT_FILE="${LOG_DIR}/review-match-incremental-report.log"
BATCH_LIMIT="${REVIEW_MATCH_INCREMENTAL_LIMIT:-50}"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"

set -a
# shellcheck disable=SC1091
. ./.env 2>/dev/null || true
set +a
export NODE_PATH="$REPO_DIR/node_modules"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

RUN_LOG="$(mktemp)"
cleanup() { rm -f "$RUN_LOG"; }
trap cleanup EXIT

set +e
{
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") review match incremental start limit=$BATCH_LIMIT ==="

  # Only match providers without any verification badge
  node "$REPO_DIR/scripts/match-review-profiles.mjs" \
    --limit="$BATCH_LIMIT" \
    --search-only \
    2>&1

  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") review match incremental done ==="
} 2>&1 | tee -a "$LOG_FILE" | tee "$RUN_LOG" >/dev/null
RUN_EXIT=${PIPESTATUS[0]}
set -e

TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
MATCHED=$(grep -oP '"matched":\s*\K\d+' "$RUN_LOG" 2>/dev/null || echo "0")
SCANNED=$(grep -oP '"scanned":\s*\K\d+' "$RUN_LOG" 2>/dev/null || echo "0")

if [[ "$RUN_EXIT" -eq 0 ]]; then
  echo "$TS status=ok matched=$MATCHED scanned=$SCANNED batch=$BATCH_LIMIT" >> "$REPORT_FILE"
  # Heartbeat for automation failover
  echo "timestamp=$TS" > "/var/log/laboutiquevip/heartbeats/review-match.last"
  echo "status=ok" >> "/var/log/laboutiquevip/heartbeats/review-match.last"
  echo "detail=matched=$MATCHED scanned=$SCANNED batch=$BATCH_LIMIT" >> "/var/log/laboutiquevip/heartbeats/review-match.last"
else
  echo "$TS status=failed exit=$RUN_EXIT" >> "$REPORT_FILE"
fi

exit "$RUN_EXIT"