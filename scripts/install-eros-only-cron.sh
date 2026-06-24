#!/usr/bin/env bash
# Install Eros-only import and reconciliation cron.
set -euo pipefail

REPO="${REPO:-/srv/apps/trystlike/repo}"
CRON_MON="30 3 * * 1 REPO_DIR=$REPO $REPO/scripts/run-eros-reconcile.sh >> /var/log/laboutiquevip/cron.log 2>&1 # eros-reconcile-monday"
CRON_WED="30 3 * * 3 REPO_DIR=$REPO DELAY_MS=350 $REPO/scripts/run-eros-photo-update.sh >> /var/log/laboutiquevip/cron.log 2>&1 # eros-photo-update-wednesday"
CRON_SUN="30 3 * * 0 REPO_DIR=$REPO DELAY_MS=350 $REPO/scripts/run-eros-photo-update.sh >> /var/log/laboutiquevip/cron.log 2>&1 # eros-photo-update-sunday"

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
  ; echo "$CRON_MON"; echo "$CRON_WED"; echo "$CRON_SUN") | crontab -

echo "Installed Eros cron schedule:"
crontab -l | grep -E 'eros-'
