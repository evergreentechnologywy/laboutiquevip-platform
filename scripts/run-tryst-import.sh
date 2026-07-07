#!/usr/bin/env bash
# Daily Tryst import + reconcile. Skips when Eros jobs hold their flock locks.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/laboutiquevip-tryst-import.lock}"
EROS_LOCKS=(
  /tmp/laboutiquevip-eros-import.lock
  /tmp/laboutiquevip-eros-reconcile.lock
  /tmp/laboutiquevip-eros-photo-update.lock
)
LOG_FILE="${LOG_DIR}/tryst-import.log"
REPORT_FILE="${LOG_DIR}/tryst-import-report.log"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"

set -a
# shellcheck disable=SC1091
. ./.env
set +a
export NODE_PATH="$REPO_DIR/node_modules"
# shellcheck disable=SC1091
. "$REPO_DIR/scripts/lib/lbv-import-defaults.sh"

for eros_lock in "${EROS_LOCKS[@]}"; do
  exec 8>"$eros_lock"
  if ! flock -n 8; then
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") skipped eros_lock_busy path=$eros_lock" >> "$REPORT_FILE"
    exit 0
  fi
  flock -u 8
done

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") skipped tryst_lock_busy" >> "$REPORT_FILE"
  exit 0
fi

RUN_LOG="$(mktemp)"
cleanup() { rm -f "$RUN_LOG"; }
trap cleanup EXIT

set +e
{
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") tryst import start ==="
  node "$REPO_DIR/scripts/import-tryst.mjs"
  node "$REPO_DIR/scripts/reconcile-tryst.mjs"
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") tryst import done ==="
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
for key in ("created", "updated", "skipped", "errors", "Deactivated"):
    match = re.search(rf"{key}:\s*(\d+)", run_log, re.I)
    if match:
        fields[key.lower()] = match.group(1)
status = "ok" if run_exit == 0 else "failed"
parts = [f"{ts} status={status} exit={run_exit}"]
for key in ("created", "updated", "skipped", "errors", "deactivated"):
    if key in fields:
        parts.append(f"{key}={fields[key]}")
print(" ".join(parts))
PY

exit "$RUN_EXIT"
