#!/bin/bash
# Tryst parallel import launcher — 50 workers, 1 per US state (fast-path cities)
# Guards: memory check, stale cleanup, file lock, timeout
# Why 50/state workers: 4-8 worker shards serially crawl 35-40 cities each via
# Jina (20-30s/page) and exceed the 6h kill-switch. 1 state = 5 cities per
# worker, all states crawl simultaneously -> ~30-45 min total.
# Reference: lbv-catalog-import skill, "Tryst parallel strategy — 50 workers".
set -euo pipefail

REPO="/srv/apps/trystlike/repo"
LOG="/var/log/laboutiquevip"
LOCK="$LOG/tryst-import.lock"
STATE_LOGDIR="$LOG/tryst-states"
mkdir -p "$LOG" "$STATE_LOGDIR"

# ── Guard 1: Single instance ──
exec 200>"$LOCK"
if ! flock -n 200; then
  echo "$(date): Tryst import already running" >> "$LOG/cron-tryst.log"
  exit 0
fi

# ── Guard 2: Memory (50 workers x ~80MB ≈ 4GB) ──
AVAIL=$(awk '/^MemAvailable:/{printf "%.0f",$2/1024}' /proc/meminfo)
if [ "${AVAIL:-0}" -lt 3072 ]; then
  echo "$(date): SKIP — only ${AVAIL}MB free, need 3GB for 50 workers" >> "$LOG/cron-tryst.log"
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
# set -a: plain `source ./.env` does NOT export vars, so node workers were
# missing BRD_PROXY_URL and the Jina-429 fallback silently died (2026-07-22).
set -a
source ./.env 2>/dev/null || true
set +a
# Fallback loader if .env contains lines bash can't parse (CSP garbage).
if [ -z "${BRD_PROXY_URL:-}" ] && [ -x /usr/local/bin/lbv-source-env.sh ]; then
  source /usr/local/bin/lbv-source-env.sh ./.env
fi
export NODE_PATH="$PWD/node_modules"
export REVIEW_SEARCH_DELAY_MS="${REVIEW_SEARCH_DELAY_MS:-400}"
# Strict qualification gate: only providers with a P411 or review-site match
# (TER/PD/TOB) are imported. Unqualified profiles are skipped, not soft-gated.
export STRICT_IMPORT_VERIFICATION_GATE=1
# 256MB heap/worker: 51x512MB OOM-killed the box on 2026-07-22 (took down
# multilogin). 24 workers x 256MB ~= 6GB worst case, fits alongside services.
export NODE_OPTIONS="--max-old-space-size=256"

STATES=(
  alabama alaska arizona arkansas california colorado connecticut delaware
  district-of-columbia florida georgia hawaii idaho illinois indiana iowa
  kansas kentucky louisiana maine maryland massachusetts michigan minnesota
  mississippi missouri montana nebraska nevada new-hampshire new-jersey
  new-mexico new-york north-carolina north-dakota ohio oklahoma oregon
  pennsylvania rhode-island south-carolina south-dakota tennessee texas
  utah vermont virginia washington west-virginia wisconsin wyoming
)

echo "$(date): Starting Tryst import 50-state parallel ($(free -h | awk 'NR==2{print $7}') avail)" >> "$LOG/cron-tryst.log"

# Shard states round-robin across WORKERS batches (comma-separated --states).
# NB: GROUPS is a reserved readonly bash var — must not be used here.
WORKERS=24
STATE_GROUPS=()
i=0
for st in "${STATES[@]}"; do
  idx=$((i % WORKERS))
  if [ -z "${STATE_GROUPS[$idx]:-}" ]; then STATE_GROUPS[$idx]="$st"; else STATE_GROUPS[$idx]="${STATE_GROUPS[$idx]},$st"; fi
  i=$((i + 1))
done

for g in "${STATE_GROUPS[@]}"; do
  first="${g%%,*}"
  nohup node scripts/import-tryst.mjs --states="$g" \
    > "$STATE_LOGDIR/${first}-batch.log" 2>&1 &
  sleep 0.5
done

sleep 5
echo "$(date): Launched $(pgrep -cf 'import-tryst' || echo 0) Tryst workers ($WORKERS batches)" >> "$LOG/cron-tryst.log"

# Wait up to 3 hours — 24 batched workers with proxy fetches need longer
DEADLINE=$((SECONDS + 10800))
while pgrep -f "import-tryst" > /dev/null 2>&1; do
  if [ $SECONDS -gt $DEADLINE ]; then
    echo "$(date): TIMEOUT — killing Tryst" >> "$LOG/cron-tryst.log"
    pkill -f "import-tryst" 2>/dev/null || true
    break
  fi
  sleep 60
done

DONE=$(grep -l 'elapsedSeconds' "$STATE_LOGDIR"/*-batch.log 2>/dev/null | wc -l)
echo "$(date): Tryst import complete (${SECONDS}s, ${DONE}/${WORKERS} batches finished)" >> "$LOG/cron-tryst.log"
