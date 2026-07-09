#!/usr/bin/env bash
# Restore +x on LBV scripts after git pull (executable bits are not tracked in git).
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

chmod +x "$REPO_DIR"/scripts/*.sh 2>/dev/null || true
chmod +x "$REPO_DIR"/scripts/lib/*.sh 2>/dev/null || true
find "$REPO_DIR/scripts" -maxdepth 2 -name '*.sh' -exec chmod +x {} + 2>/dev/null || true
# git pull on Windows can reintroduce CRLF and break `set -euo pipefail`
find "$REPO_DIR/scripts" -maxdepth 2 -name '*.sh' -exec sed -i 's/\r$//' {} + 2>/dev/null || true
