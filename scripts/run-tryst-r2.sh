#!/usr/bin/env bash
# Tryst photo refresh → R2. Skips when Eros jobs hold flock locks (do not kill imports).
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/laboutiquevip-tryst-r2.lock}"
EROS_LOCKS=(
  /tmp/laboutiquevip-eros-import.lock
  /tmp/laboutiquevip-eros-reconcile.lock
  /tmp/laboutiquevip-eros-photo-update.lock
  /var/lock/laboutiquevip-photo-update.lock
)
DELAY_MS="${TRYST_R2_DELAY_MS:-400}"
BATCH_LIMIT="${TRYST_R2_BATCH_LIMIT:-100}"
LOG_FILE="${LOG_DIR}/tryst-r2.log"
REPORT_FILE="${LOG_DIR}/tryst-r2-report.log"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"

set -a
# shellcheck disable=SC1091
. ./.env
set +a
export NODE_PATH="$REPO_DIR/node_modules"

for eros_lock in "${EROS_LOCKS[@]}"; do
  [[ -f "$eros_lock" ]] || continue
  exec 8>"$eros_lock"
  if ! flock -n 8; then
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") skipped eros_lock_busy path=$eros_lock" >> "$REPORT_FILE"
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
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") tryst r2 start limit=$BATCH_LIMIT delay=$DELAY_MS ==="
  node "$REPO_DIR/scripts/populate-r2-from-tryst.cjs" \
    --delay-ms="$DELAY_MS" \
    --limit="$BATCH_LIMIT"
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") tryst r2 done ==="
} 2>&1 | tee -a "$LOG_FILE" | tee "$RUN_LOG" >/dev/null
RUN_EXIT=${PIPESTATUS[0]}
set -e

python3 - "$RUN_LOG" "$RUN_EXIT" <<'PY' >> "$REPORT_FILE"
import pathlib
import re
import sys
from datetime import datetime, timezone

run_log = pathlib.Path(sys.argv[1]).read_text(errors="ignore")
run_exit = int(sys.argv[2])
ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
fields = {}
for key in ("updated", "skipped", "failed", "tryst_r2_targets", "processing"):
    match = re.search(rf"{key}=(\d+)", run_log, re.I)
    if match:
        fields[key] = match.group(1)
status = "ok" if run_exit == 0 else "failed"
parts = [f"{ts} status={status} exit={run_exit}"]
for key in ("tryst_r2_targets", "processing", "updated", "skipped", "failed"):
    if key in fields:
        parts.append(f"{key}={fields[key]}")
print(" ".join(parts))
PY

exit "$RUN_EXIT"
