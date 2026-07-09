#!/usr/bin/env node
/**
 * Tryst daily reconcile — mark seen providers from latest city scrape.
 * Missing profiles are hidden after 15 days via hide-stale-catalog-providers.mjs (not here).
 */

import { parseTrystCityUrl } from "./lib/tryst-location.mjs";
import {
  collectProfileLinksForCity,
  getTrystCrawlLimits,
  resolveTrystTargetCities,
} from "./lib/tryst-crawl.mjs";
import { formatCap } from "./lib/import-limits.mjs";
import { touchCatalogProviderSeen } from "./lib/catalog-sync-policy.mjs";

const JINA_PREFIX = "https://r.jina.ai/https://";
const crawlLimits = getTrystCrawlLimits();
const dryRun = process.argv.includes("--dry-run");
const pilotOnly = process.argv.includes("--pilot-only");

import { createPrismaClient } from "./lib/prisma-client.mjs";

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

async function scanCity(stateSlug, citySlug) {
  const cityUrl = `https://tryst.link/us/escorts/${stateSlug}/${citySlug}`;
  const key = hubKey(stateSlug, citySlug);
  const stats = hubStats.get(key) ?? { success: 0, attempted: 0 };
  stats.attempted += 1;

  const profileLinks = await collectProfileLinksForCity(cityUrl, fetchPageText, crawlLimits);
  if (profileLinks.length > 0) {
    stats.success += 1;
    for (const profileUrl of profileLinks) {
      activeUrls.add(profileUrl.toLowerCase());
    }
  }
  hubStats.set(key, stats);
}

async function main() {
  const cities = await resolveTrystTargetCities({
    fullUs: !pilotOnly,
    fetchPageText,
    delayMs: crawlLimits.delayMs,
    limits: crawlLimits,
  });

  console.log(
    `Tryst reconcile scanning ${cities.length} hubs pilotOnly=${pilotOnly} ` +
      `profilesPerCity=${formatCap(crawlLimits.maxProfilesPerCity)}`,
  );

  for (const { state, city } of cities) {
    await scanCity(state, city);
    await sleep(600);
  }

  const trystProviders = await prisma.provider.findMany({
    where: { verification_provider: "tryst" },
    select: {
      id: true,
      verification_url: true,
      location_city: true,
      location_state: true,
      status: true,
      admin_notes: true,
      last_seen_at: true,
    },
  });

  let touched = 0;
  for (const provider of trystProviders) {
    const url = String(provider.verification_url ?? "").toLowerCase();
    if (!url || !activeUrls.has(url)) continue;

    const stateSlug = String(provider.location_state ?? "").toLowerCase();
    const hubSucceeded = [...hubStats.entries()].some(
      ([key, stats]) => key.startsWith(`${stateSlug}/`) && stats.success > 0,
    );
    if (!hubSucceeded) continue;

    if (dryRun) {
      console.log(`[dry-run] would touch last_seen ${provider.id}`);
      touched += 1;
      continue;
    }
    await touchCatalogProviderSeen(prisma, provider.id, provider);
    touched += 1;
  }

  console.log(`Touched last_seen_at: ${touched}`);
  console.log(`Active URLs seen: ${activeUrls.size}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
