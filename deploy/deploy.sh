#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[deploy] starting safe deploy sequence"
npm ci
npm run build:backend
npm run test:backend
npm run build
npm run db:migrate:deploy

echo "[deploy] running backend smoke check"
API_PORT="${API_PORT:-18787}" NODE_ENV=production node backend/dist/server.js >/tmp/trystlike-backend-smoke.log 2>&1 &
SMOKE_PID=$!
trap 'kill "$SMOKE_PID" >/dev/null 2>&1 || true' EXIT
sleep 2

SMOKE_STATUS="$(curl -sS -o /tmp/trystlike-health.json -w "%{http_code}" "http://127.0.0.1:${API_PORT}/api/health")"
if [[ "$SMOKE_STATUS" != "200" ]]; then
  echo "[deploy] smoke check failed with status: $SMOKE_STATUS"
  cat /tmp/trystlike-health.json || true
  exit 1
fi

kill "$SMOKE_PID" >/dev/null 2>&1 || true
trap - EXIT

echo "[deploy] deploy checks complete"
