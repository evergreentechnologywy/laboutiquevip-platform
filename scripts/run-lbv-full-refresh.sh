#!/usr/bin/env bash
# Full LBV catalog refresh: Eros-only imports, photo recovery, Evergreen models, location normalize
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$LOG_DIR/full-refresh-$TS.log"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"

set -a
. ./.env
set +a

exec > >(tee -a "$LOG") 2>&1

echo "=== LBV FULL REFRESH START $TS (eros-only) ==="

echo "--- deactivate legacy ultragfe listings ---"
node ./scripts/deactivate-ultragfe-providers.cjs || true

echo "--- eros full reconcile (all sitemap cities) ---"
CITIES_PER_DAY=0 DELAY_MS=350 bash ./scripts/run-eros-reconcile.sh || echo "eros reconcile exited non-zero"

echo "--- eros full import (city-seeded crawl) ---"
DELAY_MS=350 node ./scripts/import-eros.mjs --delay-ms=350 --max-pages=2500 --from-cities || echo "eros import exited non-zero"

echo "--- zero-photo recovery (imported catalog) ---"
node ./scripts/recover-zero-photo-providers.cjs --delay-ms=450 --limit=0 || true

echo "--- normalize locations ---"
node ./scripts/normalize-provider-locations.cjs || true

echo "--- Evergreen model sites (elite tier) ---"
node ./scripts/import-evergreen-models.mjs || true

echo "--- agency location backfill ---"
node ./scripts/fix-agency-locations.cjs || true

echo "--- filter dead photos (elite) ---"
node ./scripts/filter-provider-photos.cjs --scope=elite || true

echo "--- restart backend ---"
systemctl restart laboutiquevip-backend
sleep 3
systemctl is-active laboutiquevip-backend

echo "=== LBV FULL REFRESH COMPLETE $(date -u +%Y%m%dT%H%M%SZ) ==="
