#!/usr/bin/env bash
# Master installer: daily 8 PM verified scrape + midnight import (P411/review match + Eros/Tryst R2).
set -euo pipefail

REPO="${REPO:-/srv/apps/trystlike/repo}"
CAPS="PROFILES_PER_CITY=250 PROFILES_PER_STATE=1250 EROS_MAX_PAGES=15000 TRYST_MAX_PROFILES_PER_CITY=250 TRYST_MAX_CITIES_PER_STATE=5 TRYST_MAX_LISTING_PAGES_PER_CITY=25 STRICT_IMPORT_VERIFICATION_GATE=1 REVIEW_MATCH_LIMIT=0 CATALOG_SCAN_INTERVAL_SEC=86400"
# 8:00 PM Mountain — crawl + verify into staging cache (no production merge)
CRON_SCAN="0 20 * * * TZ=America/Denver REPO_DIR=$REPO $CAPS bash $REPO/scripts/run-us-verified-catalog-scan.sh >> /var/log/laboutiquevip/cron.log 2>&1 # lbv-us-verified-scan-8pm"
# Midnight Mountain — apply cache to production during site maintenance window
CRON_MERGE="0 0 * * * TZ=America/Denver REPO_DIR=$REPO IMPORT_FLAG_PATH=/var/run/lboutiquevip/import-in-progress $CAPS bash $REPO/scripts/run-us-verified-catalog-merge.sh >> /var/log/laboutiquevip/cron.log 2>&1 # lbv-us-verified-merge-midnight"

mkdir -p /var/log/laboutiquevip /var/run/lboutiquevip
bash "$REPO/scripts/ensure-lbv-scripts-executable.sh"
chmod +x "$REPO/scripts/run-us-verified-catalog-scan.sh" 2>/dev/null || true
chmod +x "$REPO/scripts/run-us-verified-catalog-merge.sh" 2>/dev/null || true

bash "$REPO/scripts/install-eros-only-cron.sh"

CRON_FAILSAFE="*/15 * * * * REPO_DIR=$REPO bash $REPO/scripts/lbv-import-failsafe.sh >> /var/log/laboutiquevip/cron.log 2>&1 # lbv-import-failsafe"

(crontab -l 2>/dev/null \
  | sed '/lbv-import-failsafe/d' \
  | sed '/lbv-us-verified-scan-weekly/d' \
  | sed '/lbv-us-verified-scan-loop/d' \
  | sed '/lbv-us-verified-scan-4h/d' \
  | sed '/lbv-us-verified-scan-daily/d' \
  | sed '/lbv-us-verified-scan-8pm/d' \
  | sed '/lbv-us-verified-merge-midnight/d' \
  | sed '/run-us-verified-catalog-loop\.sh/d' \
  | sed '/run-us-verified-catalog-scan\.sh/d' \
  | sed '/run-us-verified-catalog-merge\.sh/d' \
  | sed '/run-tryst-import\.sh/d' \
  | sed '/tryst-import-daily/d' \
  | sed '/import-orchestrator\.sh/d' \
  | sed '/import-orchestrator-midnight/d' \
  ; echo "$CRON_FAILSAFE"; echo "$CRON_SCAN"; echo "$CRON_MERGE") | crontab -

# Trigger poller only (midnight merge is lbv-us-verified-merge-midnight above)
CRON_POLL="* * * * * REPO_DIR=$REPO LBV_TRIGGER_DIR=/var/run/lboutiquevip bash $REPO/scripts/lbv-import-orchestrator.sh >> /var/log/laboutiquevip/orchestrator.log 2>&1 # lbv-import-orchestrator"
(crontab -l 2>/dev/null | sed '/lbv-import-orchestrator/d'; echo "$CRON_POLL") | crontab -

echo "=== LBV catalog cron: scan 8 PM, merge midnight (America/Denver) ==="
crontab -l | grep -E 'eros-|lbv-import|lbv-us-verified|failsafe' || true
