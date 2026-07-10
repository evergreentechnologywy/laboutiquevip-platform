#!/usr/bin/env node
/**
 * Eros full importer for laboutiquevip.net
 *
 * Uses r.jina.ai mirror pages to avoid direct anti-bot blocking when
 * crawling eros.com/trans.eros.com/massage.eros.com listing + profile URLs.
 *
 * Discovery order (mirrored hub galleries are JS-rendered; listing pages alone
 * expose only ~10 static footer links):
 *   1. sitemap-profiles-N.xml — full profile inventory, filtered per hub
 *   2. sitemap-sections.xml section pages (~96 links each) on www/trans/massage
 *   3. Hub listing seeds + ?page=N pagination + ?cat=N category pages
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
import { parseErosProfileDetails } from "./lib/eros-profile-parse.mjs";
import {
  extractContactAndSocialFromMarkdown,
  mergeImportedSocial,
} from "./lib/extract-social-links.mjs";
import {
  mergeVerificationFields,
  passesImportGate,
  providerHasVerificationBadge,
  resolveProviderVerification,
  shouldSoftGate,
} from "./lib/verification-match.mjs";
import {
  appendCacheRecord,
  defaultDatedCacheDir,
  initCacheDir,
  resolveCacheDir,
} from "./lib/catalog-scan-cache.mjs";
import { uploadSourcePhotosToR2, getPublicBase, getKeyPrefix } from "./lib/r2-photo-upload.mjs";
import pkgS3 from "@aws-sdk/client-s3";
import { effectiveLimit, formatCap, parseImportLimit } from "./lib/import-limits.mjs";
import {
  catalogSeenTouchFields,
  findCatalogDuplicateInCity,
  shouldSkipCatalogInsert,
} from "./lib/catalog-sync-policy.mjs";

const MAX_PROVIDER_PHOTOS = 48;
const JINA_PREFIX = "https://r.jina.ai/http://";

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

const options = {
  dryRun: args.has("dry-run"),
  discoverOnly: args.has("discover-only"),
  cacheOnly,
  cacheDir,
  delayMs: Number(args.get("delay-ms") ?? "600"),
  maxPages: parseImportLimit(args.get("max-pages") ?? process.env.EROS_MAX_PAGES, 15000),
  maxProfiles: parseImportLimit(args.get("max-profiles"), 0),
  profilesPerCity: parseImportLimit(args.get("profiles-per-city") ?? process.env.PROFILES_PER_CITY, 250),
  profilesPerState: parseImportLimit(args.get("profiles-per-state") ?? process.env.PROFILES_PER_STATE, 1250),
  startUrl: args.get("start-url") ?? null,
  fromCities: args.has("from-cities"),
  // --hubs=florida/miami,carolinas/carolinas — bound a --from-cities run to specific hubs
  hubs: (args.get("hubs") ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
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
  cached: 0,
  skipped: 0,
  skippedNoVerification: 0,
  verificationCacheHits: 0,
  photosUploaded: 0,
  photosFailed: 0,
  errors: 0,
};

let _s3Client = null;
function getS3Client() {
  if (_s3Client) return _s3Client;
  const endpoint = process.env.S3_ENDPOINT || process.env.CF_R2_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId) return null;
  _s3Client = new pkgS3.S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
  return _s3Client;
}

async function uploadPhotos(providerId, sourceUrls, dryRun = false) {
  const s3 = getS3Client();
  if (!s3 || !sourceUrls?.length) return [];
  const bucket = process.env.S3_BUCKET || process.env.CF_R2_BUCKET || "laboutiquevip";
  try {
    const result = await uploadSourcePhotosToR2({
      s3, bucket, providerId, sourceUrls,
      maxPhotos: MAX_PROVIDER_PHOTOS, dryRun,
    });
    const r2Urls = result.photoUrls || result;
    stats.photosUploaded += r2Urls.length;
    return r2Urls;
  } catch (err) {
    stats.photosFailed += sourceUrls.length;
    console.warn(`[import-eros] R2 upload failed for ${providerId}: ${err.message}`);
    return [];
  }
}

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
  const inMatch = titleLine.match(/\bin\s+([A-Za-z\s'.-]+?)\s+([A-Za-z]{2})(?:\s|-|$)/i);
  if (!inMatch) return { city: null, state: null };
  return {
    city: cleanText(inMatch[1]),
    state: cleanText(inMatch[2]).toUpperCase(),
  };
}

function mirrorResponseLooksBad(text) {
  return (
    !text ||
    /^Warning: Target URL returned error \d+/m.test(text) ||
    /\bSITEMAP_FETCH_ERROR\b/.test(text)
  );
}

async function fetchDirectText(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; laboutiquevip-eros-full-import/1.0)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMirrorText(url, timeoutMs = 30000, attempts = 5) {
  return _fetchMirrorText(url, timeoutMs, attempts, false);
}

async function fetchSitemapMirrorText(url, timeoutMs = 30000, attempts = 5) {
  return _fetchMirrorText(url, timeoutMs, attempts, true);
}

async function _fetchMirrorText(url, timeoutMs, attempts, isSitemap) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const fetchUrl = isSitemap ? url : toMirrorUrl(url);
      const response = await fetch(fetchUrl, {
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

      if (!response.ok) break;
      const text = await response.text();
      if (mirrorResponseLooksBad(text)) break;
      return text;
    } catch {
      await sleep(1200 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  // Fallback: try direct fetch when Jina mirror fails
  const direct = await fetchDirectText(url, timeoutMs);
  if (direct && !mirrorResponseLooksBad(direct)) return direct;
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

  // Phone: broader patterns including spaced formats and label:value
  const phoneRaw =
    markdown.match(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/)?.[0] ??
    markdown.match(/(?:phone|call|text|tel)[:\s]*([+()0-9.\-\s]{10,})/i)?.[1] ??
    null;
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

  // Photos: broader CDN patterns — i.eros.com, cdne, dimension URLs
  const imageCandidates = unique([
    ...markdown.matchAll(/https?:\/\/(?:i|[a-z0-9-]+)\.eros\.com\/(?:i|profile|img|images)\/[^\s)]+/gi),
    ...markdown.matchAll(/https?:\/\/cdne\.eros\.com\/[^\s)]+/gi),
    ...markdown.matchAll(/https?:\/\/[^\s)]+\.eros\.com\/\d+x\d+\/[^\s)]+/gi),
  ].map((m) => m[0]));
  // Eros galleries are oldest-first; newest first for display and R2 order
  const photos = imageCandidates.reverse().slice(0, MAX_PROVIDER_PHOTOS);

  // Rate extraction from profile text
  const rateMatches = [...markdown.matchAll(/(?:rate|hour|hr|donation|incall|outcall)[:\s]*\$?(\d{2,4})/gi)];
  const rates = rateMatches.map(m => Number(m[1])).filter(n => n >= 50 && n <= 5000);
  const rate_hourly = rates.length > 0 ? Math.min(...rates) : null;

  // Parse structured details via the profile parser (bio, tags, stats)
  const parsedDetails = parseErosProfileDetails(markdown);

  // Bio: prefer the parsed description (real body text).
  // Fall back to tagline only — never concatenate stats as a bio.
  const bio = parsedDetails.description ?? tagline ?? null;

  return {
    sourceUrl,
    display_name: displayName,
    tagline: parsedDetails.tagline ?? tagline ?? null,
    bio,
    location_city,
    location_state,
    eros_state_wide,
    age,
    phone,
    email,
    photos,
    ethnicity: parsedDetails.ethnicity,
    hair_color: parsedDetails.hair_color,
    eye_color: parsedDetails.eye_color,
    height: parsedDetails.height,
    body_type: parsedDetails.body_type,
    service_type: parsedDetails.service_type,
    services_offered: parsedDetails.services_offered,
    rate_hourly,
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
    ethnicity: profile.ethnicity ?? existing?.ethnicity ?? null,
    hair_color: profile.hair_color ?? existing?.hair_color ?? null,
    eye_color: profile.eye_color ?? existing?.eye_color ?? null,
    height: profile.height ?? existing?.height ?? null,
    body_type: profile.body_type ?? existing?.body_type ?? null,
    service_type: profile.service_type ?? existing?.service_type ?? null,
    services_offered: profile.services_offered ?? existing?.services_offered ?? null,
    phone: profile.phone ?? existing?.phone ?? null,
    email: profile.email ?? existing?.email ?? null,
    photos: mergedPhotos,
    rate_hourly: profile.rate_hourly ?? existing?.rate_hourly ?? null,
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
    is_profile_approved: profile.verification?.importAllowed !== false
      ? (existing?.is_profile_approved ?? true)
      : false,
    ...mergeVerificationFields(existing, profile.verification),
    ...catalogSeenTouchFields(existing),
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
  const cachedBadge = providerHasVerificationBadge(existing);
  if (cachedBadge) stats.verificationCacheHits += 1;
  profile.verification = await resolveProviderVerification({
    phone: profile.phone,
    email: profile.email,
    markdown,
    includeApiLookup: !cachedBadge,
  });

  if (!passesImportGate(existing, profile.verification)) {
    if (!shouldSoftGate(profile.verification)) {
      stats.skippedNoVerification += 1;
      return;
    }
  }

  const data = buildProviderPayload(profile, existing ?? null);

  if (options.cacheOnly && options.cacheDir) {
    appendCacheRecord(options.cacheDir, "eros", {
      source: "eros",
      sourceUrl: profile.sourceUrl,
      existingId: existing?.id ?? null,
      payload: data,
      scrapedAt: new Date().toISOString(),
    });
    stats.cached += 1;
    if (existing) stats.updated += 1;
    else stats.created += 1;
    return;
  }

  if (existing) {
    stats.updated += 1;
    if (options.dryRun) return;
    const providerId = existing.id;
    await prisma.provider.update({ where: { id: providerId }, data });
    // Upload photos on update if source URLs changed
    if (profile.photos?.length && profile.photos !== existing.photos) {
      const r2Urls = await uploadPhotos(providerId, profile.photos, false);
      if (r2Urls.length) {
        await prisma.provider.update({ where: { id: providerId }, data: { photos: r2Urls } });
      }
    }
    return;
  }

  const duplicateInCity = await findCatalogDuplicateInCity(prisma, {
    verification_provider: "eros",
    verification_url: profile.sourceUrl,
    display_name: data.display_name,
    location_city: data.location_city,
    location_state: data.location_state,
  });
  if (duplicateInCity && shouldSkipCatalogInsert(data, duplicateInCity)) {
    stats.skipped += 1;
    if (!options.dryRun) {
      await prisma.provider.update({
        where: { id: duplicateInCity.id },
        data: catalogSeenTouchFields(duplicateInCity),
      });
    }
    return;
  }

  stats.created += 1;
  if (options.dryRun) return;
  const created = await prisma.provider.create({
    data: {
      ...data,
      is_premium: false,
    },
  });
  // Upload photos immediately on creation — only overwrite if R2 succeeds
  if (profile.photos?.length) {
    const r2Urls = await uploadPhotos(created.id, profile.photos, false);
    if (r2Urls.length) {
      await prisma.provider.update({ where: { id: created.id }, data: { photos: r2Urls } });
    }
    // DB already has CDN URLs from create — keep them if R2 failed
  }
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

const PROFILE_URL_RE = /https?:\/\/(?:www|trans|massage)\.eros\.com\/[a-z0-9_/-]+\/files\/\d+\.htm/gi;
const SECTION_URL_RE = /https?:\/\/(?:www|trans|massage)\.eros\.com\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)?\/sections\/[a-z0-9_-]+\.htm/gi;
const MAX_PROFILE_SITEMAP_SHARDS = 20;
const LISTING_PAGINATION_MAX = Number(process.env.EROS_LISTING_PAGINATION_MAX ?? "40");
const LISTING_CAT_MAX = Number(process.env.EROS_LISTING_CAT_MAX ?? "12");

function hubKeyForUrl(url) {
  const m = String(url).toLowerCase().match(
    /https?:\/\/(?:www|trans|massage)\.eros\.com\/([a-z0-9_-]+)(?:\/([a-z0-9_-]+))?\//i,
  );
  if (!m) return null;
  const state = m[1];
  let city = m[2] ?? state;
  if (city === "files" || city === "sections") city = state;
  return `${state}/${city}`;
}

const SITEMAP_SHARD_DELAY_MS = Number(process.env.EROS_SITEMAP_SHARD_DELAY_MS ?? "4500");

let profileSitemapPromise = null;
function fetchSitemapProfileUrls() {
  profileSitemapPromise ??= (async () => {
    const urls = new Set();
    for (let shard = 1; shard <= MAX_PROFILE_SITEMAP_SHARDS; shard += 1) {
      const text = await fetchSitemapMirrorText(`https://www.eros.com/sitemap-profiles-${shard}.xml`);
      if (!text) {
        console.warn(`[import-eros] sitemap-profiles-${shard}.xml empty — stopping shard walk`);
        break;
      }
      let found = 0;
      for (const m of text.matchAll(PROFILE_URL_RE)) {
        const normalized = normalizeUrl(m[0]);
        if (normalized && !urls.has(normalized)) {
          urls.add(normalized);
          found += 1;
        }
      }
      if (found === 0) break;
      await sleep(SITEMAP_SHARD_DELAY_MS);
    }
    console.log(`[import-eros] sitemap profile inventory: ${urls.size} urls`);
    if (urls.size === 0) {
      console.error("[import-eros] WARNING: sitemap profile inventory is 0");
    }
    return [...urls];
  })();
  return profileSitemapPromise;
}

let sectionSitemapPromise = null;
function fetchSectionPagesByHub() {
  sectionSitemapPromise ??= (async () => {
    const byHub = new Map();
    for (const host of ["www.eros.com", "trans.eros.com", "massage.eros.com"]) {
      const text = await fetchSitemapMirrorText(`https://${host}/sitemap-sections.xml`);
      if (!text) continue;
      for (const m of text.matchAll(SECTION_URL_RE)) {
        const normalized = normalizeUrl(m[0]);
        if (!normalized) continue;
        const key = hubKeyForUrl(normalized);
        if (!key) continue;
        if (!byHub.has(key)) byHub.set(key, new Set());
        byHub.get(key).add(normalized);
      }
      await sleep(SITEMAP_SHARD_DELAY_MS);
    }
    const total = [...byHub.values()].reduce((sum, set) => sum + set.size, 0);
    console.log(`[import-eros] sitemap section pages: ${total} across ${byHub.size} hubs`);
    return byHub;
  })();
  return sectionSitemapPromise;
}

function synthesizedPaginationUrls(url, maxPage = LISTING_PAGINATION_MAX) {
  const extras = [];
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("page")) return extras;
    for (let page = 2; page <= maxPage; page += 1) {
      const next = new URL(parsed.toString());
      next.searchParams.set("page", String(page));
      extras.push(next.toString());
    }
  } catch { /* unparsable */ }
  return extras;
}

