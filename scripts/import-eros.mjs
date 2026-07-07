#!/usr/bin/env node
/**
 * Eros full importer for laboutiquevip.net
 *
 * Uses r.jina.ai mirror pages to avoid direct anti-bot blocking when
 * crawling eros.com/trans.eros.com/massage.eros.com listing + profile URLs.
 *
 * Caps: --profiles-per-city / --profiles-per-state / --max-pages use 0 for unlimited
 * (default). Pre-import gate skips profiles without P411 or review match.
 */

import {
  isErosStateWideHub,
  parseErosLocationFromUrl,
  resolveErosLocationState,
} from "./lib/eros-location.mjs";
import { findExistingErosProvider } from "./lib/eros-provider-db.mjs";
import {
  extractContactAndSocialFromMarkdown,
  mergeImportedSocial,
} from "./lib/extract-social-links.mjs";
import {
  mergeVerificationFields,
  passesImportGate,
  resolveProviderVerification,
} from "./lib/verification-match.mjs";
import { effectiveLimit, formatCap, parseImportLimit } from "./lib/import-limits.mjs";

const MAX_PROVIDER_PHOTOS = 32;
const JINA_PREFIX = "https://r.jina.ai/http://";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);

const options = {
  dryRun: args.has("dry-run"),
  delayMs: Number(args.get("delay-ms") ?? "600"),
  maxPages: parseImportLimit(args.get("max-pages") ?? process.env.EROS_MAX_PAGES, 15000),
  maxProfiles: parseImportLimit(args.get("max-profiles"), 0),
  profilesPerCity: parseImportLimit(args.get("profiles-per-city") ?? process.env.PROFILES_PER_CITY, 250),
  profilesPerState: parseImportLimit(args.get("profiles-per-state") ?? process.env.PROFILES_PER_STATE, 1250),
  startUrl: args.get("start-url") ?? null,
  fromCities: args.has("from-cities"),
};

function maxPagesBudget() {
  return options.maxPages > 0 ? options.maxPages : Number.POSITIVE_INFINITY;
}

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

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const prisma = hasDatabaseUrl ? await createPrismaClient() : null;

