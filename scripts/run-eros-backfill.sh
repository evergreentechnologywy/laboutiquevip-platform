#!/bin/bash
# One-shot Eros backfill: reactivate + R2 photos + hub import with raised caps
set -euo pipefail
REPO_DIR="${REPO_DIR:-/srv/apps/trystlike/repo}"
LOG_DIR="${LOG_DIR:-/var/log/laboutiquevip}"
LOCK_FILE="${LOCK_FILE:-/tmp/laboutiquevip-eros-backfill.lock}"
DELAY_MS="${DELAY_MS:-350}"

mkdir -p "$LOG_DIR"
cd "$REPO_DIR"
set -a; . ./.env; set +a
export NODE_PATH="$REPO_DIR/node_modules"
# shellcheck disable=SC1091
. "$REPO_DIR/scripts/lib/lbv-import-defaults.sh"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") backfill skipped — lock busy (import may be running)"
  exit 0
fi

LOG="$LOG_DIR/eros-backfill-$(date -u +%Y%m%dT%H%M%SZ).log"
{
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") eros backfill start ==="
  echo "--- reactivate wrongly deactivated ---"
  node "$REPO_DIR/scripts/reactivate-eros-profiles.mjs"
  echo "--- populate R2 (batch) ---"
  node "$REPO_DIR/scripts/populate-r2-from-eros.cjs" --delay-ms="$DELAY_MS" --limit=500 || true
  echo "--- hub import (raised caps, skip if import-eros already running) ---"
  if pgrep -f 'import-eros.mjs' >/dev/null; then
    echo "import-eros already running — skipping duplicate import"
  else
    node "$REPO_DIR/scripts/import-eros.mjs" \
      --delay-ms="$DELAY_MS" \
      --max-pages="$EROS_MAX_PAGES" \
      --from-cities \
      --profiles-per-city="$PROFILES_PER_CITY" \
      --profiles-per-state="$PROFILES_PER_STATE"
  fi
  echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") eros backfill done ==="
} 2>&1 | tee "$LOG"