function synthesizedCategoryUrls(url, maxCat = LISTING_CAT_MAX) {
  const extras = [];
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("cat")) return extras;
    for (let cat = 1; cat <= maxCat; cat += 1) {
      const next = new URL(parsed.toString());
      next.searchParams.set("cat", String(cat));
      extras.push(next.toString());
    }
  } catch { /* unparsable */ }
  return extras;
}

function extractCategoryListingUrls(markdown, hub) {
  const urls = [];
  for (const link of extractAllLinks(markdown)) {
    if (!isListingLikeUrl(link)) continue;
    if (!urlBelongsToHub(link, hub)) continue;
    try {
      const parsed = new URL(link);
      if (parsed.searchParams.has("cat")) urls.push(parsed.toString());
    } catch { /* skip */ }
  }
  return unique(urls);
}

function profileLimitForHub(hub) {
  if (hub.priority) return effectiveLimit(options.profilesPerTop5City);
  const raw = hub.state === hub.city ? options.profilesPerState : options.profilesPerCity;
  return effectiveLimit(raw);
}

function urlBelongsToHub(url, hub) {
  const u = String(url).toLowerCase();
  if (hub.state === hub.city) {
    return (
      u.includes(`/${hub.state}/`) &&
      !/\/(privacy|terms|about|contact|disclaimer|report)/i.test(u)
    );
  }
  return u.includes(`/${hub.state}/${hub.city}/`);
}

