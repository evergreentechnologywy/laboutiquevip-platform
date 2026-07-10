#!/bin/bash
# Tryst parallel import launcher — hardened for weekly cron
# Guards: memory check, stale cleanup, file lock, timeout
set -euo pipefail

REPO="/srv/apps/trystlike/repo"
LOG="/var/log/laboutiquevip"
LOCK="$LOG/tryst-import.lock"
mkdir -p "$LOG"

# ── Guard 1: Single instance ──
exec 200>"$LOCK"
if ! flock -n 200; then
  echo "$(date): Tryst import already running" >> "$LOG/cron-tryst.log"
  exit 0
fi

# ── Guard 2: Memory ──
AVAIL=$(awk '/^MemAvailable:/{printf "%.0f",$2/1024}' /proc/meminfo)
if [ "${AVAIL:-0}" -lt 1024 ]; then
  echo "$(date): SKIP — only ${AVAIL}MB free, need 1GB" >> "$LOG/cron-tryst.log"
  exit 0
fi

# ── Guard 3: Stale cleanup ──
if pgrep -f "import-tryst" > /dev/null; then
  echo "$(date): Cleaning stale Tryst imports" >> "$LOG/cron-tryst.log"
  pkill -f "import-tryst" 2>/dev/null || true
  sleep 3
fi

# ── Env ──
cd "$REPO"
source ./.env 2>/dev/null
export NODE_PATH="$PWD/node_modules"
export REVIEW_SEARCH_DELAY_MS="${REVIEW_SEARCH_DELAY_MS:-400}"
# No TRYST_MAX_LISTING_PAGES_PER_CITY cap — auto-stop after 2 empty pages, 50 max
export NODE_OPTIONS="--max-old-space-size=1024"

STATES=(
  "alabama,alaska,arizona,arkansas,california,colorado"
  "connecticut,delaware,district-of-columbia,florida,georgia,hawaii"
  "idaho,illinois,indiana,iowa,kansas,kentucky,louisiana"
  "maine,maryland,massachusetts,michigan,minnesota,mississippi,missouri"
  "montana,nebraska,nevada,new-hampshire,new-jersey,new-mexico"
  "new-york,north-carolina,north-dakota,ohio,oklahoma,oregon"
  "pennsylvania,rhode-island,south-carolina,south-dakota,tennessee,texas"
  "utah,vermont,virginia,washington,west-virginia,wisconsin,wyoming"
)

echo "$(date): Starting Tryst import ($(free -h | awk 'NR==2{print $7}') avail)" >> "$LOG/cron-tryst.log"

for i in "${!STATES[@]}"; do
  W=$((i+1))
  nohup node scripts/import-tryst.mjs --states="${STATES[$i]}" \
    > "$LOG/tryst-w${W}.log" 2>&1 &
  sleep 2
done

sleep 5
echo "$(date): Launched $(pgrep -cf 'import-tryst' || echo 0) Tryst workers" >> "$LOG/cron-tryst.log"

# Wait up to 4 hours
DEADLINE=$((SECONDS + 14400))
while pgrep -f "import-tryst" > /dev/null 2>&1; do
  if [ $SECONDS -gt $DEADLINE ]; then
    echo "$(date): TIMEOUT — killing Tryst" >> "$LOG/cron-tryst.log"
    pkill -f "import-tryst" 2>/dev/null || true
    break
  fi
  sleep 120
done

echo "$(date): Tryst import complete (${SECONDS}s)" >> "$LOG/cron-tryst.log"