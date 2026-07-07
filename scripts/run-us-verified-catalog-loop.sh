#!/usr/bin/env bash
# Continuous US verified catalog scan: run → Hermes notify → sleep 4h → repeat.
# Started by @reboot cron or manually. Uses flock in run-us-verified-catalog-scan.sh.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
INTERVAL_SEC="${CATALOG_SCAN_INTERVAL_SEC:-14400}"
LOOP_LOG="${LOG_DIR}/us-verified-catalog-loop.log"
PID_FILE="${PID_FILE:-/var/run/lboutiquevip/catalog-scan-loop.pid}"

mkdir -p "$LOG_DIR" /var/run/lboutiquevip
echo $$ > "$PID_FILE"

cd "$REPO_DIR"
# shellcheck disable=SC1091
. "$REPO_DIR/scripts/lib/lbv-import-defaults.sh"

echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") catalog scan loop start interval=${INTERVAL_SEC}s" >> "$LOOP_LOG"

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

  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") scan finished exit=$scan_exit sleeping ${INTERVAL_SEC}s" >> "$LOOP_LOG"
  sleep "$INTERVAL_SEC"
done
