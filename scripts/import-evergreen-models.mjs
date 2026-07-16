#!/usr/bin/env node
/**
 * Import / enrich Evergreen agency model profiles on lbv.net from:
 * - SiteConsole model websites (sites.json)
 * - calendar-coordinator model-profiles.json (high-res VPS images)
 * - Existing elite Provider rows (merge photos)
 */
import fs from "node:fs";
import path from "node:path";
import { loadRepoEnv, mirrorProviderPhotosToR2 } from "./lib/r2-photo-upload.mjs";

const MAX_PHOTOS = 32;
const CALENDAR_PUBLIC = process.env.CALENDAR_PUBLIC_URL || "https://cuentas.evergreentech.site/calendar";
const MODEL_IMAGES_DIR =
  process.env.EVERGREEN_MODEL_IMAGES_DIR || "/root/calendar-coordinator/data/model-images";
const SITES_JSON = process.env.EVERGREEN_SITES_JSON || "/var/lib/siteconsole-manager/sites.json";
const MODEL_PROFILES =
  process.env.EVERGREEN_MODEL_PROFILES || "/root/calendar-coordinator/data/model-profiles.json";
const STATUS_PATH =
  process.env.EVERGREEN_STATUS_PATH || "/var/run/lboutiquevip/evergreen-models-last-run.json";

/** Map SiteConsole domain slug → calendar model-images folder */
const DOMAIN_IMAGE_SLUG = {
  alicetorres: "alice-torres",
  angelinapellegrini: "angie-fox",
  camilabrazilian: "camila",
  catalinaainoa: "catalina",
  dianareyes: "diana-reyes",
  laurabianchixoxo: "diosa-rubi",
  rubyvega: "diosa-rubi",
  larablake: "larablake",
  luzferrero: "luz-ferrero",
};

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const dryRun = args.has("dry-run");
const modelFilter = args.get("model")?.trim() || null;
const locationCityOverride = args.get("location-city")?.trim() || null;
const locationStateOverride = args.get("location-state")?.trim() || null;

const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function createPrismaClient() {
  try {
    const generated = await dynamicImport("../backend/generated/prisma-client/index.js");
    if (generated?.PrismaClient) return new generated.PrismaClient();
  } catch {
    /* fallback */
  }
  const runtime = await dynamicImport("@prisma/client");
  return new runtime.PrismaClient();
}

loadRepoEnv();
const prisma = await createPrismaClient();

const stats = { sites: 0, updated: 0, created: 0, skipped: 0, errors: 0 };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function imageSlugForDomain(domain) {
  const key = domain.replace(/\.site$/i, "").toLowerCase();
  return DOMAIN_IMAGE_SLUG[key] || key;
}

function localModelPhotos(domain) {
  const slug = imageSlugForDomain(domain);
  const dir = path.join(MODEL_IMAGES_DIR, slug);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

function siteSourcePhotos(site) {
  const paths = [];
  const dirs = [
    site.path ? path.join(site.path, "assets") : null,
    `/var/www/siteconsole-sites/${site.domain}/assets`,
  ].filter(Boolean);
  for (const srcDir of dirs) {
    if (!fs.existsSync(srcDir)) continue;
    for (const f of fs.readdirSync(srcDir)) {
      if (/\.(jpg|jpeg|png|webp)$/i.test(f)) {
        paths.push(path.join(srcDir, f));
      }
    }
  }
  return paths;
}

function titleCaseFromDomain(domain) {
  const base = domain.replace(/\.site$/i, "").replace(/[-_]/g, " ");
  return base
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizePhotoUrl(url, base) {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;
  try {
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("/")) return new URL(trimmed, base).toString();
    if (trimmed.startsWith("http")) return trimmed;
    return new URL(trimmed, base).toString();
  } catch {
    return null;
  }
}

function preferHighRes(url) {
  if (!url) return url;
  return url
    .replace(/width=\d+/gi, "width=1600")
    .replace(/height=\d+/gi, "height=1600")
    .replace(/resize=contain/gi, "resize=cover");
}

function isPhotoUrl(url) {
  const lower = String(url).toLowerCase();
  if (lower.includes("logo") || lower.includes("favicon") || lower.includes(".svg")) return false;
  return (
    /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(lower) ||
    lower.includes("supabase.co/storage") ||
    lower.includes("imagedelivery.net") ||
    lower.includes("/model-images/")
  );
}

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; lbv-evergreen-import/1.0)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractPhotosFromHtml(html, baseUrl) {
  if (!html) return [];
  const urls = [];
  for (const m of html.matchAll(/<meta[^>]+property=["']og:image(?::[^"']*)?["'][^>]+content=["']([^"']+)["']/gi)) {
    urls.push(preferHighRes(normalizePhotoUrl(m[1], baseUrl)));
  }
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    urls.push(preferHighRes(normalizePhotoUrl(m[1], baseUrl)));
  }
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/gi)) {
    urls.push(preferHighRes(m[0]));
  }
  return unique(urls.filter(isPhotoUrl));
}