const stats = {
  pagesFetched: 0,
  listingPages: 0,
  profilePages: 0,
  profileLinksDiscovered: 0,
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

function toMirrorUrl(originalUrl) {
  return `${JINA_PREFIX}${originalUrl.replace(/^https?:\/\//i, "")}`;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function cleanText(input) {
  return String(input ?? "")
    .replace(/\*\*/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function parseLocationFromTitle(titleLine) {
  // Examples:
  // "Bianca, Age:  25, blonde | Female Elite Escort Near You in Miami Florida, FL - Eros.com"
  const inMatch = titleLine.match(/\bin\s+([A-Za-z\s'.-]+?)\s+([A-Za-z]{2})(?:\s|-|$)/i);
  if (!inMatch) return { city: null, state: null };
  return {
    city: cleanText(inMatch[1]),
    state: cleanText(inMatch[2]).toUpperCase(),
  };
}

async function fetchMirrorText(url, timeoutMs = 30000, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(toMirrorUrl(url), {
        method: "GET",
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; laboutiquevip-eros-full-import/1.0)",
        },
      });

      if (response.status === 429) {
        const raw = await response.text();
        let waitMs = 9000;
        try {
          const parsed = JSON.parse(raw);
          const retrySec = Number(parsed?.retryAfter ?? 8);
          if (Number.isFinite(retrySec) && retrySec > 0) waitMs = retrySec * 1000 + 500;
        } catch {
          // keep default wait
        }
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) return null;
      return await response.text();
    } catch {
      // retry
      await sleep(1200 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function extractAllLinks(markdown) {
  const links = [];

  for (const m of markdown.matchAll(/\((https?:\/\/[^)\s]+)\)/gi)) {
    links.push(m[1]);
  }
  for (const m of markdown.matchAll(/\bhttps?:\/\/[^\s)]+/gi)) {
    links.push(m[0]);
  }

  return unique(
    links
      .map((x) => x.replace(/[),.;]+$/, ""))
      .map((x) => normalizeUrl(x))
      .filter(Boolean),
  );
}

function isErosDomain(url) {
  return /^https?:\/\/(?:www|trans|massage)\.eros\.com\//i.test(url);
}

function isProfileUrl(url) {
  return /\/files\/\d+\.htm(?:\?|$)/i.test(url) && isErosDomain(url);
}

function isListingLikeUrl(url) {
  return (
    isErosDomain(url) &&
    !isProfileUrl(url) &&
    !/\/(privacy|terms|about|contact|disclaimer|report)/i.test(url)
  );
}

function parseProfile(markdown, sourceUrl) {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim());
  const titleLine =
    lines.find((line) => /^#\s+.+Eros\.com/i.test(line))?.replace(/^#\s+/, "") ??
    lines.find((line) => /Eros\.com/i.test(line)) ??
    "";

  let displayName =
    lines.find((line) => /^#\s+/.test(line) && !/Eros\.com/i.test(line))?.replace(/^#\s+/, "") ??
    lines.find((line) => /^####\s+/.test(line))?.replace(/^####\s+/, "") ??
    null;

  if (displayName) {
    displayName = cleanText(displayName.replace(/^VIP\s+/i, ""));
  }

  const tagline =
    lines.find((line) => /^###\s+/.test(line))?.replace(/^###\s+/, "").trim() ?? null;

  const phoneRaw =
    markdown.match(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/)?.[0] ?? null;
  const phone = normalizePhone(phoneRaw);

  const email = markdown.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null;

  const cityStateLine =
    lines.find((line) => /Escort in|Trans in|Massage in/i.test(line)) ?? "";
  const cityFromLine = cityStateLine.match(/\b(?:Escort|Trans|Massage)\s+in\s+([A-Za-z\s'.-]+)/i)?.[1] ?? null;

  const fromTitle = parseLocationFromTitle(titleLine);
  const fromUrl = parseErosLocationFromUrl(sourceUrl);
  const eros_state_wide = isErosStateWideHub(sourceUrl) || Boolean(fromUrl.stateWide);

  let location_city = cleanText(cityFromLine ?? fromTitle.city ?? fromUrl.city ?? "") || null;
  const location_state = resolveErosLocationState({
    location_state: fromTitle.state,
    location_city: eros_state_wide ? null : location_city,
    verification_url: sourceUrl,
  });
  if (eros_state_wide) location_city = "Statewide";

  const ageRaw = markdown.match(/\bAge[:\s]+(\d{2})\b/i)?.[1] ?? markdown.match(/\nAge\s*\n\s*(\d{2})\b/i)?.[1];
  const ageNum = ageRaw ? Number(ageRaw) : null;
  const age = ageNum && ageNum >= 18 && ageNum <= 99 ? ageNum : null;

  const imageCandidates = unique(
    [...markdown.matchAll(/https?:\/\/(?:i|[a-z0-9-]+)\.eros\.com\/(?:i|profile)\/[^\s)]+/gi)].map((m) => m[0]),
  );
  const photos = imageCandidates.slice(0, MAX_PROVIDER_PHOTOS);

  const details = [];
  for (const key of ["Ethnicity", "Hair Color", "Eye color", "Availability", "Available to"]) {
    const rx = new RegExp(`\\b${key}\\s*\\n\\s*([^\\n]+)`, "i");
    const val = markdown.match(rx)?.[1];
    if (val) details.push(cleanText(`${key}: ${val}`));
  }

  const bioParts = [tagline, ...details].filter(Boolean);
  const bio = bioParts.length ? bioParts.join(" | ") : null;

  return {
    sourceUrl,
    display_name: displayName,
    tagline: tagline ?? null,
    bio,
    location_city,
    location_state,
    eros_state_wide,
    age,
    phone,
    email,
    photos,
  };
}

async function findExistingByErosUrl(sourceUrl) {
  return findExistingErosProvider(prisma, sourceUrl);
}

function buildProviderPayload(profile, existing = null) {
  const mergedPhotos = unique([
    ...(Array.isArray(existing?.photos) ? existing.photos : []),
    ...(Array.isArray(profile.photos) ? profile.photos : []),
  ]).slice(0, MAX_PROVIDER_PHOTOS);

  const existingSocial = existing?.social_media && typeof existing.social_media === "object"
    ? existing.social_media
    : {};

  const eros_state_wide = Boolean(profile.eros_state_wide);

  return {
    display_name: profile.display_name ?? existing?.display_name ?? "Unknown",
    tagline: profile.tagline ?? existing?.tagline ?? null,
    bio: profile.bio ?? existing?.bio ?? null,
    location_city: eros_state_wide
      ? "Statewide"
      : (profile.location_city ?? existing?.location_city ?? null),
    location_state: profile.location_state ?? existing?.location_state ?? null,
    age: profile.age ?? existing?.age ?? null,
    phone: profile.phone ?? existing?.phone ?? null,
    email: profile.email ?? existing?.email ?? null,
    photos: mergedPhotos,
    verification_provider: "eros",
    verification_url: profile.sourceUrl,
    social_media: mergeImportedSocial(existingSocial, profile.socialExtract, {
      eros_profile: profile.sourceUrl,
      eros_source: "r.jina.ai",
      eros_state_wide,
    }),
    ad_headline: profile.tagline ?? existing?.ad_headline ?? profile.display_name ?? null,
    ad_body: profile.bio ?? existing?.ad_body ?? null,
    status: existing?.status ?? "active",
    is_verified: existing?.is_verified ?? true,
    is_profile_approved: existing?.is_profile_approved ?? true,
    ...mergeVerificationFields(existing, profile.verification),
  };
}

async function importProfile(profile, markdown = "") {
  if (!profile.display_name || (!profile.phone && !profile.email)) {
    stats.skipped += 1;
    return;
  }

  if (!prisma && options.dryRun) {
    stats.created += 1;
    return;
  }
  if (!prisma) throw new Error("DATABASE_URL is required for live import.");

  const contactExtract = extractContactAndSocialFromMarkdown(markdown);
  profile.phone = profile.phone || contactExtract.phone;
  profile.email = profile.email || contactExtract.email;
  profile.socialExtract = contactExtract.social_media;

  const existing = await findExistingByErosUrl(profile.sourceUrl);
  profile.verification = await resolveProviderVerification({
    phone: profile.phone,
    email: profile.email,
    markdown,
  });

  if (!passesImportGate(existing, profile.verification)) {
    stats.skippedNoVerification += 1;
    return;
  }

  if (existing) {
    stats.updated += 1;
    if (options.dryRun) return;
    const data = buildProviderPayload(profile, existing);
    await prisma.provider.update({ where: { id: existing.id }, data });
    return;
  }

  stats.created += 1;
  if (options.dryRun) return;
  const data = buildProviderPayload(profile, null);
  await prisma.provider.create({
    data: {
      ...data,
      is_premium: false,
    },
  });
}

async function fetchCityHubs() {
  const text = await fetchMirrorText("https://www.eros.com/sitemap-cities.xml");
  if (!text) return [];
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

function listingUrlsForHub(hub) {
  const seeds = [];
  for (const host of ["www.eros.com", "trans.eros.com", "massage.eros.com"]) {
    if (hub.state === hub.city) {
      seeds.push(`https://${host}/${hub.state}/${hub.state}_escorts.htm`);
    } else {
      seeds.push(`https://${host}/${hub.state}/${hub.city}/${hub.city}_escorts.htm`);
    }
  }
  return seeds;
}

function profileLimitForHub(hub) {
  const raw = hub.state === hub.city ? options.profilesPerState : options.profilesPerCity;
  return effectiveLimit(raw);
}

function urlBelongsToHub(url, hub) {
  const u = String(url).toLowerCase();
  if (hub.state === hub.city) {
    return (
      u.includes(`/${hub.state}/${hub.state}/`) ||
      u.includes(`/${hub.state}/${hub.state}_escorts`) ||
      u.includes(`/${hub.state}/files/`)
    );
  }
  return u.includes(`/${hub.state}/${hub.city}/`);
}

async function crawlProfilesForHub(hub, profileLimit, maxPagesBudget) {
  const queue = listingUrlsForHub(hub)
    .map((seed) => normalizeUrl(seed))
    .filter(Boolean);
  const visited = new Set();
  const profileUrls = new Set();

  while (queue.length > 0 && visited.size < maxPagesBudget && profileUrls.size < profileLimit) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    if (!urlBelongsToHub(url, hub) && !isProfileUrl(url)) continue;
    visited.add(url);

    const text = await fetchMirrorText(url);
    stats.pagesFetched += 1;
    if (!text) {
      stats.errors += 1;
      continue;
    }

    const links = extractAllLinks(text);
    for (const link of links) {
      if (!urlBelongsToHub(link, hub) && !isProfileUrl(link)) continue;

      if (isProfileUrl(link)) {
        if (!profileUrls.has(link) && profileUrls.size < profileLimit) {
          profileUrls.add(link);
          stats.profileLinksDiscovered += 1;
        }
        continue;
      }
      if (isListingLikeUrl(link) && !visited.has(link)) {
        queue.push(link);
      }
    }

    if (isProfileUrl(url)) {
      stats.profilePages += 1;
    } else {
      stats.listingPages += 1;
    }

    await sleep(options.delayMs);
  }

  return [...profileUrls];
}

async function fetchCityListingSeeds() {
  const hubs = await fetchCityHubs();
  const seeds = [];
  for (const hub of hubs) {
    seeds.push(...listingUrlsForHub(hub));
  }
  return seeds;
}

async function crawlProfileUrls() {
  if (options.startUrl) {
    return crawlProfilesLegacy([options.startUrl]);
  }

  if (options.fromCities) {
    const hubs = await fetchCityHubs();
    if (hubs.length === 0) {
      return crawlProfilesLegacy([
        "https://www.eros.com/",
        "https://trans.eros.com/",
        "https://massage.eros.com/",
      ]);
    }

    console.log(
      `[import-eros] city hubs: ${hubs.length} (cap ${formatCap(options.profilesPerCity)}/city, ${formatCap(options.profilesPerState)}/state)`,
    );

    const allProfileUrls = new Set();
    const totalPageBudget = maxPagesBudget();

    for (const hub of hubs) {
      const remainingPages =
        totalPageBudget === Number.POSITIVE_INFINITY
          ? Number.POSITIVE_INFINITY
          : Math.max(0, options.maxPages - stats.pagesFetched);
      if (remainingPages !== Number.POSITIVE_INFINITY && remainingPages <= 0) break;

      const limit = profileLimitForHub(hub);
      const profiles = await crawlProfilesForHub(hub, limit, remainingPages);
      for (const url of profiles) allProfileUrls.add(url);
      if (profiles.length > 0) {
        const limitLabel = Number.isFinite(limit) ? String(limit) : "unlimited";
        console.log(`[import-eros] hub ${hub.state}/${hub.city}: ${profiles.length}/${limitLabel} profiles`);
      }
    }

    return [...allProfileUrls];
  }

  return crawlProfilesLegacy([
    "https://www.eros.com/",
    "https://trans.eros.com/",
    "https://massage.eros.com/",
  ]);
}

async function crawlProfilesLegacy(seeds) {
  const queue = [];
  const visited = new Set();
  const profileUrls = new Set();

  console.log(`[import-eros] crawl seeds: ${seeds.length}`);

  for (const seed of seeds) {
    const normalized = normalizeUrl(seed);
    if (normalized) queue.push(normalized);
  }

  while (queue.length > 0 && visited.size < maxPagesBudget()) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);

    const text = await fetchMirrorText(url);
    stats.pagesFetched += 1;
    if (!text) {
      stats.errors += 1;
      continue;
    }

    const links = extractAllLinks(text);
    for (const link of links) {
      if (isProfileUrl(link)) {
        if (!profileUrls.has(link)) {
          profileUrls.add(link);
          stats.profileLinksDiscovered += 1;
        }
        if (!visited.has(link)) {
          queue.push(link);
        }
        continue;
      }
      if (isListingLikeUrl(link) && !visited.has(link)) {
        queue.push(link);
      }
    }

    if (isProfileUrl(url)) {
      stats.profilePages += 1;
    } else {
      stats.listingPages += 1;
    }

    await sleep(options.delayMs);
  }

  return [...profileUrls];
}

async function run() {
  const startedAt = Date.now();
  console.log(
    `[import-eros] start dryRun=${options.dryRun} maxPages=${formatCap(options.maxPages)} maxProfiles=${formatCap(options.maxProfiles)} ` +
      `profilesPerCity=${formatCap(options.profilesPerCity)} profilesPerState=${formatCap(options.profilesPerState)} db=${hasDatabaseUrl ? "on" : "off"}`,
  );

  if (!prisma && !options.dryRun) throw new Error("DATABASE_URL is required for live import mode.");

  const profileUrls = await crawlProfileUrls();
  let toProcess = profileUrls;
  if (options.maxProfiles > 0) toProcess = toProcess.slice(0, options.maxProfiles);

  console.log(`[import-eros] profile URLs discovered: ${profileUrls.length}; processing: ${toProcess.length}`);

  for (const profileUrl of toProcess) {
    try {
      const markdown = await fetchMirrorText(profileUrl);
      if (!markdown) {
        stats.errors += 1;
        continue;
      }
      stats.profilePages += 1;
      const profile = parseProfile(markdown, profileUrl);
      stats.profilesParsed += 1;
      await importProfile(profile, markdown);
    } catch (err) {
      stats.errors += 1;
      console.error(`[import-eros] error ${profileUrl}: ${String(err)}`);
    }
    await sleep(options.delayMs);
  }

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log("[import-eros] complete", { ...stats, elapsedSeconds: elapsed });
}

run()
  .catch((err) => {
    console.error("[import-eros] fatal", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
