#!/usr/bin/env node
/**
 * Compare Eros sitemap hub keys vs public catalog location coverage.
 * Read-only — safe to run while imports are active.
 *
 * Usage:
 *   node scripts/report-eros-hub-coverage.mjs
 *   LBV_API_BASE=https://www.laboutiquevip.net node scripts/report-eros-hub-coverage.mjs --json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsonOut = process.argv.includes("--json");
const apiBase = (process.env.LBV_API_BASE || "https://www.laboutiquevip.net").replace(/\/$/, "");
const JINA_PREFIX = "https://r.jina.ai/http://";

async function fetchMirrorText(url) {
  const mirror = `${JINA_PREFIX}${url.replace(/^https?:\/\//i, "")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(mirror, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; lbv-hub-report/1.0)" },
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSitemapHubs() {
  const text = await fetchMirrorText("https://www.eros.com/sitemap-cities.xml");
  const hubs = new Map();
  for (const m of text.matchAll(/https?:\/\/www\.eros\.com\/[^\s)\]]+\/eros\.htm/gi)) {
    const match = m[0].match(/eros\.com\/([a-z0-9_-]+)(?:\/([a-z0-9_-]+))?\/eros\.htm/i);
    if (!match) continue;
    const state = match[1].toLowerCase();
    const city = (match[2] ?? match[1]).toLowerCase();
    hubs.set(`${state}/${city}`, { state, city });
  }
  return [...hubs.values()];
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function fetchCatalogHubKeys() {
  const res = await fetch(`${apiBase}/api/v1/search/locations`);
  if (!res.ok) throw new Error(`locations API ${res.status}`);
  const data = await res.json();
  const keys = new Set();
  for (const state of data.states || []) {
    const stateSlug = slugify(state.name || state.code);
    for (const city of state.cities || []) {
      const citySlug = slugify(city.slug || city.name);
      keys.add(`${stateSlug}/${citySlug}`);
    }
  }
  return keys;
}

async function fetchSystemStatus() {
  const res = await fetch(`${apiBase}/api/v1/system/status`);
  if (!res.ok) return null;
  return res.json();
}

function hubKey(hub) {
  return `${hub.state}/${hub.city}`;
}

async function main() {
  const [sitemapHubs, catalogKeys, status] = await Promise.all([
    fetchSitemapHubs(),
    fetchCatalogHubKeys(),
    fetchSystemStatus(),
  ]);

  const sitemapKeys = new Set(sitemapHubs.map(hubKey));
  const missing = sitemapHubs.filter((hub) => !catalogKeys.has(hubKey(hub)));
  const extra = [...catalogKeys].filter((key) => !sitemapKeys.has(key));

  const report = {
    generatedAt: new Date().toISOString(),
    apiBase,
    sitemapHubCount: sitemapHubs.length,
    catalogCityKeyCount: catalogKeys.size,
    missingHubCount: missing.length,
    extraCatalogKeyCount: extra.length,
    coveragePct: sitemapHubs.length
      ? Math.round(((sitemapHubs.length - missing.length) / sitemapHubs.length) * 1000) / 10
      : 0,
    publicCatalogCount: status?.catalog?.publicCount ?? null,
    maintenanceMode: status?.maintenance?.mode ?? null,
    missingHubs: missing.map(hubKey).sort(),
    extraCatalogKeys: extra.sort().slice(0, 30),
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("=== Eros hub coverage report ===");
  console.log(`API: ${apiBase}`);
  console.log(`Sitemap hubs: ${report.sitemapHubCount}`);
  console.log(`Catalog city keys: ${report.catalogCityKeyCount}`);
  console.log(`Coverage: ${report.coveragePct}% (${report.sitemapHubCount - report.missingHubCount}/${report.sitemapHubCount})`);
  console.log(`Public catalog: ${report.publicCatalogCount ?? "n/a"} | maintenance: ${report.maintenanceMode ?? "n/a"}`);
  if (missing.length) {
    console.log(`\nMissing hubs (${missing.length}):`);
    for (const hub of missing.slice(0, 25)) {
      console.log(`  - ${hubKey(hub)}`);
    }
    if (missing.length > 25) console.log(`  ... +${missing.length - 25} more`);
  } else {
    console.log("\nAll sitemap hubs have catalog city keys.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
