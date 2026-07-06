#!/usr/bin/env node
/**
 * Eros Weekly Reconciliation Script for laboutiquevip.net
 *
 * 1. Scrapes all 82 cities listed on www.eros.com/sitemap-cities.xml
 * 2. Fetches listing pages for:
 *    - Female escorts (www.eros.com)
 *    - Trans escorts (trans.eros.com)
 *    - Massage providers (massage.eros.com)
 * 3. Extracts all active profile URLs.
 * 4. Deactivates providers no longer active on Eros.
 * 5. Scrapes and imports new active profiles into the database.
 */

import fs from 'node:fs';
import path from 'node:path';
import pkgS3 from '@aws-sdk/client-s3';
import {
  isErosStateWideHub,
  parseErosLocationFromUrl,
  resolveErosLocationState,
} from "./lib/eros-location.mjs";
import {
  hubEligibleForDeactivation,
  listingHubKeyFromUrl,
  recordHubListingAttempt,
} from "./lib/reconcile-hub.mjs";

const { S3Client, PutObjectCommand } = pkgS3;

const JINA_PREFIX = "https://r.jina.ai/http://";
const MAX_PROVIDER_PHOTOS = 32;
const EXT_BY_TYPE = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
  "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
};

const limitCities = Number(process.argv.find((a) => a.startsWith("--limit-cities="))?.split("=")[1] ?? 0);
const cityOffset = Number(process.argv.find((a) => a.startsWith("--city-offset="))?.split("=")[1] ?? 0);
const profilesPerCity = Number(process.argv.find((a) => a.startsWith("--profiles-per-city="))?.split("=")[1] ?? 50);
const profilesPerState = Number(process.argv.find((a) => a.startsWith("--profiles-per-state="))?.split("=")[1] ?? 100);
const dryRun = process.argv.includes("--dry-run");

// Load env from workspace
function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    if (!(key in process.env)) process.env[key] = rest.join("=").replace(/^"|"$/g, "");
  }
}
loadEnv("/srv/apps/trystlike/repo/.env");

const PUBLIC_BASE = process.env.S3_PUBLIC_BASE_URL || "https://www.laboutiquevip.net/api/r2-photo";
const KEY_PREFIX = process.env.S3_KEY_PREFIX || "laboutiquevip/providers";

const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function createPrismaClient() {
  try {
    const generated = await dynamicImport("/srv/apps/trystlike/repo/backend/generated/prisma-client/index.js");
    if (generated?.PrismaClient) return new generated.PrismaClient();
  } catch {
    // fallback
  }
  const runtime = await dynamicImport("@prisma/client");
  if (!runtime?.PrismaClient) throw new Error("PrismaClient not available.");
  return new runtime.PrismaClient();
}

const prisma = await createPrismaClient();

function canonicalErosProfileUrl(url) {
  return String(url ?? "")
    .trim()
    .toLowerCase()
    .replace(/\?.*$/, "");
}

function erosCityKeyFromUrl(url) {
  const match = String(url ?? "").match(
    /https?:\/\/(?:www|trans|massage)\.eros\.com\/([a-z0-9_-]+)\/([a-z0-9_-]+)\//i,
  );
  if (!match) return null;
  return `${match[1].toLowerCase()}/${match[2].toLowerCase()}`;
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

async function fetchMirrorText(url, timeoutMs = 35000, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${JINA_PREFIX}${url.replace(/^https?:\/\//i, "")}`, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; laboutiquevip-reconcile/1.0)",
          "X-No-Cache": "true",
        },
      });

      if (response.status === 429) {
        const raw = await response.text();
        let waitMs = 12000;
        try {
          const parsed = JSON.parse(raw);
          const retrySec = Number(parsed?.retryAfter ?? 10);
          if (Number.isFinite(retrySec) && retrySec > 0) waitMs = retrySec * 1000 + 500;
        } catch {
          // ignore
        }
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) return null;
      return await response.text();
    } catch {
      await sleep(1500 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
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

  const imageCandidates = [...new Set(
    [...markdown.matchAll(/https?:\/\/(?:i|[a-z0-9-]+)\.eros\.com\/(?:i|profile)\/[^\s)]+/gi)].map((m) => m[0])
  )];
  const photos = imageCandidates.reverse().slice(0, MAX_PROVIDER_PHOTOS);

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

function getS3Client() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "auto",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
}

