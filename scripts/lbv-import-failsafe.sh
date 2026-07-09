#!/usr/bin/env bash
# Failsafe for LBV catalog import jobs: stale locks, stuck maintenance flag, missed-run alert.
# Install via scripts/install-lbv-catalog-cron.sh (every 15 minutes).
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
REPORT_FILE="${LOG_DIR}/import-failsafe-report.log"
STALE_LOCK_HOURS="${STALE_LOCK_HOURS:-6}"
STALE_FLAG_HOURS="${STALE_FLAG_HOURS:-4}"

mkdir -p "$LOG_DIR"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if [[ -x "$REPO_DIR/scripts/ensure-lbv-scripts-executable.sh" ]]; then
  REPO_DIR="$REPO_DIR" bash "$REPO_DIR/scripts/ensure-lbv-scripts-executable.sh" >/dev/null 2>&1 || true
elif [[ -f "$REPO_DIR/scripts/lbv-import-failsafe.sh" && ! -x "$REPO_DIR/scripts/lbv-import-failsafe.sh" ]]; then
  chmod +x "$REPO_DIR"/scripts/*.sh 2>/dev/null || true
  echo "$TS repaired_script_permissions repo=$REPO_DIR" >> "$REPORT_FILE"
fi

LOCKS=(
  /tmp/laboutiquevip-eros-import.lock
  /tmp/laboutiquevip-eros-reconcile.lock
  /tmp/laboutiquevip-eros-photo-update.lock
  /tmp/laboutiquevip-tryst-import.lock
  /tmp/laboutiquevip-us-verified-scan.lock
  /tmp/laboutiquevip-import-orchestrator.lock
)
FLAG_PATH="${IMPORT_FLAG_PATH:-/var/run/lboutiquevip/import-in-progress}"

cleared=0
for lock in "${LOCKS[@]}"; do
  [[ -f "$lock" ]] || continue
  age_hours="$(python3 - "$lock" <<'PY'
import os, sys, time
path = sys.argv[1]
try:
    age = time.time() - os.path.getmtime(path)
    print(int(age // 3600))
except OSError:
    print(-1)
PY
)"
  if [[ "$age_hours" -ge "$STALE_LOCK_HOURS" ]]; then
    rm -f "$lock"
    echo "$TS cleared_stale_lock path=$lock age_hours=$age_hours" >> "$REPORT_FILE"
    cleared=$((cleared + 1))
  fi
done

if [[ -f "$FLAG_PATH" ]]; then
  flag_age_hours="$(python3 - "$FLAG_PATH" <<'PY'
import json, sys, datetime
path = sys.argv[1]
try:
    data = json.load(open(path, encoding="utf-8"))
    started = data.get("startedAt", "")
    if not started:
        print(999)
    else:
        dt = datetime.datetime.fromisoformat(started.replace("Z", "+00:00"))
        age = datetime.datetime.now(datetime.timezone.utc) - dt
        print(int(age.total_seconds() // 3600))
except Exception:
    print(999)
PY
)"
  if [[ "$flag_age_hours" -ge "$STALE_FLAG_HOURS" ]]; then
    rm -f "$FLAG_PATH"
    echo "$TS cleared_stale_import_flag age_hours=$flag_age_hours" >> "$REPORT_FILE"
    cleared=$((cleared + 1))
  fi
fi

# Warn if catalog merge/scan reports have no recent ok (primary Eros pipeline since 2026-07-07)
MERGE_STALE_HOURS="${MERGE_STALE_HOURS:-30}"
SCAN_STALE_HOURS="${SCAN_STALE_HOURS:-30}"
for report in \
  "$LOG_DIR/us-verified-catalog-merge-report.log" \
  "$LOG_DIR/us-verified-catalog-scan-report.log" \
  "$LOG_DIR/tryst-import-report.log" \
  "$LOG_DIR/eros-photo-update-report.log"; do
  [[ -f "$report" ]] || continue
  last_ok="$(grep -E 'status=ok' "$report" 2>/dev/null | tail -1 || true)"
  if [[ -z "$last_ok" ]]; then
    echo "$TS warn=no_ok_line report=$(basename "$report")" >> "$REPORT_FILE"
    continue
  fi
  last_ts="$(printf '%s\n' "$last_ok" | grep -Eo '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' | head -1 || true)"
  if [[ -n "$last_ts" ]]; then
    age_hours="$(python3 - "$last_ts" "$MERGE_STALE_HOURS" <<'PY'
import datetime, sys
ts = sys.argv[1]
max_h = int(sys.argv[2])
dt = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
age = datetime.datetime.now(datetime.timezone.utc) - dt
print(int(age.total_seconds() // 3600))
PY
)"
    if [[ "$report" == *merge* && "$age_hours" -ge "$MERGE_STALE_HOURS" ]]; then
      echo "$TS warn=stale_merge_report age_hours=$age_hours" >> "$REPORT_FILE"
    elif [[ "$report" == *scan* && "$age_hours" -ge "$SCAN_STALE_HOURS" ]]; then
      echo "$TS warn=stale_scan_report age_hours=$age_hours" >> "$REPORT_FILE"
    fi
  fi
done

if [[ "$cleared" -eq 0 ]]; then
  echo "$TS ok stale_lock_hours=$STALE_LOCK_HOURS" >> "$REPORT_FILE"
fi
