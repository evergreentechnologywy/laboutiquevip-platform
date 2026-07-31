#!/bin/bash
# Tryst parallel import launcher — single-state batches in time-windowed groups
# with per-window timeouts, a total wall-clock budget, and per-state resume so
# unfinished states continue on the next cron invocation.
#
# Why single-state batches (2026-07-31 rewrite):
# The previous 24-batch x 2-state grouping finished 0-1/24 batches/day: every
# window hit its 3600s cap because a 2-state batch at ~100 profiles/hour cannot
# finish in 1h, and killing the worker discarded ALL in-flight progress for both
# states. Single-state batches give: (a) small states finish in minutes,
# (b) per-state resume granularity — a slow big state never starves the rest,
# (c) completion detection against the source-verified marker
# "Tryst import complete:" (import-tryst.mjs:629).
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

# ── Guard 2: Memory (6 workers x 256MB = 1.5GB, plus headroom) ──
AVAIL=$(awk '/^MemAvailable:/{printf "%.0f",$2/1024}' /proc/meminfo)
if [ "${AVAIL:-0}" -lt 2048 ]; then
  echo "$(date): SKIP — only ${AVAIL}MB free, need 2GB for 6 window workers" >> "$LOG/cron-tryst.log"
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
WINDOW_SIZE="${TRYST_WINDOW_SIZE:-6}"                 # single-state workers per window
WINDOW_TIMEOUT_SEC="${TRYST_WINDOW_TIMEOUT_SEC:-2700}" # per-window wall-clock cap (45 min)
MAX_WALL_SEC="${TRYST_MAX_WALL_SEC:-32400}"            # total run budget (9h: 09:00→18:00 UTC)

STATES=(
  alabama alaska arizona arkansas california colorado connecticut delaware
  district-of-columbia florida georgia hawaii idaho illinois indiana iowa
  kansas kentucky louisiana maine maryland massachusetts michigan minnesota
  mississippi missouri montana nebraska nevada new-hampshire new-jersey
  new-mexico new-york north-carolina north-dakota ohio oklahoma oregon
  pennsylvania rhode-island south-carolina south-dakota tennessee texas
  utah vermont virginia washington west-virginia wisconsin wyoming
)

# One batch per state; batch id == state slug (log filename + resume key).
# Known-big states run first so they get the full day's fresh workers and,
# if they exceed their window, maximum remaining resume days.
BIG_STATES=(california texas florida new-york illinois washington nevada arizona)
ORDERED_STATES=()
for st in "${BIG_STATES[@]}"; do ORDERED_STATES+=("$st"); done
for st in "${STATES[@]}"; do
  big=false
  for b in "${BIG_STATES[@]}"; do if [ "$st" = "$b" ]; then big=true; break; fi; done
  if [ "$big" = false ]; then ORDERED_STATES+=("$st"); fi
done

# ── Resume state ──
function load_completed_batches() {
  if [ -f "$STATE_FILE" ]; then
    python3 -c "import sys,json; d=json.load(open('$STATE_FILE')); print(' '.join(d.get('completed',[])))" 2>/dev/null || true
  fi
}

COMPLETED=($(load_completed_batches))

# If every state was already completed, treat this as a fresh run.
if [ "${#COMPLETED[@]}" -ge "${#ORDERED_STATES[@]}" ]; then
  COMPLETED=()
  rm -f "$STATE_FILE"
fi

# Build list of remaining states (big states first, resume order preserved).
REMAINING=()
for st in "${ORDERED_STATES[@]}"; do
  skip=false
  for c in "${COMPLETED[@]:-}"; do
    if [ "$c" = "$st" ]; then skip=true; break; fi
  done
  if [ "$skip" = false ]; then REMAINING+=("$st"); fi
done

