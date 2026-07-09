#!/usr/bin/env bash
# Ensure Prisma client exists AND matches the current schema before import/merge
# scripts use match-review or DB helpers. A stale generated client (e.g. one
# built before Provider.user_id became nullable) fails every row read with
# "Error converting field user_id ... found incompatible value of null".
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
GENERATED="$REPO_DIR/backend/generated/prisma-client/index.js"
GENERATED_SCHEMA="$REPO_DIR/backend/generated/prisma-client/schema.prisma"
SOURCE_SCHEMA="$REPO_DIR/backend/prisma/schema.prisma"

finish() {
  local code="${1:-0}"
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return "$code"
  fi
  exit "$code"
}

if [[ -f "$GENERATED" && -f "$GENERATED_SCHEMA" && -f "$SOURCE_SCHEMA" ]] \
  && cmp -s "$SOURCE_SCHEMA" "$GENERATED_SCHEMA"; then
  finish 0
fi

echo "[ensure-prisma-client] generated client missing or stale — regenerating"
cd "$REPO_DIR"
npm run db:generate --silent