async function uploadPhotos(s3, bucket, providerId, sourceUrls) {
  const stored = [];
  let index = 0;
  for (const sourceUrl of sourceUrls) {
    if (!/^https?:\/\/(?:i|[a-z0-9-]+)\.eros\.com\//i.test(sourceUrl)) continue;
    let imageResponse;
    try {
      imageResponse = await fetch(sourceUrl, {
        headers: { referer: "https://www.eros.com/", "user-agent": "Mozilla/5.0 (compatible; laboutiquevip-reconcile/1.0)" },
      });
    } catch {
      continue;
    }
    if (!imageResponse.ok) continue;
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
    if (!String(contentType).toLowerCase().startsWith("image/")) continue;
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    if (buffer.length < 2000) continue;

    const ext = EXT_BY_TYPE[contentType.split(";")[0].toLowerCase()] || "jpg";
    const filename = String(index).padStart(3, "0") + "." + ext;
    const key = `${KEY_PREFIX}/${providerId}/${filename}`;
    const publicUrl = `${PUBLIC_BASE}/${providerId}/${filename}`;

    try {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }));
      stored.push(publicUrl);
      index += 1;
    } catch (e) {
      console.error(`[S3 Upload Error] for provider ${providerId}:`, e.message);
    }
    if (stored.length >= MAX_PROVIDER_PHOTOS) break;
  }
  return stored;
}

function parseCityHubFromErosUrl(url) {
  const match = String(url).match(
    /https?:\/\/www\.eros\.com\/([a-z0-9_-]+)(?:\/([a-z0-9_-]+))?\/eros\.htm/i,
  );
  if (!match) return null;
  const state = match[1].toLowerCase();
  const city = (match[2] ?? match[1]).toLowerCase();
  return { state, city };
}

async function fetchCities() {
  console.log("[reconcile] Fetching city list from sitemap-cities.xml...");
  const text = await fetchMirrorText("https://www.eros.com/sitemap-cities.xml");
  if (!text) throw new Error("Failed to fetch sitemap-cities.xml");

  const seen = new Set();
  const uniqueCities = [];
  const addHub = (hub) => {
    if (!hub) return;
    const key = `${hub.state}/${hub.city}`;
    if (seen.has(key)) return;
    seen.add(key);
    uniqueCities.push(hub);
  };

  for (const m of text.matchAll(/https?:\/\/www\.eros\.com\/[^\s)\]]+\/eros\.htm/gi)) {
    addHub(parseCityHubFromErosUrl(m[0]));
  }

  // Fallback: crawl homepages for hub links if sitemap is thin
  if (uniqueCities.length < 30) {
    console.warn("[reconcile] Sitemap thin — supplementing from Eros homepages...");
    for (const seed of [
      "https://www.eros.com/",
      "https://trans.eros.com/",
      "https://massage.eros.com/",
    ]) {
      const page = await fetchMirrorText(seed);
      if (!page) continue;
      for (const m of page.matchAll(/https?:\/\/(?:www|trans|massage)\.eros\.com\/[^\s)\]]+\/eros\.htm/gi)) {
        const normalized = m[0].replace(/^https?:\/\/(?:trans|massage)\./i, "https://www.");
        addHub(parseCityHubFromErosUrl(normalized));
      }
      await sleep(500);
    }
  }

  return uniqueCities;
}

function listingUrlsForHub(c) {
  const hosts = ["www.eros.com", "trans.eros.com", "massage.eros.com"];
  const urls = [];
  for (const host of hosts) {
    if (c.state === c.city) {
      urls.push(`https://${host}/${c.state}/${c.state}_escorts.htm`);
    } else {
      urls.push(`https://${host}/${c.state}/${c.city}/${c.city}_escorts.htm`);
    }
  }
  return urls;
}

function profileLimitForHub(hub) {
  return hub.state === hub.city ? profilesPerState : profilesPerCity;
}

function hubKeyFromListingUrl(url) {
  return listingHubKeyFromUrl(url);
}

