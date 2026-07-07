#!/usr/bin/env node
/**
 * Tryst.link US catalog import for laboutiquevip.net
 *
 * Default: full US rollout (all states/cities from Tryst state pages).
 * Use --pilot-only for the small TRYST_PILOT_CITIES set.
 *
 * Caps (0 = unlimited via env):
 *   TRYST_MAX_PROFILES_PER_CITY
 *   TRYST_MAX_CITIES_PER_STATE
 *   TRYST_MAX_LISTING_PAGES_PER_CITY
 *
 * Pre-import gate: only providers with P411 and/or review match are upserted.
 */

import { parseTrystCityUrl, parseTrystProfileUrl, titleCaseWords } from "./lib/tryst-location.mjs";
import {
  extractContactAndSocialFromMarkdown,
  mergeImportedSocial,
} from "./lib/extract-social-links.mjs";
import { formatCap } from "./lib/import-limits.mjs";
import {
  collectProfileLinksForCity,
  getTrystCrawlLimits,
  resolveTrystTargetCities,
} from "./lib/tryst-crawl.mjs";
import {
  appendCacheRecord,
  defaultDatedCacheDir,
  initCacheDir,
  resolveCacheDir,
} from "./lib/catalog-scan-cache.mjs";
import {
  mergeVerificationFields,
  passesImportGate,
  providerHasVerificationBadge,
  resolveProviderVerification,
} from "./lib/verification-match.mjs";

const JINA_PREFIX = "https://r.jina.ai/https://";
const crawlLimits = getTrystCrawlLimits();
const dryRun = process.argv.includes("--dry-run");
const pilotOnly = process.argv.includes("--pilot-only");
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const cacheOnly =
  args.has("cache-only") ||
  Boolean(process.env.CATALOG_SCAN_CACHE_DIR || process.env.LBV_CATALOG_SCAN_CACHE);
const cacheDir = cacheOnly
  ? resolveCacheDir(
      args.get("cache-dir") ??
        process.env.CATALOG_SCAN_CACHE_DIR ??
        process.env.LBV_CATALOG_SCAN_CACHE ??
        defaultDatedCacheDir(),
    )
  : null;

const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function createPrismaClient() {
  try {
    const generated = await dynamicImport("../backend/generated/prisma-client/index.js");
    if (generated?.PrismaClient) return new generated.PrismaClient();
  } catch {
    // fallback
  }
  const runtime = await dynamicImport("@prisma/client");
  if (!runtime?.PrismaClient) throw new Error("PrismaClient not available. Run `npm run db:generate`.");
  return new runtime.PrismaClient();
}

const prisma = process.env.DATABASE_URL ? await createPrismaClient() : null;

