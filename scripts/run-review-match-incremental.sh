#!/usr/bin/env bash
# Incremental review matching — runs hourly, processes up to 100 unverified providers.
# Memory-safe: skips when system is under pressure, caps Node heap, auto-throttles on OOM.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/lboutiquevip-review-match-incremental.lock}"
LOG_FILE="${LOG_DIR}/review-match-incremental.log"
REPORT_FILE="${LOG_DIR}/review-match-incremental-report.log"
STATE_FILE="${STATE_FILE:-/var/run/lboutiquevip/review-match-state.json}"
BATCH_LIMIT="${REVIEW_MATCH_INCREMENTAL_LIMIT:-100}"
MIN_FREE_MB="${REVIEW_MATCH_MIN_FREE_MB:-500}"
MAX_HEAP_MB="${NODE_MAX_HEAP_MB:-512}"

mkdir -p "$LOG_DIR" "$(dirname "$STATE_FILE")"
cd "$REPO_DIR"

set -a
# shellcheck disable=SC1091
. ./.env 2>/dev/null || true
set +a
export NODE_PATH="$REPO_DIR/node_modules"

# ── Memory guard: skip if system is under pressure ──
FREE_MB=$(awk '/^MemAvailable:/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo "999999")
if [ "$FREE_MB" -lt "$MIN_FREE_MB" ]; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") skipped low_memory free_mb=$FREE_MB min=$MIN_FREE_MB" >> "$REPORT_FILE"
  exit 0
fi

# ── Auto-throttle: halve batch if last run was killed ──
if [ -f "$STATE_FILE" ]; then
  LAST_EXIT=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('last_exit',''))" 2>/dev/null || echo "")
  if [ "$LAST_EXIT" = "OOM" ]; then
    BATCH_LIMIT=$((BATCH_LIMIT / 2))
    [ "$BATCH_LIMIT" -lt 10 ] && BATCH_LIMIT=10
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") throttled batch=$BATCH_LIMIT (previous OOM)" >> "$REPORT_FILE"
  fi
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

RUN_LOG="$(mktemp)"
cleanup() { rm -f "$RUN_LOG"; }
trap cleanup EXIT

set +e
{
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") review match start limit=$BATCH_LIMIT heap=${MAX_HEAP_MB}MB free=${FREE_MB}MB ==="

  # Cap Node heap to prevent OOM
  NODE_OPTIONS="--max-old-space-size=$MAX_HEAP_MB" \
  REVIEW_SEARCH_DELAY_MS="${REVIEW_SEARCH_DELAY_MS:-500}" \
  node "$REPO_DIR/scripts/match-review-profiles.mjs" \
    --limit="$BATCH_LIMIT" \
    --search-only \
    2>&1

  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") review match done ==="
} 2>&1 | tee -a "$LOG_FILE" | tee "$RUN_LOG" >/dev/null
RUN_EXIT=${PIPESTATUS[0]}
set -e

TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
MATCHED=$(grep -oP '"matched":\s*\K\d+' "$RUN_LOG" 2>/dev/null || echo "0")
SCANNED=$(grep -oP '"scanned":\s*\K\d+' "$RUN_LOG" 2>/dev/null || echo "0")

# Detect OOM kill (exit 137 = SIGKILL)
OOM_STATE="ok"
if [ "$RUN_EXIT" -eq 137 ] || grep -qi "out of memory\|oom\|killed" "$RUN_LOG" 2>/dev/null; then
  OOM_STATE="OOM"
fi

if [ "$RUN_EXIT" -eq 0 ]; then
  echo "$TS status=ok matched=$MATCHED scanned=$SCANNED batch=$BATCH_LIMIT free_mb=$FREE_MB" >> "$REPORT_FILE"
else
  echo "$TS status=failed exit=$RUN_EXIT oom=$OOM_STATE matched=$MATCHED scanned=$SCANNED" >> "$REPORT_FILE"
fi

# Persist state for auto-throttle
python3 -c "
import json
json.dump({'last_exit':'$OOM_STATE','last_run':'$TS','batch':$BATCH_LIMIT}, open('$STATE_FILE','w'))
" 2>/dev/null || true

# Heartbeat
mkdir -p /var/log/laboutiquevip/heartbeats
echo "timestamp=$TS" > "/var/log/laboutiquevip/heartbeats/review-match.last"
echo "status=$([ "$RUN_EXIT" -eq 0 ] && echo ok || echo failed)" >> "/var/log/laboutiquevip/heartbeats/review-match.last"
echo "detail=matched=$MATCHED scanned=$SCANNED batch=$BATCH_LIMIT oom=$OOM_STATE" >> "/var/log/laboutiquevip/heartbeats/review-match.last"

exit "$RUN_EXIT"