function extractTitleFromHtml(html, fallback) {
  const h1 = html?.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1];
  const og = html?.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  return (og || h1 || fallback || "").trim();
}

function extractDescription(html) {
  return (
    html?.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ||
    html?.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ||
    null
  );
}

function tokens(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[\s._-]+/)
    .filter((t) => t.length >= 3);
}

function matchCalendarModel(domain, displayName, modelProfiles) {
  const domainSlug = domain.replace(/\.site$/i, "");
  let best = null;
  let bestScore = 0;
  for (const [name, profile] of Object.entries(modelProfiles)) {
    const siteUrl = String(profile.siteUrl || "").toLowerCase();
    let score = 0;
    if (siteUrl.includes(domain)) score += 5;
    for (const t of tokens(name)) {
      if (domainSlug.includes(t)) score += 2;
      if (displayName.toLowerCase().includes(t)) score += 2;
    }
    for (const t of tokens(domainSlug)) {
      if (tokens(name).some((n) => n.includes(t) || t.includes(n))) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = { name, profile };
    }
  }
  return bestScore >= 2 ? best : null;
}

async function findExistingProvider(displayName, siteUrl) {
  const normalizedSiteUrl = String(siteUrl || "").replace(/\/+$/, "");
  if (normalizedSiteUrl) {
    const bySite = await prisma.$queryRaw`
      SELECT id, display_name, photos, verification_url, bio, location_city, location_state, social_media
      FROM "Provider"
      WHERE lower(regexp_replace(coalesce(verification_url, ''), '/+$', '')) = lower(${normalizedSiteUrl})
      ORDER BY updated_date DESC
      LIMIT 1
    `;
    if (bySite[0]) return bySite[0];
  }

  const rows = await prisma.$queryRaw`
    SELECT id, display_name, photos, verification_url, bio, location_city, location_state, social_media
    FROM "Provider"
    WHERE lower(display_name) = lower(${displayName})
    ORDER BY updated_date DESC
    LIMIT 1
  `;
  if (rows[0]) return rows[0];

  const elite = await prisma.$queryRaw`
    SELECT id, display_name, photos, verification_url, bio, location_city, location_state, social_media
    FROM "Provider"
    WHERE ad_package = 'elite' AND status = 'active'
  `;
  const nameTokens = tokens(displayName);
  for (const row of elite) {
    const rowTokens = tokens(row.display_name);
    const overlap = nameTokens.filter((t) => rowTokens.some((r) => r.includes(t) || t.includes(r)));
    if (overlap.length >= 1 && nameTokens.length <= 2) return row;
    if (overlap.length >= 2) return row;
  }
  return null;
}

function calendarPhotos(profile) {
  const urls = profile?.imageUrls || profile?.storyImageUrls || [];
  return unique(
    urls
      .map((u) => {
        const rel = String(u).trim();
        if (rel.startsWith("/model-images/")) return `${CALENDAR_PUBLIC}${rel}`;
        return normalizePhotoUrl(rel, CALENDAR_PUBLIC);
      })
      .map(preferHighRes)
      .filter(isPhotoUrl),
  );
}

