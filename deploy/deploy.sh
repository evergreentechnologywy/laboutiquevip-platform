#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[deploy] starting Phase 0 hybrid deploy"
npm ci
npm run build
npm run build:backend
npm run db:migrate:deploy

echo "[deploy] deploy complete"
