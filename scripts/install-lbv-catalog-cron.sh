#!/usr/bin/env bash
# Master installer: Eros daily jobs, Tryst daily, import orchestrator, failsafe,
# daily verified catalog scan (12:30 AM Mountain — after Eros/Tryst midnight maintenance).
set -euo pipefail

REPO="${REPO:-/srv/apps/trystlike/repo}"
CAPS="PROFILES_PER_CITY=250 PROFILES_PER_STATE=1250 EROS_MAX_PAGES=15000 TRYST_MAX_PROFILES_PER_CITY=250 TRYST_MAX_CITIES_PER_STATE=5 TRYST_MAX_LISTING_PAGES_PER_CITY=25 STRICT_IMPORT_VERIFICATION_GATE=1 CATALOG_SCAN_INTERVAL_SEC=86400"
# 00:30 America/Denver ≈ 30 min after site midnight maintenance window
CRON_DAILY_SCAN="30 0 * * * TZ=America/Denver REPO_DIR=$REPO $CAPS $REPO/scripts/run-us-verified-catalog-scan.sh >> /var/log/laboutiquevip/cron.log 2>&1 # lbv-us-verified-scan-daily"

mkdir -p /var/log/laboutiquevip /var/run/lboutiquevip
chmod +x "$REPO/scripts/"*.sh 2>/dev/null || true

bash "$REPO/scripts/install-eros-only-cron.sh"
bash "$REPO/scripts/install-tryst-cron.sh"
bash "$REPO/scripts/install-import-orchestrator-cron.sh"

CRON_FAILSAFE="*/15 * * * * REPO_DIR=$REPO $REPO/scripts/lbv-import-failsafe.sh >> /var/log/laboutiquevip/cron.log 2>&1 # lbv-import-failsafe"

(crontab -l 2>/dev/null \
  | sed '/lbv-import-failsafe/d' \
  | sed '/lbv-us-verified-scan-weekly/d' \
  | sed '/lbv-us-verified-scan-loop/d' \
  | sed '/lbv-us-verified-scan-4h/d' \
  | sed '/lbv-us-verified-scan-daily/d' \
  | sed '/run-us-verified-catalog-loop\.sh/d' \
  | sed '/run-us-verified-catalog-scan\.sh/d' \
  ; echo "$CRON_FAILSAFE"; echo "$CRON_DAILY_SCAN") | crontab -

echo "=== LBV catalog cron installed (250/city, 5 cities/state, daily scan 00:30 America/Denver) ==="
crontab -l | grep -E 'eros-|tryst-|import-orchestrator|lbv-import|lbv-us-verified|failsafe' || true
