#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/laboutiquevip-eros-import.lock}"
DELAY_MS="${DELAY_MS:-120}"
LOG_FILE="${LOG_DIR}/eros-import.log"
REPORT_FILE="${LOG_DIR}/eros-import-report.log"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"

set -a
. ./.env
set +a
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
node ./scripts/import-eros.mjs \
  --delay-ms="$DELAY_MS" \
  --max-pages="$EROS_MAX_PAGES" \
  --from-cities \
  --profiles-per-city="$PROFILES_PER_CITY" \
  --profiles-per-state="$PROFILES_PER_STATE" 2>&1 \
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
for key in ("featuredCards", "matchedModels", "updated", "created", "skipped", "errors", "elapsedSeconds"):
    match = re.search(rf"{key}:\s*(\d+)", run_log)
    if match:
        fields[key] = match.group(1)

status = "ok" if run_exit == 0 else "failed"
parts = [f"{ts} status={status} exit={run_exit}"]
for key in ("featuredCards", "matchedModels", "updated", "created", "skipped", "errors", "elapsedSeconds"):
    if key in fields:
        parts.append(f"{key}={fields[key]}")
print(" ".join(parts))
PY

exit "$RUN_EXIT"
