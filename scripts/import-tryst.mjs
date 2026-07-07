#!/usr/bin/env node
/**
 * Tryst.link daily import for laboutiquevip.net
 *
 * Caps (enforced):
 *   - Top 25 profiles per city
 *   - Top 5 cities per state (by listing count on Tryst state page)
 *
 * URL patterns:
 *   State:  https://tryst.link/us/escorts/{state}
 *   City:   https://tryst.link/us/escorts/{state}/{city}
 *   Profile: https://tryst.link/escort/{slug}
 */

import {
  TRYST_PILOT_CITIES,
  TRYST_STATE_SLUGS,
  parseTrystCityUrl,
  parseTrystProfileUrl,
  titleCaseWords,
} from "./lib/tryst-location.mjs";
import {
  mergeVerificationFields,
  passesImportGate,
  resolveProviderVerification,
} from "./lib/verification-match.mjs";

const JINA_PREFIX = "https://r.jina.ai/https://";
const MAX_PROFILES_PER_CITY = Number(process.env.TRYST_MAX_PROFILES_PER_CITY ?? "25");
const MAX_CITIES_PER_STATE = Number(process.env.TRYST_MAX_CITIES_PER_STATE ?? "5");
const DELAY_MS = Number(process.env.TRYST_DELAY_MS ?? "800");
const dryRun = process.argv.includes("--dry-run");
const pilotOnly = !process.argv.includes("--full-rollout");

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
  skipped: 0,
  skippedNoVerification: 0,
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

function extractProfileLinks(markdown, cityUrl) {
  const links = new Set();
  const re = /https?:\/\/tryst\.link\/escort\/[a-z0-9-]+/gi;
  for (const match of markdown.matchAll(re)) {
    links.add(match[0].split("?")[0].replace(/\/$/, ""));
  }
  const relRe = /\]\((\/escort\/[a-z0-9-]+)\)/gi;
  for (const match of markdown.matchAll(relRe)) {
    links.add(`https://tryst.link${match[1]}`);
  }
  return [...links].slice(0, MAX_PROFILES_PER_CITY);
}

function extractCityLinksFromStatePage(markdown, stateSlug) {
  const cities = new Map();
  const re = new RegExp(`tryst\\.link/us/escorts/${stateSlug}/([a-z0-9-]+)`, "gi");
  for (const match of markdown.matchAll(re)) {
    const citySlug = match[1].toLowerCase();
    if (citySlug === stateSlug) continue;
    cities.set(citySlug, (cities.get(citySlug) ?? 0) + 1);
  }
  return [...cities.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CITIES_PER_STATE)
    .map(([slug]) => slug);
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

  const existing = await prisma.provider.findFirst({
    where: {
      OR: [
        { verification_provider: "tryst", verification_url: profile.sourceUrl },
        { verification_url: profile.sourceUrl },
      ],
    },
  });

  const verification = await resolveProviderVerification({
    phone: profile.phone,
    email: profile.email,
    markdown,
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
    social_media: {
      ...(existing?.social_media && typeof existing.social_media === "object" ? existing.social_media : {}),
      tryst_profile: profile.sourceUrl,
      tryst_slug: profile.slug,
    },
    status: existing?.status ?? "active",
    is_verified: existing?.is_verified ?? true,
    is_profile_approved: existing?.is_profile_approved ?? true,
    ...mergeVerificationFields(existing, verification),
  };

  if (dryRun) {
    stats.skipped += 1;
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

  const listingText = await fetchPageText(cityUrl);
  stats.citiesScanned += 1;
  if (!listingText) {
    stats.errors += 1;
    return;
  }

  const profileLinks = extractProfileLinks(listingText, cityUrl);
  stats.profilesDiscovered += profileLinks.length;

  for (const profileUrl of profileLinks) {
    await sleep(DELAY_MS);
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

async function resolveTargetCities() {
  if (pilotOnly) return TRYST_PILOT_CITIES;

  const targets = [];
  for (const stateSlug of Object.keys(TRYST_STATE_SLUGS)) {
    const stateUrl = `https://tryst.link/us/escorts/${stateSlug}`;
    await sleep(DELAY_MS);
    const text = await fetchPageText(stateUrl);
    if (!text) continue;
    const citySlugs = extractCityLinksFromStatePage(text, stateSlug);
    for (const citySlug of citySlugs) {
      targets.push({ state: stateSlug, city: citySlug });
    }
  }
  return targets;
}

async function main() {
  console.log(`Tryst import start pilotOnly=${pilotOnly} dryRun=${dryRun}`);
  console.log(`Caps: ${MAX_PROFILES_PER_CITY}/city, ${MAX_CITIES_PER_STATE}/state`);

  const cities = await resolveTargetCities();
  console.log(`Target cities: ${cities.length}`);

  for (const { state, city } of cities) {
    console.log(`Importing ${state}/${city}...`);
    await importCity(state, city);
    await sleep(DELAY_MS);
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