# ── Dry-run plan ──
if [ "$DRY_RUN" = true ]; then
  echo "DRY-RUN: Tryst parallel launch plan (single-state batches)"
  echo "  window size: $WINDOW_SIZE workers"
  echo "  window timeout: ${WINDOW_TIMEOUT_SEC}s"
  echo "  max wall clock: ${MAX_WALL_SEC}s"
  echo "  total states: ${#ORDERED_STATES[@]}"
  echo "  already completed: ${#COMPLETED[@]} (${COMPLETED[*]:-none})"
  echo "  remaining states: ${#REMAINING[@]}"
  echo "  windows:"
  window_num=0
  for (( start=0; start<${#REMAINING[@]}; start+=WINDOW_SIZE )); do
    window_num=$((window_num + 1))
    end=$((start + WINDOW_SIZE))
    if [ "$end" -gt "${#REMAINING[@]}" ]; then end=${#REMAINING[@]}; fi
    bids=()
    for (( j=start; j<end; j++ )); do bids+=("${REMAINING[$j]}"); done
    echo "    window $window_num: ${bids[*]}"
  done
  exit 0
fi

echo "$(date): Starting Tryst import ${#REMAINING[@]}/${#ORDERED_STATES[@]} states " \
  "window=${WINDOW_SIZE}x${WINDOW_TIMEOUT_SEC}s budget=${MAX_WALL_SEC}s ($(free -h | awk 'NR==2{print $7}') avail)" \
  >> "$LOG/cron-tryst.log"

# ── Helper: wait up to WINDOW_TIMEOUT_SEC for PIDs; 0 if all exited ──
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
  COMPLETED_JSON="$(printf '%s\n' "${COMPLETED[@]:-}" | python3 -c "import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))")" \
    python3 -c "import os,json,datetime; json.dump({'completed':json.loads(os.environ['COMPLETED_JSON']), 'lastRun':datetime.datetime.now(datetime.timezone.utc).isoformat()}, open('$STATE_FILE','w'), indent=2)" || true
}

# ── Run remaining states in windows ──
RUN_START=$SECONDS
WINDOW_NUM=0
for (( start=0; start<${#REMAINING[@]}; start+=WINDOW_SIZE )); do
  # Stop launching new windows once the total wall budget is spent.
  if [ $((SECONDS - RUN_START)) -ge "$MAX_WALL_SEC" ]; then
    echo "$(date): Wall budget ${MAX_WALL_SEC}s exhausted — ${#COMPLETED[@]}/${#ORDERED_STATES[@]} states done, rest resume next run" >> "$LOG/cron-tryst.log"
    break
  fi

  WINDOW_NUM=$((WINDOW_NUM + 1))
  end=$((start + WINDOW_SIZE))
  if [ "$end" -gt "${#REMAINING[@]}" ]; then end=${#REMAINING[@]}; fi

  pids=()
  launched=()
  for (( j=start; j<end; j++ )); do
    st="${REMAINING[$j]}"
    launched+=("$st")
    nohup node scripts/import-tryst.mjs --states="$st" \
      > "$STATE_LOGDIR/${st}-batch.log" 2>&1 &
    pids+=("$!")
    sleep 0.5
  done

  echo "$(date): Launched window $WINDOW_NUM: ${launched[*]}" >> "$LOG/cron-tryst.log"

  if ! wait_for_pids "${pids[@]}"; then
    echo "$(date): Window $WINDOW_NUM timed out after ${WINDOW_TIMEOUT_SEC}s — killing remaining workers" >> "$LOG/cron-tryst.log"
    pkill -f "import-tryst" 2>/dev/null || true
    sleep 2
  fi

  # Mark states that finished cleanly — source-verified markers from
  # import-tryst.mjs lines 629/635: "Tryst import complete:" / "elapsedSeconds:".
  for st in "${launched[@]}"; do
    if grep -qE 'Tryst import complete:|elapsedSeconds:' "$STATE_LOGDIR/${st}-batch.log" 2>/dev/null; then
      already=false
      for c in "${COMPLETED[@]:-}"; do
        if [ "$c" = "$st" ]; then already=true; break; fi
      done
      if [ "$already" = false ]; then COMPLETED+=("$st"); fi
      # Throughput telemetry for future tuning (parsed/error counts per state).
      # MUST stay fail-safe: under set -e + pipefail a no-match grep kills the
      # launcher before save_state (lost alaska's first completion 2026-07-31).
      { tail -1 "$STATE_LOGDIR/${st}-batch.log" 2>/dev/null | grep -oE 'parsed=[0-9]+ .*errors=[0-9]+' | \
        xargs -r -I{} echo "$(date):   $st finished — {}" >> "$LOG/cron-tryst.log"; } || true
    fi
  done

  save_state
  echo "$(date): Window $WINDOW_NUM complete — ${#COMPLETED[@]}/${#ORDERED_STATES[@]} states finished" >> "$LOG/cron-tryst.log"
done

DONE=${#COMPLETED[@]}
if [ "$DONE" -ge "${#ORDERED_STATES[@]}" ]; then
  rm -f "$STATE_FILE"
  echo "$(date): Tryst import fully complete (${SECONDS}s, ${DONE}/${#ORDERED_STATES[@]} states)" >> "$LOG/cron-tryst.log"
else
  echo "$(date): Tryst import windowed run ended (${SECONDS}s, ${DONE}/${#ORDERED_STATES[@]} states finished; remaining resume next run)" >> "$LOG/cron-tryst.log"
fi
