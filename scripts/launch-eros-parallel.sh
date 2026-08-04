#!/bin/bash
# Eros parallel import launcher — hardened for daily cron
# Guards: memory check, stale process cleanup, file lock, error recovery
set -euo pipefail

REPO="/srv/apps/trystlike/repo"
LOG="/var/log/laboutiquevip"
LOCK="$LOG/eros-import.lock"
mkdir -p "$LOG"

# ── Guard 1: Single instance ──
exec 200>"$LOCK"
if ! flock -n 200; then
  echo "$(date): Eros import already running (lock held)" >> "$LOG/cron-eros.log"
  exit 0
fi

# ── Guard 2: Memory check ──
AVAIL=$(awk '/^MemAvailable:/{printf "%.0f",$2/1024}' /proc/meminfo)
if [ "${AVAIL:-0}" -lt 512 ]; then
  echo "$(date): SKIP — only ${AVAIL}MB RAM available" >> "$LOG/cron-eros.log"
  exit 0
fi

# ── Guard 3: Stale cleanup ──
if pgrep -f "import-eros" > /dev/null; then
  echo "$(date): Cleaning stale Eros imports" >> "$LOG/cron-eros.log"
  pkill -f "import-eros" 2>/dev/null || true
  sleep 3
fi

# ── Env ──
cd "$REPO"
set -a
source ./.env 2>/dev/null || true
set +a
export NODE_PATH="$PWD/node_modules"
export STRICT_IMPORT_VERIFICATION_GATE="${STRICT_IMPORT_VERIFICATION_GATE:-1}"
export REVIEW_SEARCH_DELAY_MS="${REVIEW_SEARCH_DELAY_MS:-400}"
export NODE_OPTIONS="--max-old-space-size=1024"

# ── Launch 4 regional workers ──
REGIONS=(
  "california/los_angeles,california/san_francisco,nevada/las_vegas,arizona/phoenix,washington/seattle,oregon/portland"
  "texas/houston,texas/dallas,texas/austin,illinois/chicago,georgia/atlanta,florida/miami"
  "florida/orlando,florida/tampa,carolinas/carolinas,virginia/virginia,tennessee/nashville,colorado/denver"
  "new_york/new_york,new_jersey/new_jersey,pennsylvania/philadelphia,massachusetts/boston,washington_dc/washington_dc,maryland/baltimore"
)

echo "$(date): Starting Eros import ($(free -h | awk 'NR==2{print $7}') avail)" >> "$LOG/cron-eros.log"

for i in "${!REGIONS[@]}"; do
  W=$((i+1))
  nohup node scripts/import-eros.mjs \
    --from-cities --hubs="${REGIONS[$i]}" \
    --profiles-per-city=250 --max-pages=40 --delay-ms=250 \
    > "$LOG/eros-w${W}.log" 2>&1 &
  sleep 2
done

sleep 5
COUNT=$(pgrep -cf "import-eros" || echo 0)
echo "$(date): Launched $COUNT Eros workers" >> "$LOG/cron-eros.log"

# Wait for completion (max 90 min)
DEADLINE=$((SECONDS + 5400))
while pgrep -f "import-eros" > /dev/null 2>&1; do
  if [ $SECONDS -gt $DEADLINE ]; then
    echo "$(date): TIMEOUT — killing Eros workers" >> "$LOG/cron-eros.log"
    pkill -f "import-eros" 2>/dev/null || true
    break
  fi
  sleep 60
done

echo "$(date): Eros import complete (${SECONDS}s)" >> "$LOG/cron-eros.log"