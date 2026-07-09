#!/bin/bash
# Launch 4 parallel Eros import workers by region
cd /srv/apps/trystlike/repo
source ./.env 2>/dev/null
export NODE_PATH="$PWD/node_modules"
export STRICT_IMPORT_VERIFICATION_GATE="${STRICT_IMPORT_VERIFICATION_GATE:-1}"
export REVIEW_SEARCH_DELAY_MS="${REVIEW_SEARCH_DELAY_MS:-400}"

REGIONS=(
  "california/los_angeles,california/san_francisco,nevada/las_vegas,arizona/phoenix,washington/seattle,oregon/portland"
  "texas/houston,texas/dallas,texas/austin,illinois/chicago,georgia/atlanta,florida/miami"
  "florida/miami,florida/orlando,florida/tampa,carolinas/carolinas,virginia/virginia,tennessee/nashville"
  "new_york/new_york,new_jersey/new_jersey,pennsylvania/philadelphia,massachusetts/boston,washington_dc/washington_dc,maryland/baltimore"
)

LOGDIR=/var/log/laboutiquevip
mkdir -p $LOGDIR
pkill -f import-eros 2>/dev/null
sleep 1

for i in "${!REGIONS[@]}"; do
  W=$((i+1))
  nohup node scripts/import-eros.mjs --from-cities --hubs="${REGIONS[$i]}" --profiles-per-city=250 --max-pages=20 --delay-ms=300 \
    > "$LOGDIR/eros-w${W}.log" 2>&1 &
  echo "Eros W${W} PID=$!"
  sleep 2
done
sleep 3
echo "Launched $(ps aux | grep import-eros | grep -v grep | wc -l) Eros workers"