async function run() {
  const startedAt = Date.now();
  const s3 = getS3Client();
  const bucket = process.env.S3_BUCKET;

  console.log(`[reconcile] Start Weekly Eros Reconciliation.`);

  // 1. Fetch all cities
  const allCities = await fetchCities();
  const cities =
    limitCities > 0
      ? allCities.slice(cityOffset, cityOffset + limitCities)
      : allCities;
  console.log(
    `[reconcile] Discovered ${allCities.length} unique cities. Processing ${cities.length} cities ` +
      `(offset=${cityOffset}, limit=${limitCities || "all"}, dryRun=${dryRun}, ` +
      `profilesPerCity=${profilesPerCity}, profilesPerState=${profilesPerState}).`,
  );

  const hubLimits = new Map(cities.map((c) => [`${c.state}/${c.city}`, profileLimitForHub(c)]));

  // 2. Generate listing URLs (www, trans, massage)
  const listingUrls = [];
  for (const c of cities) {
    listingUrls.push(...listingUrlsForHub(c));
  }
  console.log(`[reconcile] Generated ${listingUrls.length} city-section listing URLs to scan.`);

  // 3. Scan listing pages concurrently with concurrency pool (5 workers)
  const profileUrls = new Set();
  const hubProfileCounts = new Map();
  const hubListingStats = new Map();
  const concurrency = 5;
  let listingIndex = 0;
  let crawledSuccessCount = 0;
  let crawledFailureCount = 0;

  async function listingWorker() {
    while (true) {
      const idx = listingIndex++;
      if (idx >= listingUrls.length) break;
      const url = listingUrls[idx];
      
      await sleep(400); // polite delay to avoid overwhelming Jina

      const text = await fetchMirrorText(url);
      if (!text) {
        crawledFailureCount++;
        recordHubListingAttempt(hubListingStats, url, false);
        console.warn(`[WARN] Failed to fetch listing page: ${url}`);
        continue;
      }

      crawledSuccessCount++;
      recordHubListingAttempt(hubListingStats, url, true);
      const hubKey = hubKeyFromListingUrl(url);
      const hubLimit = hubKey ? (hubLimits.get(hubKey) ?? profilesPerCity) : profilesPerCity;
      let hubCount = hubKey ? (hubProfileCounts.get(hubKey) ?? 0) : profileUrls.size;

      const matches = [...text.matchAll(/https?:\/\/(?:www|trans|massage)\.eros\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/files\/\d+\.htm/gi)].map(m => m[0]);
      for (const m of matches) {
        if (hubKey && hubCount >= hubLimit) break;
        const canonical = canonicalErosProfileUrl(m);
        if (!profileUrls.has(canonical)) {
          profileUrls.add(canonical);
          if (hubKey) {
            hubCount += 1;
            hubProfileCounts.set(hubKey, hubCount);
          }
        }
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => listingWorker());
  await Promise.all(workers);

  const totalAttempted = crawledSuccessCount + crawledFailureCount;
  const successRatio = totalAttempted > 0 ? (crawledSuccessCount / totalAttempted) : 0;
  console.log(`[reconcile] Scanned ${crawledSuccessCount}/${totalAttempted} listing pages. Success ratio: ${(successRatio * 100).toFixed(1)}%`);
  console.log(`[reconcile] Extracted ${profileUrls.size} unique active profile URLs.`);

  if (successRatio < 0.40) {
    console.error(`[FATAL] Success ratio is below 40% (${(successRatio * 100).toFixed(1)}%). Aborting reconciliation to protect DB.`);
    process.exit(1);
  }

  // 4. Fetch all active Eros providers in DB
  const dbProviders = await prisma.provider.findMany({
    where: {
      status: "active",
      verification_provider: "eros",
    },
    select: {
      id: true,
      display_name: true,
      verification_url: true,
    },
  });
  console.log(`[reconcile] Database active Eros providers: ${dbProviders.length}`);

  const scannedCityKeys = new Set(cities.map((c) => `${c.state}/${c.city}`));
  const isFullScan = limitCities === 0 || cities.length >= allCities.length;

  const hubsEligible = [...hubListingStats.entries()].filter(([, stats]) => stats.success > 0).length;
  const hubsSkipped = [...hubListingStats.entries()].filter(([, stats]) => stats.success === 0).length;
  console.log(
    `[reconcile] Per-hub deactivation: ${hubsEligible} hubs eligible (>=1 listing success), ` +
      `${hubsSkipped} hubs skipped (all listing fetches failed). Global success ${(successRatio * 100).toFixed(1)}%.`,
  );

  // 5. Deactivate profiles missing from scraped listings (per-hub success gate)
  let deactivatedCount = 0;
  const hubDeactivationCounts = new Map();

  for (const provider of dbProviders) {
    const canonicalUrl = canonicalErosProfileUrl(provider.verification_url);
    if (!canonicalUrl) continue;

    const cityKey = erosCityKeyFromUrl(provider.verification_url);
    if (!isFullScan && (!cityKey || !scannedCityKeys.has(cityKey))) {
      continue;
    }

    if (!cityKey || !hubEligibleForDeactivation(hubListingStats, cityKey)) {
      continue;
    }

    if (!profileUrls.has(canonicalUrl)) {
      console.log(`[reconcile] ${dryRun ? "[dry-run] Would deactivate" : "Deactivating"} provider (no longer on Eros): ${provider.display_name} (${provider.id}) - URL: ${provider.verification_url}`);
      if (!dryRun) {
        await prisma.provider.update({
          where: { id: provider.id },
          data: { status: "inactive", updated_date: new Date() },
        });
      }
      deactivatedCount++;
      hubDeactivationCounts.set(cityKey, (hubDeactivationCounts.get(cityKey) ?? 0) + 1);
    }
  }

  for (const [hubKey, count] of hubDeactivationCounts) {
    const stats = hubListingStats.get(hubKey) ?? { success: 0, attempted: 0 };
    console.log(`[reconcile] deactivated ${count} in hub ${hubKey} (listing success ${stats.success}/${stats.attempted})`);
  }

  console.log(`[reconcile] Total deactivated: ${deactivatedCount} (fullScan=${isFullScan}, citiesScanned=${scannedCityKeys.size})`);

  // 6. Find newly discovered profile URLs
  // To avoid duplicate profiles, we query all verification URLs (active or inactive) in the DB
  const allDbUrls = new Set(
    (await prisma.provider.findMany({
      where: { verification_provider: "eros" },
      select: { verification_url: true },
    }))
      .map((p) => canonicalErosProfileUrl(p.verification_url))
      .filter(Boolean),
  );

  const newProfileUrls = [...profileUrls].filter(url => !allDbUrls.has(url));
  console.log(`[reconcile] Discovered ${newProfileUrls.length} new profile URLs to import.`);

  // 7. Scrape and import new profiles concurrently
  let importedCount = 0;
  let importErrors = 0;
  let newProfileIndex = 0;

  async function importWorker() {
    while (true) {
      const idx = newProfileIndex++;
      if (idx >= newProfileUrls.length) break;
      const profileUrl = newProfileUrls[idx];

      await sleep(600); // polite delay

      try {
        const markdown = await fetchMirrorText(profileUrl);
        if (!markdown) {
          importErrors++;
          console.warn(`[WARN] Failed to fetch profile details: ${profileUrl}`);
          continue;
        }

        const profile = parseProfile(markdown, profileUrl);
        if (!profile.display_name || (!profile.phone && !profile.email)) {
          console.log(`[reconcile] Skipping invalid profile (missing name or contact): ${profileUrl}`);
          continue;
        }

        if (dryRun) {
          console.log(`[reconcile] [dry-run] Would import provider: ${profile.display_name} - URL: ${profile.sourceUrl} with ${profile.photos.length} photos.`);
          importedCount++;
          continue;
        }

        // Create new provider record (temporary ID needed to upload photos)
        const eros_state_wide = Boolean(profile.eros_state_wide);
        const provider = await prisma.provider.create({
          data: {
            display_name: profile.display_name,
            tagline: profile.tagline,
            bio: profile.bio,
            location_city: eros_state_wide ? "Statewide" : profile.location_city,
            location_state: profile.location_state,
            age: profile.age,
            phone: profile.phone,
            email: profile.email,
            verification_provider: "eros",
            verification_url: profile.sourceUrl,
            social_media: {
              eros_profile: profile.sourceUrl,
              eros_source: "r.jina.ai",
              eros_state_wide,
            },
            ad_headline: profile.tagline || profile.display_name,
            ad_body: profile.bio,
            status: "active",
            is_verified: true,
            is_profile_approved: true,
            is_premium: false,
          },
        });

        // Mirror photos to R2
        const storedUrls = await uploadPhotos(s3, bucket, provider.id, profile.photos);
        if (storedUrls.length > 0) {
          await prisma.provider.update({
            where: { id: provider.id },
            data: { photos: storedUrls },
          });
          console.log(`[reconcile] IMPORTED new provider: ${profile.display_name} (${provider.id}) with ${storedUrls.length} photos.`);
          importedCount++;
        } else {
          // Clean up if no photos could be uploaded
          await prisma.provider.delete({ where: { id: provider.id } });
          console.warn(`[WARN] Deleted newly created provider ${provider.id} due to zero uploaded photos.`);
        }
      } catch (err) {
        importErrors++;
        console.error(`[reconcile] Error importing profile ${profileUrl}:`, err.message);
      }
    }
  }

  const importWorkers = Array.from({ length: concurrency }, () => importWorker());
  await Promise.all(importWorkers);

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(`[reconcile] Reconciliation complete. Elapsed: ${elapsed}s. Imported: ${importedCount}, Deactivated: ${deactivatedCount}, Errors: ${importErrors + crawledFailureCount}`);
}

run()
  .catch((err) => {
    console.error("[reconcile] Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
