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
import { uploadSourcePhotosToR2 } from "./lib/r2-photo-upload.mjs";
import pkgS3 from "@aws-sdk/client-s3";
import {
  mergeVerificationFields,
  passesImportGate,
  providerHasVerificationBadge,
  resolveProviderVerification,
  shouldSoftGate,
} from "./lib/verification-match.mjs";
import {
  catalogSeenTouchFields,
  findCatalogDuplicateInCity,
  shouldSkipCatalogInsert,
} from "./lib/catalog-sync-policy.mjs";

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
const statesArg = args.get("states") ?? process.env.TRYST_STATES ?? null;
const filteredStates = statesArg ? statesArg.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : null;
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
    region: "auto", endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
  return _s3Client;
}

async function uploadPhotos(providerId, sourceUrls) {
  const s3 = getS3Client();
  if (!s3 || !sourceUrls?.length) return [];
  try {
    return await uploadSourcePhotosToR2({
      s3, bucket: process.env.S3_BUCKET || "laboutiquevip", providerId, sourceUrls,
      maxPhotos: 48,
    });
  } catch { return []; }
}

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
    const timer = setTimeout(() => controller.abort(), 45000);
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


const INVALID_TRYST_CITY_RE = /^(caters\s*to|additional\s*fee|see\s*you\s*soon|statewide|available|today|this\s*week|last\s*week|incall|outcall|donations?|rates?|services?|phone|email|website|menu|search|login|signup)\b/i;

function isPlausibleTrystCity(value) {
  const city = String(value || "").trim();
  if (city.length < 2 || city.length > 40) return false;
  if (INVALID_TRYST_CITY_RE.test(city)) return false;
  if (/[🎰😘💋🔥❤️]/.test(city)) return false;
  if (/https?:|www\./i.test(city)) return false;
  if (/^[^a-zA-Z]*$/.test(city)) return false;
  // Reject sentence fragments
  if (/\b(the|and|with|your|from|that|this|have|will|please)\b/i.test(city) && city.includes(" ")) return false;
  return true;
}

