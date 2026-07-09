#!/usr/bin/env bash
# Ensure Prisma client exists before import/merge scripts use match-review or DB helpers.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
GENERATED="$REPO_DIR/backend/generated/prisma-client/index.js"

finish() {
  local code="${1:-0}"
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return "$code"
  fi
  exit "$code"
}

if [[ -f "$GENERATED" ]]; then
  finish 0
fi

cd "$REPO_DIR"
npm run db:generate --silent
