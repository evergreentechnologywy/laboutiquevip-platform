#!/usr/bin/env bash
# Poll /var/run/lboutiquevip/trigger-*.request files and run import jobs.
# Installed via scripts/install-import-orchestrator-cron.sh (* * * * *).
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
TRIGGER_DIR="${LBV_TRIGGER_DIR:-/var/run/lboutiquevip}"
LOG_DIR="${LOG_DIR:-/var/log/lboutiquevip}"
LOG_FILE="${LOG_DIR}/orchestrator.log"
IMPORT_FLAG="${IMPORT_FLAG_PATH:-/var/run/lboutiquevip/import-in-progress}"

mkdir -p "$TRIGGER_DIR" "$LOG_DIR"

log() {
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") $*" | tee -a "$LOG_FILE"
}

write_status() {
  local source="$1"
  local payload="$2"
  printf '%s\n' "$payload" > "${TRIGGER_DIR}/status-${source}.json"
}

set_import_flag() {
  local source="$1"
  local phase="$2"
  printf '{"startedAt":"%s","source":"%s","phase":"%s"}\n' \
    "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$source" "$phase" > "$IMPORT_FLAG"
}

clear_import_flag() {
  rm -f "$IMPORT_FLAG"
}

mark_trigger() {
  local file="$1"
  local state="$2"
  python3 - "$file" "$state" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
data = json.loads(path.read_text())
data["state"] = sys.argv[2]
data["updatedAt"] = __import__("datetime").datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
path.write_text(json.dumps(data, indent=2) + "\n")
PY
}

run_eros() {
  local mode="$1"
  cd "$REPO_DIR"
  set -a && . ./.env && set +a
  # shellcheck disable=SC1091
  . "$REPO_DIR/scripts/lib/lbv-import-defaults.sh"
  if [[ "$mode" == "full" ]]; then
    bash ./scripts/run-lbv-full-refresh.sh
  else
    bash ./scripts/run-eros-import.sh
  fi
}

run_tryst() {
  local mode="$1"
  cd "$REPO_DIR"
  set -a && . ./.env && set +a
  # shellcheck disable=SC1091
  . "$REPO_DIR/scripts/lib/lbv-import-defaults.sh"
  if [[ "$mode" == "full" ]]; then
    bash ./scripts/run-tryst-import.sh
  else
    node ./scripts/import-tryst.mjs --pilot-only
    node ./scripts/reconcile-tryst.mjs --pilot-only
  fi
}

run_evergreen() {
  cd "$REPO_DIR"
  set -a && . ./.env && set +a
  export NODE_PATH="$REPO_DIR/node_modules"
  node ./scripts/import-evergreen-models.mjs >> "${LOG_DIR}/evergreen-models.log" 2>&1
  node ./scripts/filter-provider-photos.cjs --scope=elite >> "${LOG_DIR}/evergreen-models.log" 2>&1 || true
}

run_orchestrator() {
  local mode="$1"
  cd "$REPO_DIR"
  set -a && . ./.env && set +a
  if [[ "$mode" == "full" ]]; then
    bash ./scripts/run-lbv-full-refresh.sh
  else
    bash ./scripts/run-eros-reconcile.sh || true
    bash ./scripts/run-tryst-import.sh || true
  fi
}

process_trigger() {
  local source="$1"
  local trigger_file="${TRIGGER_DIR}/trigger-${source}.request"
  [[ -f "$trigger_file" ]] || return 0

  local state mode
  state="$(python3 -c "import json; print(json.load(open('$trigger_file')).get('state',''))")"
  [[ "$state" == "queued" ]] || return 0

  mode="$(python3 -c "import json; print(json.load(open('$trigger_file')).get('mode','pilot'))")"
  log "processing source=${source} mode=${mode}"

  mark_trigger "$trigger_file" "running"
  set_import_flag "$source" "${source}-import"
  write_status "$source" "{\"source\":\"$source\",\"state\":\"running\",\"startedAt\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",\"mode\":\"$mode\"}"

  local exit_code=0
  set +e
  case "$source" in
    eros) run_eros "$mode" ;;
    tryst) run_tryst "$mode" ;;
    orchestrator) run_orchestrator "$mode" ;;
    evergreen) run_evergreen ;;
    *) log "unknown source $source"; exit_code=1 ;;
  esac
  exit_code=$?
  set -e

  local finished_at
  finished_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  if [[ "$exit_code" -eq 0 ]]; then
    mark_trigger "$trigger_file" "completed"
    write_status "$source" "{\"source\":\"$source\",\"state\":\"completed\",\"finishedAt\":\"$finished_at\",\"mode\":\"$mode\"}"
    log "completed source=${source} mode=${mode}"
  else
    mark_trigger "$trigger_file" "failed"
    write_status "$source" "{\"source\":\"$source\",\"state\":\"failed\",\"finishedAt\":\"$finished_at\",\"mode\":\"$mode\",\"exitCode\":$exit_code}"
    log "failed source=${source} mode=${mode} exit=${exit_code}"
  fi

  clear_import_flag
}

for source in eros tryst orchestrator evergreen; do
  process_trigger "$source" || true
done