async function buildPhotoSources(site, siteUrl, html, calendarProfile) {
  const collected = [];
  collected.push(...localModelPhotos(site.domain));
  collected.push(...siteSourcePhotos(site));
  collected.push(...extractPhotosFromHtml(html, siteUrl));
  collected.push(...calendarPhotos(calendarProfile));
  return unique(collected).slice(0, MAX_PHOTOS);
}

async function upsertEvergreenModel(site, modelProfiles, locationOverride = null) {
  const domain = site.domain;
  const siteUrl = `https://${domain}`;
  stats.sites += 1;

  const html = await fetchText(siteUrl);
  const fallbackName = titleCaseFromDomain(domain);
  const displayName = extractTitleFromHtml(html, fallbackName) || fallbackName;
  const calendarMatch = matchCalendarModel(domain, displayName, modelProfiles);
  const bio =
    extractDescription(html) || `${displayName} — verified Evergreen companion. Book via ${siteUrl}`;

  const existing = await findExistingProvider(calendarMatch?.name || displayName, siteUrl);
  const photoSources = await buildPhotoSources(site, siteUrl, html, calendarMatch?.profile);

  if (photoSources.length === 0) {
    console.warn(`skip ${domain}: no photos found`);
    stats.skipped += 1;
    return;
  }

  const finalName = calendarMatch?.name || existing?.display_name || displayName;
  const locationCity =
    locationOverride?.city ||
    existing?.location_city ||
    "Miami";
  const locationState =
    locationOverride?.state ||
    existing?.location_state ||
    "FL";
  const payload = {
    display_name: finalName,
    bio,
    verification_provider: "evergreen",
    verification_url: siteUrl,
    website: siteUrl,
    photos: [],
    status: "active",
    is_premium: true,
    is_verified: true,
    is_profile_approved: true,
    ad_package: "elite",
    ad_package_expiry: null,
    photo_review_status: "approved",
    tagline: `Premium Evergreen model — ${finalName}. Visit ${siteUrl}`,
    social_media: {
      website: siteUrl,
      ...(existing?.social_media && typeof existing.social_media === "object" ? existing.social_media : {}),
    },
    updated_date: new Date(),
  };

  if (dryRun) {
    console.log(`[dry-run] ${payload.display_name} @ ${siteUrl} — ${photoSources.length} sources`);
    return;
  }

  try {
    let providerId = existing?.id;
    if (existing) {
      await prisma.$executeRaw`
        UPDATE "Provider" SET
          display_name = ${payload.display_name},
          bio = ${payload.bio},
          verification_provider = ${payload.verification_provider},
          verification_url = ${payload.verification_url},
          status = ${payload.status},
          is_premium = ${payload.is_premium},
          is_verified = ${payload.is_verified},
          is_profile_approved = ${payload.is_profile_approved},
          ad_package = ${payload.ad_package},
          photo_review_status = ${payload.photo_review_status},
          tagline = ${payload.tagline},
          social_media = ${JSON.stringify(payload.social_media)}::jsonb,
          location_city = ${locationCity},
          location_state = ${locationState},
          updated_date = NOW()
        WHERE id = ${existing.id}::uuid
      `;
      stats.updated += 1;
      providerId = existing.id;
    } else {
      const inserted = await prisma.$queryRaw`
        INSERT INTO "Provider" (
          display_name, bio, verification_provider, verification_url, photos,
          status, is_premium, is_verified, is_profile_approved, ad_package,
          photo_review_status, tagline, social_media,
          location_city, location_state, location_country, updated_date, created_date
        ) VALUES (
          ${payload.display_name}, ${payload.bio}, ${payload.verification_provider}, ${payload.verification_url},
          ${JSON.stringify(payload.photos)}::jsonb,
          ${payload.status}, ${payload.is_premium}, ${payload.is_verified}, ${payload.is_profile_approved},
          ${payload.ad_package}, ${payload.photo_review_status}, ${payload.tagline},
          ${JSON.stringify(payload.social_media)}::jsonb,
          ${locationCity}, ${locationState}, ${"US"}, NOW(), NOW()
        )
        RETURNING id
      `;
      providerId = inserted[0]?.id;
      stats.created += 1;
    }
    const r2Photos = await mirrorProviderPhotosToR2(providerId, photoSources, {
      max: MAX_PHOTOS,
      delayMs: 100,
      dryRun,
    });
    if (r2Photos.length > 0) {
      await prisma.$executeRaw`
        UPDATE "Provider" SET photos = ${JSON.stringify(r2Photos)}::jsonb, updated_date = NOW()
        WHERE id = ${providerId}::uuid
      `;
    }
    console.log(`${existing ? "updated" : "created"} ${payload.display_name} (${r2Photos.length} r2 photos)`);
  } catch (err) {
    stats.errors += 1;
    console.error(`error ${domain}:`, err.message);
  }

  await sleep(400);
}

