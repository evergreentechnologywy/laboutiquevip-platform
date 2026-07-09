#!/usr/bin/env bash
# Ensure Prisma client exists AND matches the current schema before import/merge
# scripts use match-review or DB helpers. A stale generated client (e.g. one
# built before Provider.user_id became nullable) fails every row read with
# "Error converting field user_id ... found incompatible value of null".
#
# Prisma reformats schema.prisma inside the generated output, so we track the
# source schema checksum at generation time instead of comparing files.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
GENERATED="$REPO_DIR/backend/generated/prisma-client/index.js"
SOURCE_SCHEMA="$REPO_DIR/backend/prisma/schema.prisma"
STAMP="$REPO_DIR/backend/generated/prisma-client/.source-schema.sha256"

finish() {
  local code="${1:-0}"
  if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    return "$code"
  fi
  exit "$code"
}

schema_hash() {
  sha256sum "$SOURCE_SCHEMA" | awk '{print $1}'
}

if [[ -f "$GENERATED" && -f "$STAMP" && -f "$SOURCE_SCHEMA" ]] \
  && [[ "$(schema_hash)" == "$(cat "$STAMP")" ]]; then
  finish 0
fi

echo "[ensure-prisma-client] generated client missing or stale — regenerating"
cd "$REPO_DIR"
npm run db:generate --silent
schema_hash >"$STAMP"
