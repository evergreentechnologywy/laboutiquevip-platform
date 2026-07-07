#!/usr/bin/env bash
# Master installer: Eros daily jobs, Tryst daily, import orchestrator, failsafe, weekly verified scan.
set -euo pipefail

REPO="${REPO:-/srv/apps/trystlike/repo}"
CAPS="PROFILES_PER_CITY=250 PROFILES_PER_STATE=1250 EROS_MAX_PAGES=15000 TRYST_MAX_PROFILES_PER_CITY=250 TRYST_MAX_CITIES_PER_STATE=5 TRYST_MAX_LISTING_PAGES_PER_CITY=25 STRICT_IMPORT_VERIFICATION_GATE=1"

mkdir -p /var/log/laboutiquevip /var/run/lboutiquevip
chmod +x "$REPO/scripts/"*.sh 2>/dev/null || true

bash "$REPO/scripts/install-eros-only-cron.sh"
bash "$REPO/scripts/install-tryst-cron.sh"
bash "$REPO/scripts/install-import-orchestrator-cron.sh"

CRON_FAILSAFE="*/15 * * * * REPO_DIR=$REPO $REPO/scripts/lbv-import-failsafe.sh >> /var/log/laboutiquevip/cron.log 2>&1 # lbv-import-failsafe"
CRON_WEEKLY_SCAN="0 2 * * 0 REPO_DIR=$REPO $CAPS $REPO/scripts/run-us-verified-catalog-scan.sh >> /var/log/laboutiquevip/cron.log 2>&1 # lbv-us-verified-scan-weekly"

(crontab -l 2>/dev/null \
  | sed '/lbv-import-failsafe/d' \
  | sed '/lbv-us-verified-scan-weekly/d' \
  | sed '/run-us-verified-catalog-scan\.sh/d' \
  ; echo "$CRON_FAILSAFE"; echo "$CRON_WEEKLY_SCAN") | crontab -

echo "=== LBV catalog cron installed (250/city, 5 cities/state) ==="
crontab -l | grep -E 'eros-|tryst-|import-orchestrator|lbv-import|lbv-us-verified|failsafe' || true