function writeStatus(extra = {}) {
  try {
    fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
    fs.writeFileSync(
      STATUS_PATH,
      `${JSON.stringify(
        {
          finishedAt: new Date().toISOString(),
          dryRun,
          stats,
          ...extra,
        },
        null,
        2,
      )}\n`,
    );
  } catch (err) {
    console.warn("status write failed:", err.message);
  }
}

function siteMatchesModelFilter(site, modelProfiles) {
  if (!modelFilter) return true;
  const target = modelFilter.toLowerCase();
  const domain = site.domain.replace(/\.site$/i, "").toLowerCase();
  const profile = modelProfiles[modelFilter];
  if (profile?.siteUrl && String(profile.siteUrl).toLowerCase().includes(domain)) return true;
  if (domain.includes(target.replace(/\s+/g, "")) || domain.includes(target.replace(/\s+/g, "-"))) {
    return true;
  }
  const fallbackName = titleCaseFromDomain(site.domain);
  const calendarMatch = matchCalendarModel(site.domain, fallbackName, modelProfiles);
  if (calendarMatch?.name?.toLowerCase() === target) return true;
  if (fallbackName.toLowerCase() === target) return true;
  return false;
}

function resolveSitesForImport(sites, modelProfiles) {
  if (!modelFilter) return sites;
  const filtered = sites.filter((site) => siteMatchesModelFilter(site, modelProfiles));
  if (filtered.length > 0) return filtered;
  const profile = modelProfiles[modelFilter];
  if (profile?.siteUrl) {
    try {
      const domain = new URL(profile.siteUrl).hostname.replace(/^www\./i, "");
      const match = sites.find((s) => s.domain === domain || domain.endsWith(s.domain));
      if (match) return [match];
    } catch {
      /* ignore */
    }
  }
  return [];
}

async function main() {
  if (!fs.existsSync(SITES_JSON)) {
    console.error(`Missing sites list: ${SITES_JSON}`);
    writeStatus({ error: "sites_json_missing" });
    process.exit(2);
  }

  const sitesAll = JSON.parse(fs.readFileSync(SITES_JSON, "utf8"));
  const modelProfiles = fs.existsSync(MODEL_PROFILES)
    ? JSON.parse(fs.readFileSync(MODEL_PROFILES, "utf8"))
    : {};

  const sites = resolveSitesForImport(sitesAll, modelProfiles);
  if (modelFilter && sites.length === 0) {
    console.error(`No SiteConsole site matched model filter: ${modelFilter}`);
    writeStatus({ error: "model_not_found", model: modelFilter });
    process.exit(2);
  }

  const locationOverride =
    locationCityOverride || locationStateOverride
      ? {
          city: locationCityOverride || null,
          state: locationStateOverride || null,
        }
      : null;

  console.log(
    `Evergreen model import — ${sites.length} site(s)${modelFilter ? ` (filter: ${modelFilter})` : ""}`,
  );
  for (const site of sites) {
    await upsertEvergreenModel(site, modelProfiles, locationOverride);
  }

  console.log("\nDone.", stats);
  writeStatus({
    siteCount: sites.length,
    modelFilter,
    modelProfileCount: Object.keys(modelProfiles).length,
  });
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  writeStatus({ error: err.message });
  process.exit(1);
});
