#!/usr/bin/env bash
# Optional long-running scheduler: run scan → Hermes notify → sleep until next
# 00:30 America/Denver (daily site maintenance window). Prefer install-lbv-catalog-cron
# daily cron unless you need a standalone daemon.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOOP_LOG="${LOG_DIR}/us-verified-catalog-loop.log"
PID_FILE="${PID_FILE:-/var/run/lboutiquevip/catalog-scan-loop.pid}"
SCHEDULE_TZ="${CATALOG_SCAN_TZ:-America/Denver}"
SCHEDULE_HM="${CATALOG_SCAN_LOCAL_TIME:-00:30}"

mkdir -p "$LOG_DIR" /var/run/lboutiquevip
echo $$ > "$PID_FILE"

cd "$REPO_DIR"
# shellcheck disable=SC1091
. "$REPO_DIR/scripts/lib/lbv-import-defaults.sh"

seconds_until_next_window() {
  python3 - "$SCHEDULE_TZ" "$SCHEDULE_HM" <<'PY'
import datetime as dt
import sys
from zoneinfo import ZoneInfo

tz = ZoneInfo(sys.argv[1])
hour, minute = (int(x) for x in sys.argv[2].split(":", 1))
now = dt.datetime.now(tz)
target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
if now >= target:
    target += dt.timedelta(days=1)
print(int((target - now).total_seconds()))
PY
}

echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") catalog scan loop start tz=${SCHEDULE_TZ} local=${SCHEDULE_HM}" >> "$LOOP_LOG"

while true; do
  set +e
  bash "$REPO_DIR/scripts/run-us-verified-catalog-scan.sh"
  scan_exit=$?
  set -e

  if [[ "$scan_exit" -eq 2 ]]; then
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") scan lock busy; retry in 10m" >> "$LOOP_LOG"
    sleep 600
    continue
  fi

  wait_sec="$(seconds_until_next_window)"
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") scan finished exit=$scan_exit sleeping ${wait_sec}s until next ${SCHEDULE_HM} ${SCHEDULE_TZ}" >> "$LOOP_LOG"
  sleep "$wait_sec"
done