async function crawlProfilesForHub(hub, profileLimit, maxPagesBudget, globalProfileUrls = null) {
  const profileUrls = new Set();

  function registerProfileUrl(url) {
    if (globalProfileUrls?.has(url)) return false;
    if (profileUrls.has(url) || profileUrls.size >= profileLimit) return false;
    profileUrls.add(url);
    globalProfileUrls?.add(url);
    stats.profileLinksDiscovered += 1;
    return true;
  }

  const sitemapProfiles = await fetchSitemapProfileUrls();
  for (const url of sitemapProfiles) {
    if (profileUrls.size >= profileLimit) break;
    if (!urlBelongsToHub(url, hub)) continue;
    registerProfileUrl(url);
  }

  if (profileUrls.size >= profileLimit) return [...profileUrls];

  const sectionsByHub = await fetchSectionPagesByHub();
  const hubSections = sectionsByHub.get(`${hub.state}/${hub.city}`) ?? new Set();
  const queue = unique(
    [...listingUrlsForHub(hub), ...hubSections]
      .map((seed) => normalizeUrl(seed))
      .filter(Boolean),
  );
  const visited = new Set();

  while (queue.length > 0 && visited.size < maxPagesBudget && profileUrls.size < profileLimit) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    if (!urlBelongsToHub(url, hub) && !isProfileUrl(url)) continue;
    visited.add(url);

    const text = await fetchMirrorText(url);
    stats.pagesFetched += 1;
    if (!text) { stats.errors += 1; continue; }

    const links = extractAllLinks(text);
    let newProfilesOnPage = 0;
    for (const link of links) {
      if (!urlBelongsToHub(link, hub) && !isProfileUrl(link)) continue;
      if (isProfileUrl(link)) {
        if (registerProfileUrl(link)) newProfilesOnPage += 1;
        continue;
      }
      if (isListingLikeUrl(link) && !visited.has(link)) queue.push(link);
    }

    for (const catUrl of extractCategoryListingUrls(text, hub)) {
      if (!visited.has(catUrl)) queue.push(catUrl);
    }

    if (newProfilesOnPage > 0 && !/[?&]page=/.test(url)) {
      for (const extra of synthesizedPaginationUrls(url)) {
        if (!visited.has(extra)) queue.push(extra);
      }
      if (!/[?&]cat=/.test(url) && !url.includes("/sections/")) {
        for (const extra of synthesizedCategoryUrls(url, 6)) {
          if (!visited.has(extra)) queue.push(extra);
        }
      }
    }

    if (isProfileUrl(url)) stats.profilePages += 1;
    else stats.listingPages += 1;

    await sleep(options.delayMs);
  }

  return [...profileUrls];
}

