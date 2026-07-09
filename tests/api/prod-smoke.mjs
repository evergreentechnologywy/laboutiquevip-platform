#!/usr/bin/env node
/**
 * API smoke runner — mirrors vault bootstrap/lbv-prod-qa patterns.
 * Usage: node tests/api/prod-smoke.mjs [baseUrl]
 */
const BASE = (process.argv[2] ?? process.env.LBV_BASE_URL ?? "https://www.laboutiquevip.net").replace(/\/$/, "");

const checks = [
  { name: "health", path: "/api/health", expect: 200 },
  { name: "system/status", path: "/api/v1/system/status", expect: 200 },
  { name: "search providers", path: "/api/v1/search/providers?limit=3", expect: 200 },
  { name: "search Miami", path: "/api/v1/search/providers?location=Miami&limit=3", expect: 200 },
  { name: "search locations", path: "/api/v1/search/locations", expect: 200 },
  { name: "slug rubyvega", path: "/api/v1/providers/by-slug/rubyvega", expect: 200 },
  { name: "admin reports guest", path: "/api/admin/reports", expect: [401, 403, 404] },
  { name: "admin import guest", path: "/api/admin/import-maintenance", expect: [401, 403, 404] },
];

function ok(status, expect) {
  if (Array.isArray(expect)) return expect.includes(status);
  return status === expect;
}

let failed = 0;
console.log(`LBV API smoke — ${BASE}\n`);

for (const c of checks) {
  const t0 = Date.now();
  let status = 0;
  try {
    const res = await fetch(`${BASE}${c.path}`, { redirect: "follow" });
    status = res.status;
  } catch (e) {
    console.log(`FAIL ${c.name} — ${e.message}`);
    failed++;
    continue;
  }
  const ms = Date.now() - t0;
  if (ok(status, c.expect)) {
    console.log(`OK   ${status} ${ms}ms ${c.name}`);
  } else {
    console.log(`FAIL ${c.name} expected=${JSON.stringify(c.expect)} got=${status}`);
    failed++;
  }
}

const statusRes = await fetch(`${BASE}/api/v1/system/status`);
if (statusRes.ok) {
  const j = await statusRes.json();
  console.log(`\nCatalog publicCount: ${j?.catalog?.publicCount ?? "?"}`);
  console.log(`Maintenance: ${j?.maintenance?.mode ?? "off"}`);
}

process.exit(failed > 0 ? 1 : 0);
