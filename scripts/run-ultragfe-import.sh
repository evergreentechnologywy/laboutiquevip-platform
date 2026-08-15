#!/usr/bin/env bash
# RETIRED (2026-08-15): UltraGFE scrape disabled. Deactivate any leftover rows, then exit.
set -euo pipefail
REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
cd "$REPO_DIR"
set -a
# shellcheck disable=SC1091
. ./.env
set +a
node scripts/deactivate-ultragfe-providers.cjs || true
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") ultragfe_import_retired" >>"${LOG_DIR:-/var/log/laboutiquevip}/ultragfe-import-report.log" 2>/dev/null || true
echo "[run-ultragfe-import] RETIRED — UltraGFE scrape disabled (eros+tryst only via catalog API)."
exit 2
