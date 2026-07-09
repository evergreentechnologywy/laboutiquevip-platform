#!/usr/bin/env bash
# Eros photo refresh + hub reconcile run inside midnight merge (run-us-verified-catalog-merge.sh).
# This installer only strips legacy standalone Eros import/reconcile/photo crons.
set -euo pipefail

REPO="${REPO:-/srv/apps/trystlike/repo}"

mkdir -p /var/log/laboutiquevip
chmod +x "$REPO/scripts/run-eros-photo-update.sh" 2>/dev/null || true
chmod +x "$REPO/scripts/run-eros-reconcile.sh" 2>/dev/null || true

(crontab -l 2>/dev/null \
  | sed '/run-ultragfe-import\.sh/d' \
  | sed '/ultragfe-weekly-import/d' \
  | sed '/run-eros-import\.sh/d' \
  | sed '/eros-weekly-import/d' \
  | sed '/run-eros-photo-update\.sh/d' \
  | sed '/eros-photo-update/d' \
  | sed '/run-eros-reconcile\.sh/d' \
  | sed '/eros-reconcile/d') | crontab -

echo "Eros photo + reconcile integrated into lbv-us-verified-merge-midnight (no standalone eros crons)."
crontab -l | grep -E 'eros-' || echo "(no eros-* cron lines — expected)"
