#!/usr/bin/env bash
# Install Tryst daily import cron (05:30 UTC = 12:30 AM Central).
# Runs after Eros photo update (03:30 UTC) and before reconcile (21:00 UTC).
set -euo pipefail

REPO="${REPO:-/srv/apps/trystlike/repo}"
CAPS="PROFILES_PER_CITY=250 PROFILES_PER_STATE=1250 TRYST_MAX_PROFILES_PER_CITY=250 TRYST_MAX_CITIES_PER_STATE=5 TRYST_MAX_LISTING_PAGES_PER_CITY=25 STRICT_IMPORT_VERIFICATION_GATE=1"
CRON_TRYST="30 5 * * * REPO_DIR=$REPO $CAPS $REPO/scripts/run-tryst-import.sh >> /var/log/laboutiquevip/cron.log 2>&1 # tryst-import-daily"

mkdir -p /var/log/laboutiquevip
chmod +x "$REPO/scripts/run-tryst-import.sh" 2>/dev/null || true
chmod +x "$REPO/scripts/import-tryst.mjs" 2>/dev/null || true
chmod +x "$REPO/scripts/reconcile-tryst.mjs" 2>/dev/null || true

(crontab -l 2>/dev/null \
  | sed '/run-tryst-import\.sh/d' \
  | sed '/tryst-import-daily/d' \
  ; echo "$CRON_TRYST") | crontab -

echo "Installed Tryst daily cron:"
crontab -l | grep -E 'tryst-import'