async function fetchCityListingSeeds() {
  const hubs = await fetchCityHubs();
  const seeds = [];
  for (const hub of hubs) seeds.push(...listingUrlsForHub(hub));
  return seeds;
}

function hubKey(hub) { return `${hub.state}/${hub.city}`; }

function top5HubKeys() {
  return new Set([
    "florida/miami", "new_york/new_york", "california/los_angeles",
    "nevada/las_vegas", "illinois/chicago",
  ]);
}

async function crawlProfileUrls() {
  if (options.startUrl) {
    return crawlProfilesLegacy([options.startUrl]);
  }

  if (options.fromCities) {
    const sitemapHubs = await fetchCityHubs();
    let hubs = sitemapHubs;

    if (options.hubs.length > 0) {
      hubs = sitemapHubs.filter((hub) => options.hubs.includes(hubKey(hub)));
    }

    const top5 = top5HubKeys();
    hubs = hubs.map((hub) => ({
      ...hub,
      priority: top5.has(hubKey(hub)),
    }));
    hubs.sort((a, b) => Number(b.priority) - Number(a.priority));

    const globalUrls = new Set();
    const allProfiles = [];

    for (const hub of hubs) {
      const limit = profileLimitForHub(hub);
      const profiles = await crawlProfilesForHub(hub, limit, maxPagesBudget(), globalUrls);
      console.log(`[import-eros] hub ${hubKey(hub)}: ${profiles.length}/${limit} profiles`);
      allProfiles.push(...profiles);
      if (options.maxProfiles > 0 && allProfiles.length >= options.maxProfiles) break;
    }

    return allProfiles;
  }

  const seeds = await fetchCityListingSeeds();
  return crawlProfilesLegacy(seeds);
}

