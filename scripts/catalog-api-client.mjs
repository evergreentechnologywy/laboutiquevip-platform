#!/usr/bin/env node
/**
 * Thin client for external Eros/Tryst catalog workers.
 * Posts provider batches to LBV core via API — no direct DB access required.
 *
 * Usage:
 *   CATALOG_API_BASE=https://www.laboutiquevip.net \
 *   CATALOG_SERVICE_JWT=<jwt role=service> \
 *   node scripts/catalog-api-client.mjs --source=eros --file=./batch.json
 *
 * batch.json shape:
 *   { "providers": [ { "display_name", "verification_url", "location_city", ... } ] }
 */
import fs from "node:fs";
import path from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);

const source = String(args.get("source") || "").toLowerCase();
const file = args.get("file");
const dryRun = args.has("dry-run");
const base = (process.env.CATALOG_API_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const token = process.env.CATALOG_SERVICE_JWT || process.env.LBV_SERVICE_JWT || "";

if (!["eros", "tryst"].includes(source)) {
  console.error("Usage: --source=eros|tryst --file=batch.json [--dry-run]");
  process.exit(2);
}
if (!file) {
  console.error("Missing --file=batch.json");
  process.exit(2);
}
if (!token) {
  console.error("Set CATALOG_SERVICE_JWT (Bearer JWT with role=service)");
  process.exit(2);
}

const payload = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
const providers = Array.isArray(payload) ? payload : payload.providers;
if (!Array.isArray(providers) || providers.length === 0) {
  console.error("batch must include non-empty providers[]");
  process.exit(2);
}

const res = await fetch(`${base}/api/v1/catalog/ingest`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    source,
    providers,
    dry_run: dryRun,
  }),
});

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = { raw: text };
}

console.log(JSON.stringify({ status: res.status, body }, null, 2));
process.exit(res.ok ? 0 : 1);
