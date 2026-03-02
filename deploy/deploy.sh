#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/srv/apps/trystlike/repo"
cd "$ROOT_DIR"

echo "[deploy] starting production deploy sequence (Hostinger / www.laboutiquevip.net)"

required_env=(
  NODE_ENV
  DATABASE_URL
  PUBLIC_BASE_URL
  CORS_ALLOWLIST
  CONFIRMO_WEBHOOK_SECRET
  DIDIT_API_KEY
  DIDIT_WORKFLOW_ID
  DIDIT_WEBHOOK_SECRET
)

for env_name in "${required_env[@]}"; do
  if [[ -z "${!env_name:-}" ]]; then
    echo "[deploy] missing required env: ${env_name}"
    exit 1
  fi
done

if [[ "${NODE_ENV}" != "production" ]]; then
  echo "[deploy] NODE_ENV must be production for deploy"
  exit 1
fi

npm ci
npm run build:backend
npm run test:backend
npm run build
npm run db:migrate:deploy

echo "[deploy] running backend smoke check"
API_PORT="${API_PORT:-18787}" node backend/dist/server.js >/tmp/trystlike-backend-smoke.log 2>&1 &
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
