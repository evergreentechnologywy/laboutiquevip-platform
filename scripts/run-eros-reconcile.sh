#!/usr/bin/env bash
# Daily sharded Eros reconciliation (full catalog over ~7 days). No ultragfe.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/laboutiquevip-eros-reconcile.lock}"
LOG_FILE="${LOG_DIR}/eros-reconcile.log"
REPORT_FILE="${LOG_DIR}/eros-reconcile-report.log"

# Default: full catalog every run (eros-only source). Optional shard via CITIES_PER_DAY>0.
CITIES_PER_DAY="${CITIES_PER_DAY:-0}"
RECONCILE_SHARDS="${RECONCILE_SHARDS:-7}"
DAY_OF_YEAR="$(date -u +%j)"
SHARD_INDEX=$(( (10#${DAY_OF_YEAR} - 1) % RECONCILE_SHARDS ))
CITY_OFFSET="${CITY_OFFSET:-$(( SHARD_INDEX * CITIES_PER_DAY ))}"
if [ "$CITIES_PER_DAY" -eq 0 ]; then
  CITY_OFFSET=0
  SHARD_INDEX="all"
fi

mkdir -p "$LOG_DIR"
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
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") skipped lock_busy" >> "$REPORT_FILE"
  exit 0
fi

RUN_LOG="$(mktemp)"
cleanup() {
  rm -f "$RUN_LOG"
}
trap cleanup EXIT

set +e
{
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") eros reconciliation start shard=${SHARD_INDEX} offset=${CITY_OFFSET} limit=${CITIES_PER_DAY} ==="
  RECONCILE_ARGS=()
  if [ "$CITIES_PER_DAY" -gt 0 ]; then
    RECONCILE_ARGS+=(--limit-cities="$CITIES_PER_DAY" --city-offset="$CITY_OFFSET")
  fi
  node "$REPO_DIR/scripts/reconcile-eros.mjs" \
    "${RECONCILE_ARGS[@]}" \
    --profiles-per-city="$PROFILES_PER_CITY" \
    --profiles-per-state="$PROFILES_PER_STATE"
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") eros reconciliation done ==="
} 2>&1 | tee -a "$LOG_FILE" | tee "$RUN_LOG" >/dev/null
RUN_EXIT=${PIPESTATUS[0]}
set -e

python3 - "$RUN_LOG" "$RUN_EXIT" "$SHARD_INDEX" "$CITY_OFFSET" "$CITIES_PER_DAY" <<'PY' >> "$REPORT_FILE"
import pathlib
import re
import sys
from datetime import datetime, timezone

run_log = pathlib.Path(sys.argv[1]).read_text(errors="ignore")
run_exit = int(sys.argv[2])
shard, offset, limit = sys.argv[3:6]
ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

fields = {}
for key, pattern in [
    ("imported", r"Imported:\s*(\d+)"),
    ("deactivated", r"Deactivated:\s*(\d+)"),
    ("errors", r"Errors:\s*(\d+)"),
    ("elapsed", r"Elapsed:\s*(\d+)s"),
]:
    match = re.search(pattern, run_log)
    if match:
        fields[key] = match.group(1)

status = "ok" if run_exit == 0 else "failed"
parts = [
    f"{ts} status={status} exit={run_exit}",
    f"shard={shard}",
    f"offset={offset}",
    f"limit={limit}",
]
for key in ("imported", "deactivated", "errors", "elapsed"):
    if key in fields:
        parts.append(f"{key}={fields[key]}")
print(" ".join(parts))
PY

exit "$RUN_EXIT"
