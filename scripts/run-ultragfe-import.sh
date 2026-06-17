#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/laboutiquevip-ultragfe-import.lock}"
DELAY_MS="${DELAY_MS:-100}"
LOG_FILE="${LOG_DIR}/ultragfe-import.log"
REPORT_FILE="${LOG_DIR}/ultragfe-import-report.log"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"

set -a
. ./.env
set +a

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
node ./scripts/import-ultragfe.mjs --delay-ms="$DELAY_MS" 2>&1 \
  | tee -a "$LOG_FILE" \
  | tee "$RUN_LOG" >/dev/null
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
for key in ("states", "cities", "providerCards", "profilesFetched", "created", "updated", "skipped", "errors", "elapsedSeconds"):
    match = re.search(rf"{key}:\s*(\d+)", run_log)
    if match:
        fields[key] = match.group(1)

status = "ok" if run_exit == 0 else "failed"
parts = [f"{ts} status={status} exit={run_exit}"]
for key in ("states", "cities", "providerCards", "profilesFetched", "created", "updated", "skipped", "errors", "elapsedSeconds"):
    if key in fields:
        parts.append(f"{key}={fields[key]}")
print(" ".join(parts))
PY

exit "$RUN_EXIT"
