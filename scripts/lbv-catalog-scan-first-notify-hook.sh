#!/usr/bin/env bash
# Wait for an in-flight catalog scan (started before Hermes notify was deployed),
# send first-completion Telegram. Daily cron runs the next cycle at 00:30 America/Denver.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOG_FILE="${LOG_DIR}/us-verified-catalog-scan.log"
MARKER_FILE="${MARKER_FILE:-/var/run/lboutiquevip/first-scan-notify-hook.done}"

if [[ -f "$MARKER_FILE" ]]; then
  echo "first-scan hook already ran"
  exit 0
fi

echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") waiting for in-flight catalog scan..."
while pgrep -f '[/]run-us-verified-catalog-scan.sh' >/dev/null 2>&1; do
  sleep 120
done

sleep 15
TMP="$(mktemp)"
tail -8000 "$LOG_FILE" > "$TMP" 2>/dev/null || true

cd "$REPO_DIR"
set -a
# shellcheck disable=SC1091
. ./.env
set +a
export NODE_PATH="$REPO_DIR/node_modules"

node "$REPO_DIR/scripts/lbv-catalog-scan-notify.mjs" \
  --log="$TMP" \
  --status=ok \
  --exit=0 >> "${LOG_DIR}/catalog-scan-notify.log" 2>&1 || true
rm -f "$TMP"

touch "$MARKER_FILE"
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") first-scan Hermes notify done; daily cron handles next runs (00:30 America/Denver)" >> "${LOG_DIR}/first-scan-notify-hook.log"
