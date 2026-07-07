#!/usr/bin/env bash
# Spot-check profile slug 404s against production API + SPA routes.
set -euo pipefail
BASE="${BASE:-https://www.laboutiquevip.net}"
LIMIT="${LIMIT:-5}"

echo "Fetching ${LIMIT} providers from ${BASE}..."
items=$(curl -sS "${BASE}/api/v1/search/providers?limit=${LIMIT}" | node -e "
const chunks=[]; process.stdin.on('data',d=>chunks.push(d)); process.stdin.on('end',()=>{
  const data=JSON.parse(Buffer.concat(chunks).toString());
  for (const p of (data.items||[])) {
    const slug=(p.verification_username||p.display_name||'').toLowerCase().replace(/^@/,'').replace(/[^a-z0-9]+/g,'')||p.id;
    console.log(slug);
  }
});")

fail=0
while IFS= read -r slug; do
  [ -z "$slug" ] && continue
  api_code=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}/api/v1/providers/by-slug/${slug}")
  page_code=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}/profile/${slug}")
  echo "slug=${slug} api=${api_code} page=${page_code}"
  if [ "$api_code" != "200" ] || [ "$page_code" != "200" ]; then
    fail=1
  fi
done <<< "$items"

exit $fail
