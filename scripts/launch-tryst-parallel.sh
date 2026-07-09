#!/bin/bash
cd /srv/apps/trystlike/repo
source ./.env 2>/dev/null
export NODE_PATH="$PWD/node_modules"
export REVIEW_SEARCH_DELAY_MS=400
# Soft gate default — no STRICT_IMPORT_VERIFICATION_GATE

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
LOGDIR=/var/log/laboutiquevip
mkdir -p $LOGDIR

pkill -f import-tryst 2>/dev/null
sleep 1

for i in "${!STATES[@]}"; do
  W=$((i+1))
  nohup node scripts/import-tryst.mjs --states="${STATES[$i]}" > "$LOGDIR/tryst-s-w${W}.log" 2>&1 &
  echo "S${W} PID=$!"
  sleep 1
done
sleep 3
echo "Launched $(ps aux | grep import-tryst | grep -v grep | wc -l) Tryst workers"