async function crawlProfilesLegacy(seedUrls) {
  const profileUrls = new Set();
  const queue = [...seedUrls.map((s) => normalizeUrl(s)).filter(Boolean)];
  const visited = new Set();

  while (queue.length > 0 && visited.size < maxPagesBudget() && profileUrls.size < (options.maxProfiles || Infinity)) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);

    const text = await fetchMirrorText(url);
    stats.pagesFetched += 1;
    if (!text) { stats.errors += 1; continue; }

    for (const link of extractAllLinks(text)) {
      if (isProfileUrl(link) && !profileUrls.has(link)) {
        profileUrls.add(link);
        stats.profileLinksDiscovered += 1;
      } else if (isListingLikeUrl(link) && !visited.has(link)) {
        queue.push(link);
      }
    }

    if (isProfileUrl(url)) stats.profilePages += 1;
    else stats.listingPages += 1;

    await sleep(options.delayMs);
  }

  return [...profileUrls];
}

async function main() {
  console.log(`[import-eros] start fromCities=${options.fromCities} hubs=${options.hubs.length || "all"} ` +
    `profilesPerCity=${formatCap(options.profilesPerCity)} profilesPerState=${formatCap(options.profilesPerState)} ` +
    `maxPages=${formatCap(options.maxPages)} maxProfiles=${formatCap(options.maxProfiles)} ` +
    `dryRun=${options.dryRun} cacheOnly=${options.cacheOnly} photos=${MAX_PROVIDER_PHOTOS}`);

  if (options.cacheOnly && options.cacheDir) initCacheDir(options.cacheDir);

  let profileUrls = await crawlProfileUrls();
  if (options.maxProfiles > 0) profileUrls = profileUrls.slice(0, options.maxProfiles);

  console.log(`[import-eros] profile URLs to import: ${profileUrls.length}`);

  if (options.discoverOnly) {
    for (const url of profileUrls) console.log(url);
    return;
  }

  for (const profileUrl of profileUrls) {
    await sleep(options.delayMs);
    const text = await fetchMirrorText(profileUrl);
    if (!text) { stats.errors += 1; continue; }

    const profile = parseProfile(text, profileUrl);
    if (!profile || !profile.display_name) { stats.skipped += 1; continue; }
    stats.profilesParsed += 1;

    await importProfile(profile, text);
  }

  console.log("[import-eros] complete:", stats);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});