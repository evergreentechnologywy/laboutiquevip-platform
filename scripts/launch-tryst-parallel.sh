#!/bin/bash
# Tryst parallel import launcher — 24 state batches run in time-windowed groups
# with per-window timeouts and resume state so a timed-out run continues from
# unfinished batches on the next cron invocation.
#
# Why windows: the original 24-way parallel launch completed only 9-16/24
# batches in the 3h wall-clock budget because workers competed for memory and
# proxy bandwidth. Running 4 batches at a time lets each worker finish reliably
# while the total budget (6h) is large enough for >=22/24 batches in one run.
# Any batches still unfinished are persisted to /var/run/lboutiquevip/tryst-batch-state.json
# and resumed on the next launch.
set -euo pipefail

REPO="/srv/apps/trystlike/repo"
LOG="/var/log/laboutiquevip"
LOCK="$LOG/tryst-import.lock"
STATE_LOGDIR="$LOG/tryst-states"
STATE_FILE="/var/run/lboutiquevip/tryst-batch-state.json"
mkdir -p "$LOG" "$STATE_LOGDIR" "$(dirname "$STATE_FILE")"

DRY_RUN=false
for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then DRY_RUN=true; break; fi
done

# ── Guard 1: Single instance ──
exec 200>"$LOCK"
if ! flock -n 200; then
  echo "$(date): Tryst import already running" >> "$LOG/cron-tryst.log"
  exit 0
fi

# ── Guard 2: Memory (4 workers x ~256MB ≈ 1GB, plus headroom) ──
AVAIL=$(awk '/^MemAvailable:/{printf "%.0f",$2/1024}' /proc/meminfo)
if [ "${AVAIL:-0}" -lt 1536 ]; then
  echo "$(date): SKIP — only ${AVAIL}MB free, need 1.5GB for 4 window workers" >> "$LOG/cron-tryst.log"
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
set -a
source ./.env 2>/dev/null || true
set +a
if [ -z "${BRD_PROXY_URL:-}" ] && [ -x /usr/local/bin/lbv-source-env.sh ]; then
  source /usr/local/bin/lbv-source-env.sh ./.env
fi
export NODE_PATH="$PWD/node_modules"
export REVIEW_SEARCH_DELAY_MS="${REVIEW_SEARCH_DELAY_MS:-400}"
export STRICT_IMPORT_VERIFICATION_GATE="${STRICT_IMPORT_VERIFICATION_GATE:-1}"
export NODE_OPTIONS="--max-old-space-size=256"

# ── Window tuning ──
WINDOW_SIZE="${TRYST_WINDOW_SIZE:-4}"          # batches to launch concurrently
WINDOW_TIMEOUT_SEC="${TRYST_WINDOW_TIMEOUT_SEC:-3600}"  # per-window wall-clock budget
TOTAL_WINDOWS="${TRYST_TOTAL_WINDOWS:-6}"      # 6 windows x 4 batches = 24 total batches

STATES=(
  alabama alaska arizona arkansas california colorado connecticut delaware
  district-of-columbia florida georgia hawaii idaho illinois indiana iowa
  kansas kentucky louisiana maine maryland massachusetts michigan minnesota
  mississippi missouri montana nebraska nevada new-hampshire new-jersey
  new-mexico new-york north-carolina north-dakota ohio oklahoma oregon
  pennsylvania rhode-island south-carolina south-dakota tennessee texas
  utah vermont virginia washington west-virginia wisconsin wyoming
)

# Shard states round-robin across 24 batches (comma-separated --states).
WORKERS=24
STATE_GROUPS=()
i=0
for st in "${STATES[@]}"; do
  idx=$((i % WORKERS))
  if [ -z "${STATE_GROUPS[$idx]:-}" ]; then STATE_GROUPS[$idx]="$st"; else STATE_GROUPS[$idx]="${STATE_GROUPS[$idx]},$st"; fi
  i=$((i + 1))
done

# Each batch is identified by its first state slug (also used for log filename).
function batch_id() {
  local g="$1"
  echo "${g%%,*}"
}

# ── Resume state ──
function load_completed_batches() {
  if [ -f "$STATE_FILE" ]; then
    python3 -c "import sys,json; d=json.load(open('$STATE_FILE')); print(' '.join(d.get('completed',[])))" 2>/dev/null || true
  fi
}

COMPLETED=($(load_completed_batches))

# If every batch was already completed, treat this as a fresh run.
if [ "${#COMPLETED[@]}" -ge "${#STATE_GROUPS[@]}" ]; then
  COMPLETED=()
  rm -f "$STATE_FILE"
fi

# Build list of remaining batches as indices.
REMAINING_INDICES=()
for idx in "${!STATE_GROUPS[@]}"; do
  bid=$(batch_id "${STATE_GROUPS[$idx]}")
  skip=false
  for c in "${COMPLETED[@]}"; do
    if [ "$c" = "$bid" ]; then skip=true; break; fi
  done
  if [ "$skip" = false ]; then REMAINING_INDICES+=("$idx"); fi
done

