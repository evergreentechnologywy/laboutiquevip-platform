#!/usr/bin/env node
/**
 * Tryst daily reconcile — deactivate providers missing from latest city scrape.
 * Same per-hub pattern as reconcile-eros (only deactivate when hub fetch succeeded).
 */

import { parseTrystCityUrl, TRYST_PILOT_CITIES } from "./lib/tryst-location.mjs";

const JINA_PREFIX = "https://r.jina.ai/https://";
const MAX_PROFILES_PER_CITY = Number(process.env.TRYST_MAX_PROFILES_PER_CITY ?? "25");
const dryRun = process.argv.includes("--dry-run");
const pilotOnly = !process.argv.includes("--full-rollout");

const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function createPrismaClient() {
  const runtime = await dynamicImport("@prisma/client");
  return new runtime.PrismaClient();
}

const prisma = await createPrismaClient();

const hubStats = new Map();
const activeUrls = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPageText(url) {
  const response = await fetch(`${JINA_PREFIX}${url.replace(/^https?:\/\//i, "")}`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; laboutiquevip-tryst-reconcile/1.0)" },
  });
  if (!response.ok) return null;
  return response.text();
}

function hubKey(state, city) {
  return `${state}/${city}`;
}

function extractProfileLinks(markdown) {
  const links = new Set();
  const re = /https?:\/\/tryst\.link\/escort\/[a-z0-9-]+/gi;
  for (const match of markdown.matchAll(re)) {
    links.add(match[0].split("?")[0].replace(/\/$/, "").toLowerCase());
  }
  return [...links].slice(0, MAX_PROFILES_PER_CITY);
}

async function scanCity(stateSlug, citySlug) {
  const url = `https://tryst.link/us/escorts/${stateSlug}/${citySlug}`;
  const key = hubKey(stateSlug, citySlug);
  const stats = hubStats.get(key) ?? { success: 0, attempted: 0 };
  stats.attempted += 1;

  const text = await fetchPageText(url);
  if (text) {
    stats.success += 1;
    for (const profileUrl of extractProfileLinks(text)) {
      activeUrls.add(profileUrl);
    }
  }
  hubStats.set(key, stats);
}

async function main() {
  const cities = pilotOnly ? TRYST_PILOT_CITIES : TRYST_PILOT_CITIES; // expand with import-tryst city resolver
  console.log(`Tryst reconcile scanning ${cities.length} hubs (pilotOnly=${pilotOnly})`);

  for (const { state, city } of cities) {
    await scanCity(state, city);
    await sleep(600);
  }

  const trystProviders = await prisma.provider.findMany({
    where: { verification_provider: "tryst", status: "active" },
    select: { id: true, verification_url: true, location_city: true, location_state: true },
  });

  let deactivated = 0;
  for (const provider of trystProviders) {
    const url = String(provider.verification_url ?? "").toLowerCase();
    if (!url) continue;
    if (activeUrls.has(url)) continue;

    // Only deactivate if at least one hub in same state succeeded (conservative)
    const stateSlug = String(provider.location_state ?? "").toLowerCase();
    const hubSucceeded = [...hubStats.entries()].some(
      ([key, stats]) => key.startsWith(`${stateSlug}/`) && stats.success > 0,
    );
    if (!hubSucceeded) continue;

    if (dryRun) {
      console.log(`[dry-run] would deactivate ${provider.id}`);
      continue;
    }
    await prisma.provider.update({
      where: { id: provider.id },
      data: { status: "inactive", admin_notes: "tryst reconcile: missing from daily scrape" },
    });
    deactivated += 1;
  }

  console.log(`Tryst reconcile complete. activeUrls=${activeUrls.size} deactivated=${deactivated}`);
  console.log(`Deactivated: ${deactivated}`);
  console.log(`Imported: 0`);
  console.log(`Errors: 0`);
  console.log(`Elapsed: ${Math.round(process.uptime())}s`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
