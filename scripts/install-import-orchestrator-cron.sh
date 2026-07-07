#!/usr/bin/env bash
# Install import cron jobs on VPS:
#   - Midnight catalog window (05:00 UTC = midnight Central): import-orchestrator.sh
#   - Dev trigger poller (every minute): lbv-import-orchestrator.sh
# Eros photo (03:30 UTC) + reconcile (21:00 UTC): install-eros-only-cron.sh
set -euo pipefail

REPO="${REPO:-/srv/apps/trystlike/repo}"
CRON_MIDNIGHT="0 5 * * * REPO_DIR=$REPO IMPORT_FLAG_PATH=/var/run/lboutiquevip/import-in-progress $REPO/scripts/import-orchestrator.sh >> /var/log/laboutiquevip/cron.log 2>&1 # import-orchestrator-midnight"
CRON_POLL="* * * * * REPO_DIR=$REPO LBV_TRIGGER_DIR=/var/run/lboutiquevip $REPO/scripts/lbv-import-orchestrator.sh >> /var/log/laboutiquevip/orchestrator.log 2>&1 # lbv-import-orchestrator"

mkdir -p /var/run/lboutiquevip /var/log/laboutiquevip
chmod +x "$REPO/scripts/lbv-import-orchestrator.sh" 2>/dev/null || true
chmod +x "$REPO/scripts/import-orchestrator.sh" 2>/dev/null || true

(crontab -l 2>/dev/null \
  | sed '/lbv-import-orchestrator/d' \
  | sed '/import-orchestrator\.sh/d' \
  | sed '/import-orchestrator-midnight/d' \
  | sed '/run-tryst-import\.sh/d' \
  | sed '/tryst-import-daily/d' \
  ; echo "$CRON_MIDNIGHT"; echo "$CRON_POLL") | crontab -

echo "Installed import crons:"
crontab -l | grep -E 'import-orchestrator|lbv-import'