const stats = {
  citiesScanned: 0,
  profilesDiscovered: 0,
  profilesParsed: 0,
  created: 0,
  updated: 0,
  cached: 0,
  skipped: 0,
  skippedNoVerification: 0,
  verificationCacheHits: 0,
  errors: 0,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(input) {
  return String(input ?? "")
    .replace(/\*\*/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageText(url, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(`${JINA_PREFIX}${url.replace(/^https?:\/\//i, "")}`, {
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; laboutiquevip-tryst-import/1.0)" },
      });
      if (response.status === 429) {
        await sleep(8000 * attempt);
        continue;
      }
      if (!response.ok) return null;
      return await response.text();
    } catch {
      await sleep(1200 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function parseProfilePage(markdown, profileUrl) {
  const slug = parseTrystProfileUrl(profileUrl);
  if (!slug) return null;

  const titleMatch = markdown.match(/^#\s+(.+?)$/m);
  const displayName = cleanText(titleMatch?.[1] ?? slug.replace(/-/g, " "));

  const phoneMatch = markdown.match(/(?:phone|call|text)[:\s]*([+()0-9.\-\s]{10,})/i);
  const emailMatch = markdown.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);

  const photoMatches = [
    ...markdown.matchAll(/https?:\/\/[^\s)"']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^\s)"']*)?/gi),
    ...markdown.matchAll(/https?:\/\/(?:discovery\.)?tryst[^\s)"']+\/[^\s)"']+\.(?:jpg|jpeg|png|webp)/gi),
    ...markdown.matchAll(/https?:\/\/[^\s)]+(?:a4cdn\.(?:ch|org)|tryst\.link\/media)[^\s)]+/gi),
  ];
  const photos = [...new Set(photoMatches.map((m) => m[0]))].slice(0, 24);

  const locationLine = markdown.match(/(?:located in|based in|location)[:\s]*([^\n|]+)/i);
  let location_city = null;
  let location_state = null;
  if (locationLine) {
    const parts = locationLine[1].split(",").map((p) => cleanText(p));
    location_city = parts[0] || null;
    location_state = parts[1]?.toUpperCase() ?? null;
  }

  return {
    slug,
    displayName,
    sourceUrl: profileUrl,
    phone: phoneMatch ? phoneMatch[1].replace(/\D/g, "").slice(-10) : null,
    email: emailMatch ? emailMatch[1].toLowerCase() : null,
    photos,
    location_city,
    location_state,
    bio: cleanText(markdown.slice(0, 1200)),
  };
}

async function upsertTrystProvider(profile, cityMeta, markdown = "") {
  if (!prisma) {
    stats.skipped += 1;
    return;
  }

  const location_city = profile.location_city ?? cityMeta.cityName;
  const location_state = profile.location_state ?? cityMeta.stateAbbrev;

  const contactExtract = extractContactAndSocialFromMarkdown(markdown);
  profile.phone = profile.phone || contactExtract.phone;
  profile.email = profile.email || contactExtract.email;

  const existing = await prisma.provider.findFirst({
    where: {
      OR: [
        { verification_provider: "tryst", verification_url: profile.sourceUrl },
        { verification_url: profile.sourceUrl },
      ],
    },
  });

  const cachedBadge = providerHasVerificationBadge(existing);
  if (cachedBadge) stats.verificationCacheHits += 1;
  const verification = await resolveProviderVerification({
    phone: profile.phone,
    email: profile.email,
    markdown,
    includeApiLookup: !cachedBadge,
  });

  if (!passesImportGate(existing, verification)) {
    stats.skippedNoVerification += 1;
    return;
  }

  const payload = {
    display_name: profile.displayName || existing?.display_name || "Tryst Provider",
    bio: profile.bio || existing?.bio,
    location_city,
    location_state,
    location_country: "US",
    phone: profile.phone || existing?.phone,
    email: profile.email || existing?.email,
    photos: profile.photos.length ? profile.photos : existing?.photos,
    verification_provider: "tryst",
    verification_url: profile.sourceUrl,
    verification_username: profile.slug,
    social_media: mergeImportedSocial(
      existing?.social_media && typeof existing.social_media === "object" ? existing.social_media : {},
      contactExtract.social_media,
      {
        tryst_profile: profile.sourceUrl,
        tryst_slug: profile.slug,
      },
    ),
    status: existing?.status ?? "active",
    is_verified: existing?.is_verified ?? true,
    is_profile_approved: existing?.is_profile_approved ?? true,
    ...mergeVerificationFields(existing, verification),
  };

  if (dryRun && !cacheOnly) {
    stats.skipped += 1;
    return;
  }

  if (cacheOnly && cacheDir) {
    appendCacheRecord(cacheDir, "tryst", {
      source: "tryst",
      sourceUrl: profile.sourceUrl,
      existingId: existing?.id ?? null,
      payload,
      scrapedAt: new Date().toISOString(),
    });
    stats.cached += 1;
    if (existing) stats.updated += 1;
    else stats.created += 1;
    return;
  }

  if (existing) {
    await prisma.provider.update({ where: { id: existing.id }, data: payload });
    stats.updated += 1;
  } else {
    await prisma.provider.create({ data: payload });
    stats.created += 1;
  }
}

async function importCity(stateSlug, citySlug) {
  const cityUrl = `https://tryst.link/us/escorts/${stateSlug}/${citySlug}`;
  const cityMeta = parseTrystCityUrl(cityUrl);
  if (!cityMeta) return;

  stats.citiesScanned += 1;

  const profileLinks = await collectProfileLinksForCity(cityUrl, fetchPageText, crawlLimits);
  if (profileLinks.length === 0) {
    stats.errors += 1;
    return;
  }

  stats.profilesDiscovered += profileLinks.length;

  for (const profileUrl of profileLinks) {
    await sleep(crawlLimits.delayMs);
    const profileText = await fetchPageText(profileUrl);
    if (!profileText) {
      stats.errors += 1;
      continue;
    }
    const profile = parseProfilePage(profileText, profileUrl);
    if (!profile) {
      stats.skipped += 1;
      continue;
    }
    stats.profilesParsed += 1;
    try {
      await upsertTrystProvider(profile, cityMeta, profileText);
    } catch {
      stats.errors += 1;
    }
  }
}

async function main() {
  if (cacheOnly && cacheDir) {
    initCacheDir(cacheDir);
    console.log(`Tryst import cache-only dir=${cacheDir}`);
  }
  console.log(
    `Tryst import start pilotOnly=${pilotOnly} dryRun=${dryRun} cacheOnly=${cacheOnly} ` +
      `profilesPerCity=${formatCap(crawlLimits.maxProfilesPerCity)} ` +
      `citiesPerState=${formatCap(crawlLimits.maxCitiesPerState)}`,
  );

  const cities = await resolveTrystTargetCities({
    fullUs: !pilotOnly,
    fetchPageText,
    delayMs: crawlLimits.delayMs,
    limits: crawlLimits,
    onState: (stateSlug) => console.log(`Discovering cities in ${titleCaseWords(stateSlug.replace(/-/g, " "))} (${stateSlug})...`),
  });
  console.log(`Target cities: ${cities.length}`);

  for (const { state, city } of cities) {
    console.log(`Importing ${state}/${city}...`);
    await importCity(state, city);
    await sleep(crawlLimits.delayMs);
  }

  console.log("Tryst import complete:", stats);
  console.log(`created: ${stats.created}`);
  console.log(`updated: ${stats.updated}`);
  console.log(`skipped: ${stats.skipped}`);
  console.log(`skippedNoVerification: ${stats.skippedNoVerification}`);
  console.log(`errors: ${stats.errors}`);
  console.log(`elapsedSeconds: ${Math.round(process.uptime())}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
