#!/usr/bin/env bash
# Install Eros-only daily import, photo refresh, and sharded reconciliation cron.
set -euo pipefail

REPO="${REPO:-/srv/apps/trystlike/repo}"

# Daily photo refresh + capped incremental import (03:30 UTC = 10:30 PM Central prev day)
CRON_PHOTO="30 3 * * * REPO_DIR=$REPO DELAY_MS=350 $REPO/scripts/run-eros-photo-update.sh >> /var/log/laboutiquevip/cron.log 2>&1 # eros-photo-update-daily"

# Daily full reconcile (21:00 UTC = 4:00 PM Central; catalog scan, import deltas, per-hub deactivation)
CRON_RECONCILE="0 21 * * * REPO_DIR=$REPO CITIES_PER_DAY=0 $REPO/scripts/run-eros-reconcile.sh >> /var/log/laboutiquevip/cron.log 2>&1 # eros-reconcile-daily-4pm-central"

mkdir -p /var/log/laboutiquevip
chmod +x "$REPO/scripts/run-eros-photo-update.sh" 2>/dev/null || true
chmod +x "$REPO/scripts/run-eros-reconcile.sh" 2>/dev/null || true

(crontab -l 2>/dev/null \
  | sed '/run-ultragfe-import\.sh/d' \
  | sed '/ultragfe-weekly-import/d' \
  | sed '/run-eros-import\.sh/d' \
  | sed '/eros-weekly-import/d' \
  | sed '/run-eros-photo-update\.sh/d' \
  | sed '/eros-photo-update/d' \
  | sed '/run-eros-reconcile\.sh/d' \
  | sed '/eros-reconcile/d' \
  ; echo "$CRON_PHOTO"; echo "$CRON_RECONCILE") | crontab -

echo "Installed Eros daily cron schedule:"
crontab -l | grep -E 'eros-'
