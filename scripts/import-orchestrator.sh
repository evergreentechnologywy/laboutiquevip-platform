#!/usr/bin/env bash
# Safe midnight import window for laboutiquevip.net catalog sources.
# Sets maintenance flag, runs configured steps under flock, clears flag on exit.
#
# Schedule: 05:00 UTC daily (= midnight Central during CDT).
# Does NOT kill running import-eros jobs — skips steps when locks are busy.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
CONFIG_FILE="${CONFIG_FILE:-$REPO_DIR/scripts/import-orchestrator.config.json}"
FLAG_PATH="${IMPORT_FLAG_PATH:-/var/run/lboutiquevip/import-in-progress}"
ORCH_LOCK="${ORCH_LOCK:-/tmp/laboutiquevip-import-orchestrator.lock}"
LOG_FILE="${LOG_DIR}/import-orchestrator.log"
REPORT_FILE="${LOG_DIR}/import-orchestrator-report.log"
MAX_WINDOW_MINUTES="${IMPORT_ORCHESTRATOR_MAX_MINUTES:-60}"

mkdir -p "$LOG_DIR" "$(dirname "$FLAG_PATH")"
cd "$REPO_DIR"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") error=config_missing path=$CONFIG_FILE" >> "$REPORT_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a
export NODE_PATH="$REPO_DIR/node_modules"
# shellcheck disable=SC1091
. "$REPO_DIR/scripts/lib/lbv-import-defaults.sh"

exec 9>"$ORCH_LOCK"
if ! flock -n 9; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") skipped orchestrator_lock_busy" >> "$REPORT_FILE"
  exit 0
fi

write_flag() {
  local phase="$1"
  python3 - "$FLAG_PATH" "$phase" <<'PY'
import json, sys, datetime
path, phase = sys.argv[1], sys.argv[2]
payload = {
    "startedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "source": "import-orchestrator",
    "phase": phase,
}
with open(path, "w", encoding="utf-8") as fh:
    json.dump(payload, fh)
    fh.write("\n")
PY
}

clear_flag() {
  rm -f "$FLAG_PATH"
}

window_deadline_epoch() {
  python3 - "$MAX_WINDOW_MINUTES" <<'PY'
import datetime, sys
minutes = int(sys.argv[1])
print(int((datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=minutes)).timestamp()))
PY
}

DEADLINE="$(window_deadline_epoch)"
OVERALL_EXIT=0
START_TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo "=== $START_TS import-orchestrator start ===" | tee -a "$LOG_FILE"

trap 'clear_flag; echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") import-orchestrator flag cleared ===" >> "$LOG_FILE"' EXIT

write_flag "starting"

run_step() {
  local step_id="$1"
  local runner="$2"
  local step_type="${3:-script}"

  if [[ "$(date +%s)" -ge "$DEADLINE" ]]; then
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") window_exhausted skip=$step_id" | tee -a "$LOG_FILE" >> "$REPORT_FILE"
    return 0
  fi

  write_flag "$step_id"
  echo "--- step $step_id start ---" | tee -a "$LOG_FILE"

  set +e
  if [[ "$step_type" == "command" ]]; then
    # shellcheck disable=SC2086
    eval "$runner" 2>&1 | tee -a "$LOG_FILE"
    local step_exit=${PIPESTATUS[0]}
  else
    bash "$REPO_DIR/$runner" 2>&1 | tee -a "$LOG_FILE"
    local step_exit=${PIPESTATUS[0]}
  fi
  set -e

  echo "--- step $step_id exit=$step_exit ---" | tee -a "$LOG_FILE"
  if [[ "$step_exit" -ne 0 ]]; then
    OVERALL_EXIT="$step_exit"
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") step_failed id=$step_id exit=$step_exit" >> "$REPORT_FILE"
  fi
}

ENABLED_STEPS="$(python3 - "$CONFIG_FILE" <<'PY'
import json, sys
cfg = json.load(open(sys.argv[1], encoding="utf-8"))
for step in cfg.get("steps", []):
    if step.get("enabled"):
        print(f"{step['id']}\t{step.get('runner','')}\t{step.get('type','script')}")
for src in cfg.get("futureSources", []):
    if src.get("enabled"):
        module = src.get("module", "")
        print(f"{src['id']}\tnode {module}\tcommand")
PY
)"

while IFS=$'\t' read -r step_id runner step_type; do
  [[ -z "$step_id" ]] && continue
  run_step "$step_id" "$runner" "$step_type"
done <<< "$ENABLED_STEPS"

END_TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
STATUS="ok"
[[ "$OVERALL_EXIT" -ne 0 ]] && STATUS="failed"
echo "$END_TS status=$STATUS exit=$OVERALL_EXIT window_minutes=$MAX_WINDOW_MINUTES" >> "$REPORT_FILE"
echo "=== $END_TS import-orchestrator done exit=$OVERALL_EXIT ===" | tee -a "$LOG_FILE"

exit "$OVERALL_EXIT"