# ── Dry-run plan ──
if [ "$DRY_RUN" = true ]; then
  echo "DRY-RUN: Tryst parallel launch plan"
  echo "  window size: $WINDOW_SIZE"
  echo "  window timeout: ${WINDOW_TIMEOUT_SEC}s"
  echo "  total windows: $TOTAL_WINDOWS"
  echo "  total batches: ${#STATE_GROUPS[@]}"
  echo "  already completed: ${#COMPLETED[@]} (${COMPLETED[*]})"
  echo "  remaining batches: ${#REMAINING_INDICES[@]}"
  echo "  windows:"
  window_num=0
  for (( start=0; start<${#REMAINING_INDICES[@]}; start+=WINDOW_SIZE )); do
    window_num=$((window_num + 1))
    end=$((start + WINDOW_SIZE))
    if [ "$end" -gt "${#REMAINING_INDICES[@]}" ]; then end=${#REMAINING_INDICES[@]}; fi
    bids=()
    for (( j=start; j<end; j++ )); do
      bids+=("$(batch_id "${STATE_GROUPS[${REMAINING_INDICES[$j]}]}")")
    done
    echo "    window $window_num: ${bids[*]}"
  done
  exit 0
fi

echo "$(date): Starting Tryst import ${#REMAINING_INDICES[@]}/${#STATE_GROUPS[@]} batches " \
  "window=${WINDOW_SIZE}x${WINDOW_TIMEOUT_SEC}s ($(free -h | awk 'NR==2{print $7}' ) avail)" \
  >> "$LOG/cron-tryst.log"

# ── Helper: wait for up to N seconds for PIDs, return 0 if all exited ──
function wait_for_pids() {
  local deadline=$((SECONDS + WINDOW_TIMEOUT_SEC))
  local still_alive=1
  while [ "$still_alive" -ne 0 ]; do
    still_alive=0
    for pid in "$@"; do
      if kill -0 "$pid" 2>/dev/null; then still_alive=1; break; fi
    done
    if [ "$still_alive" -eq 0 ]; then return 0; fi
    if [ $SECONDS -gt $deadline ]; then return 1; fi
    sleep 10
  done
  return 0
}

function save_state() {
  python3 -c "import json; json.dump({'completed':$(python3 -c 'import sys; print(repr(sys.argv[1:]))' \"${COMPLETED[@]}\"), 'lastRun':'$(date -Iseconds)'}, open('$STATE_FILE','w'), indent=2)" || true
}

# ── Run remaining batches in windows ──
WINDOW_NUM=0
for (( start=0; start<${#REMAINING_INDICES[@]}; start+=WINDOW_SIZE )); do
  WINDOW_NUM=$((WINDOW_NUM + 1))
  end=$((start + WINDOW_SIZE))
  if [ "$end" -gt "${#REMAINING_INDICES[@]}" ]; then end=${#REMAINING_INDICES[@]}; fi

  pids=()
  launched_bids=()
  for (( j=start; j<end; j++ )); do
    idx="${REMAINING_INDICES[$j]}"
    g="${STATE_GROUPS[$idx]}"
    first="$(batch_id "$g")"
    launched_bids+=("$first")
    nohup node scripts/import-tryst.mjs --states="$g" \
      > "$STATE_LOGDIR/${first}-batch.log" 2>&1 &
    pids+=("$!")
    sleep 0.5
  done

  echo "$(date): Launched window $WINDOW_NUM: ${launched_bids[*]}" >> "$LOG/cron-tryst.log"

  if ! wait_for_pids "${pids[@]}"; then
    echo "$(date): Window $WINDOW_NUM timed out after ${WINDOW_TIMEOUT_SEC}s — killing remaining workers" >> "$LOG/cron-tryst.log"
    pkill -f "import-tryst" 2>/dev/null || true
    sleep 2
  fi

  # Mark batches that wrote a completion marker as finished.
  for bid in "${launched_bids[@]}"; do
    if grep -q 'elapsedSeconds' "$STATE_LOGDIR/${bid}-batch.log" 2>/dev/null; then
      already=false
      for c in "${COMPLETED[@]}"; do
        if [ "$c" = "$bid" ]; then already=true; break; fi
      done
      if [ "$already" = false ]; then COMPLETED+=("$bid"); fi
    fi
  done

  save_state
  echo "$(date): Window $WINDOW_NUM complete — ${#COMPLETED[@]}/${#STATE_GROUPS[@]} total batches finished" >> "$LOG/cron-tryst.log"
done

DONE=${#COMPLETED[@]}
if [ "$DONE" -ge "${#STATE_GROUPS[@]}" ]; then
  rm -f "$STATE_FILE"
  echo "$(date): Tryst import fully complete (${SECONDS}s, ${DONE}/${#STATE_GROUPS[@]} batches)" >> "$LOG/cron-tryst.log"
else
  echo "$(date): Tryst import windowed run ended (${SECONDS}s, ${DONE}/${#STATE_GROUPS[@]} batches finished)" >> "$LOG/cron-tryst.log"
fi