function parseCityStateFromTrystText(markdown) {
  // Canonical Tryst card format: "Miami, FL, US"
  const matches = [...String(markdown || "").matchAll(/\b([A-Z][A-Za-z .'\-]{1,40}),\s*([A-Z]{2}),\s*US\b/g)];
  for (const m of matches) {
    const city = m[1].trim();
    const state = m[2].trim().toUpperCase();
    if (isPlausibleTrystCity(city)) return { city, state };
  }
  return { city: null, state: null };
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

  // Prefer canonical Tryst "City, ST, US" (avoid matching the word "location" in bios,
  // which previously produced junk cities like "Caters to").
  const fromCard = parseCityStateFromTrystText(markdown);
  let location_city = fromCard.city;
  let location_state = fromCard.state;

  if (!location_city || !location_state) {
    const locationLine = markdown.match(/(?:located in|based in)\s*[:\-]?\s*([^\n|]+)/i);
    if (locationLine) {
      let raw = locationLine[1]
        .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/(?:https?|ftp):\/\/[^\s)]+/gi, "")
        .replace(/\|/g, ", ")
        .replace(/\s+/g, " ");
      const parts = raw.split(",").map((p) => cleanText(p)).filter(Boolean);
      if (!location_city && isPlausibleTrystCity(parts[0])) location_city = parts[0];
      const stateCandidate = parts[1]?.trim().replace(/[^a-zA-Z\s]/g, "").trim();
      const validStates = new Set(["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"]);
      if (!location_state && stateCandidate && stateCandidate.length === 2 && validStates.has(stateCandidate.toUpperCase())) {
        location_state = stateCandidate.toUpperCase();
      }
    }
  }
  if (location_city && !isPlausibleTrystCity(location_city)) location_city = null;

  // Extract only actual profile content — strip site boilerplate
  const bio = extractTrystBio(markdown, displayName);

  // Age / stats extraction
  const ageMatch = markdown.match(/\b(\d{2})\s*(?:years|yrs|yo)\b/i);
  const age = ageMatch ? Number(ageMatch[1]) : null;

  // Ethnicity / hair / body type
  const ethnicityMatch = markdown.match(/(?:ethnicity|race)[:\s]*([^\n|]+)/i);
  const hairMatch = markdown.match(/(?:hair|hair color)[:\s]*([^\n|]+)/i);
  const bodyMatch = markdown.match(/(?:body|body type|build|figure)[:\s]*([^\n|]+)/i);
  const heightMatch = markdown.match(/(?:height)[:\s]*(\d['"]?\s*\d*)/i);

  // Rate extraction
  const rateMatches = [...markdown.matchAll(/(?:rate|donation|hour|hr|incall|outcall)[:\s]*\$?(\d{2,4})/gi)];
  const rates = rateMatches.map(m => Number(m[1])).filter(n => n >= 50 && n <= 5000);
  const rate_hourly = rates.length > 0 ? Math.min(...rates) : null;

  return {
    slug,
    displayName,
    sourceUrl: profileUrl,
    phone: phoneMatch ? phoneMatch[1].replace(/\D/g, "").slice(-10) : null,
    email: emailMatch ? emailMatch[1].toLowerCase() : null,
    photos,
    location_city,
    location_state,
    bio,
    age: age && age >= 18 && age <= 99 ? age : null,
    ethnicity: ethnicityMatch ? cleanText(ethnicityMatch[1]) : null,
    hair_color: hairMatch ? cleanText(hairMatch[1]) : null,
    body_type: bodyMatch ? cleanText(bodyMatch[1]) : null,
    height: heightMatch ? cleanText(heightMatch[1]) : null,
    rate_hourly,
  };
}

/**
 * Extract only the actual provider-written bio from Tryst markdown,
 * stripping navigation menus, footer links, and site boilerplate.
 */
function extractTrystBio(markdown, displayName) {
  const lines = markdown.split(/\r?\n/);

  // Boilerplate patterns that signal site chrome (not profile content)
  const boilerplatePhrases = [
    /^Skip to content/i,
    /^\* Search/i,
    /^\* Log in/i,
    /^\* Sign up/i,
    /^\* Menu/i,
    /^Membership & Pricing/i,
    /^TLC donation matching/i,
    /^Tryst Blog/i,
    /^Good Client Guide/i,
    /^Sex work FAQ/i,
    /^Tryst\.link FAQ/i,
    /^Knowledge Base/i,
    /^Contact Tryst Support/i,
    /^Feedback/i,
    /^About$/i,
    /^Resources$/i,
    /^Platform$/i,
    /^Locations$/i,
    /^\* \[.*?\]\(.*?tryst\.link\/.*?(?:pricing|faq|blog|support|feedback|about|resources)/i,
    /^Report/i,
    /^© /i,
    /^Privacy/i,
    /^Terms/i,
    /^Cookie/i,
    /^\[.*?logo.*?\]/i,
    /^Back to top/i,
    /^Share this/i,
    /^Follow us/i,
  ];

  // Find where actual content starts (after the H1 title)
  let contentStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^#\s+/) && lines[i].toLowerCase().includes(displayName?.toLowerCase()?.slice(0,5) || "")) {
      contentStart = i + 1;
      break;
    }
  }

  // Collect lines until we hit boilerplate or end of useful content
  const bioLines = [];
  for (let i = contentStart; i < Math.min(lines.length, contentStart + 60); i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Stop at boilerplate
    if (boilerplatePhrases.some(p => p.test(line))) break;
    // Stop at obvious nav/footer links
    if (/^\*\s*\[(?!.*photo|image|pic)/i.test(line) && line.length < 120) continue;
    // Skip image-only lines
    if (/^!\[.*?\]\(.*?\)$/.test(line)) continue;
    // Skip horizontal rules
    if (/^[-–—]{3,}$/.test(line)) continue;

    bioLines.push(line);
  }

  const extracted = cleanText(bioLines.join(" "));
  // If we got nothing useful, try a simpler approach — grab everything after the title,
  // up to the first boilerplate hit, max 800 chars
  if (extracted.length < 20) {
    const afterTitle = markdown.split(/^#\s+.+$/m).slice(1).join(" ").slice(0, 800);
    return cleanText(afterTitle) || null;
  }

  return extracted.slice(0, 800) || null;
}

async function upsertTrystProvider(profile, cityMeta, markdown = "") {
  if (!prisma) {
    stats.skipped += 1;
    return;
  }

  const location_city = (profile.location_city && isPlausibleTrystCity(profile.location_city))
    ? profile.location_city
    : cityMeta.cityName;
  const location_state = profile.location_state ?? cityMeta.stateAbbrev;

  const contactExtract = extractContactAndSocialFromMarkdown(markdown);
  profile.phone = profile.phone || contactExtract.phone;
  profile.email = profile.email || contactExtract.email;

  const existing = await prisma.provider.findFirst({
    where: {
      verification_provider: "tryst",
      OR: [
        { verification_url: profile.sourceUrl },
        { verification_username: profile.slug },
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
    // Soft gate: import anyway but flag as unverified
    if (!shouldSoftGate(verification)) {
      stats.skippedNoVerification += 1;
      return;
    }
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
    age: profile.age ?? existing?.age ?? null,
    ethnicity: profile.ethnicity ?? existing?.ethnicity ?? null,
    hair_color: profile.hair_color ?? existing?.hair_color ?? null,
    body_type: profile.body_type ?? existing?.body_type ?? null,
    height: profile.height ?? existing?.height ?? null,
    rate_hourly: profile.rate_hourly ?? existing?.rate_hourly ?? null,
    verification_provider: "tryst",
    verification_url: profile.sourceUrl,
    verification_username: profile.slug,
    social_media: mergeImportedSocial(
      existing?.social_media && typeof existing.social_media === "object" ? existing.social_media : {},
      contactExtract.social_media,
      { tryst_profile: profile.sourceUrl, tryst_slug: profile.slug },
    ),
    status: existing?.status ?? "active",
    is_verified: existing?.is_verified ?? true,
    is_profile_approved: verification?.importAllowed !== false
      ? (existing?.is_profile_approved ?? true)
      : false,
    ...mergeVerificationFields(existing, verification),
    ...catalogSeenTouchFields(existing),
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
    const providerId = existing.id;
    await prisma.provider.update({ where: { id: providerId }, data: payload });
    stats.updated += 1;
    // Upload photos if source URLs are new
    if (profile.photos?.length && profile.photos !== existing.photos) {
      const r2Urls = await uploadPhotos(providerId, profile.photos);
      if (r2Urls.length) {
        try { await prisma.provider.update({ where: { id: providerId }, data: { photos: r2Urls } }); } catch {}
        stats.photosUploaded += r2Urls.length;
      }
    }
  } else {
    const duplicateInCity = await findCatalogDuplicateInCity(prisma, {
      verification_provider: "tryst",
      verification_url: profile.sourceUrl,
      display_name: payload.display_name,
      location_city: payload.location_city,
      location_state: payload.location_state,
    });
    if (duplicateInCity && shouldSkipCatalogInsert(payload, duplicateInCity)) {
      stats.skipped += 1;
      await prisma.provider.update({
        where: { id: duplicateInCity.id },
        data: catalogSeenTouchFields(duplicateInCity),
      });
      return;
    }
    const created = await prisma.provider.create({ data: payload });
    stats.created += 1;
    if (profile.photos?.length) {
      const r2Urls = await uploadPhotos(created.id, profile.photos);
      if (r2Urls.length) {
        try { await prisma.provider.update({ where: { id: created.id }, data: { photos: r2Urls } }); } catch {}
        stats.photosUploaded += r2Urls.length;
      }
    }
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
    `Tryst import start pilotOnly=${pilotOnly} states=${filteredStates?.length || "all"} dryRun=${dryRun} cacheOnly=${cacheOnly} ` +
      `profilesPerCity=${formatCap(crawlLimits.maxProfilesPerCity)} ` +
      `citiesPerState=${formatCap(crawlLimits.maxCitiesPerState)}`,
  );

  const cities = await resolveTrystTargetCities({
    fullUs: !pilotOnly && !filteredStates,
    stateFilter: filteredStates,
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