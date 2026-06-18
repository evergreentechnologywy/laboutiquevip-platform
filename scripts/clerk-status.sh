#!/usr/bin/env bash
# Clerk production readiness check (run on VPS with .env sourced)
set -euo pipefail

if [[ -z "${CLERK_SECRET_KEY:-}" ]]; then
  echo "✗ CLERK_SECRET_KEY not set"
  exit 1
fi

pass=0
fail=0

instance=$(curl -sS -H "Authorization: Bearer $CLERK_SECRET_KEY" "https://api.clerk.com/v1/instance")
env_type=$(echo "$instance" | python3 -c "import sys,json; print(json.load(sys.stdin).get('environment_type','unknown'))" 2>/dev/null || echo unknown)
pk_prefix="${VITE_CLERK_PUBLISHABLE_KEY:-}"
pk_prefix="${pk_prefix:0:8}"

if [[ "$env_type" == "production" ]]; then
  echo "✓ Clerk instance: production"
  pass=$((pass + 1))
else
  echo "✗ Clerk instance: $env_type (need production + pk_live keys)"
  fail=$((fail + 1))
fi

if [[ "$pk_prefix" == "pk_live_" ]]; then
  echo "✓ Publishable key: pk_live_*"
  pass=$((pass + 1))
else
  echo "✗ Publishable key: $pk_prefix* (need pk_live for prod)"
  fail=$((fail + 1))
fi

domains=$(curl -sS -H "Authorization: Bearer $CLERK_SECRET_KEY" "https://api.clerk.com/v1/domains")
if echo "$domains" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any('laboutiquevip' in (x.get('name') or '') for x in d.get('data',[])))" 2>/dev/null | grep -q True; then
  echo "✓ Clerk domain includes laboutiquevip"
  pass=$((pass + 1))
else
  echo "⚠ Clerk domain: laboutiquevip.net not registered (dev instance only)"
  fail=$((fail + 1))
fi

agency=$(node -e "
const { PrismaClient } = require('./backend/generated/prisma-client');
const p = new PrismaClient();
p.user.findFirst({ where: { email: 'evergreentechnology.wy@gmail.com' }, select: { status: true, role: true, clerk_id: true } })
  .then(u => { if (!u) { console.log('missing'); process.exit(1); } console.log(u.clerk_id ? 'linked' : 'unlinked'); p.\$disconnect(); })
  .catch(() => { console.log('error'); process.exit(1); });
" 2>/dev/null || echo error)

if [[ "$agency" == "linked" ]]; then
  echo "✓ Agency owner Clerk account linked"
  pass=$((pass + 1))
elif [[ "$agency" == "unlinked" ]]; then
  echo "⚠ Agency owner exists but clerk_id is null — sign in once at /login"
  fail=$((fail + 1))
else
  echo "✗ Agency owner account check failed"
  fail=$((fail + 1))
fi

echo "---"
echo "Pass: $pass  Fail/Warn: $fail"
[[ "$fail" -eq 0 ]]
