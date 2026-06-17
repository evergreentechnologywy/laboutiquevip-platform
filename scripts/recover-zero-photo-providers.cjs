#!/usr/bin/env node
/**
 * Re-scrape verification_url for providers with empty galleries.
 * Photos come from the provider's own listing page, so we keep valid images only.
 */
const { PrismaClient } = require("../backend/generated/prisma-client");

const BASE_URL = "https://ultragfe.com";
const MAX_PHOTOS = 32;
const delayMs = Number(process.argv.find((a) => a.startsWith("--delay-ms="))?.split("=")[1] ?? 400);
const dryRun = process.argv.includes("--dry-run");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0);

const JUNK_SUBSTRINGS = [
  "/api/r2-photo/",
  "theeroticreview.com/library/",
  "coop.theeroticreview.com/hit.php",
  "eros-logo",
  "loader.php",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidProfilePhoto(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (JUNK_SUBSTRINGS.some((part) => lower.includes(part))) return false;
  if (lower.endsWith("lamp.png")) return false;
  if (lower.includes(".js") || lower.includes(".html")) return false;
  return (
    /\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(lower) ||
    /ultragfe\.com\/images|photos\.skipsweb\.com|imagedelivery\.net|i\.eros\.com/.test(lower)
  );
}

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractNameTokens(displayName) {
  return String(displayName || "")
    .toLowerCase()
    .split(/[\s,._/+-]+/)
    .map(normalizeToken)
    .filter((token) => token.length >= 3);
}

function extractVerificationSlugTokens(verificationUrl) {
  const match = String(verificationUrl || "").match(/\/provider\/\d+-(.+)\.html/i);
  if (!match) return [];
  return match[1].split(/[-_]+/).map(normalizeToken).filter((token) => token.length >= 3);
}

function extractPhoneFromPhotoUrl(url) {
  const match = String(url).match(/-(\d{10})-\d+\.[a-z0-9]+$/i);
  return match ? match[1] : null;
}

function photoMatchesProvider(url, provider) {
  if (!isValidProfilePhoto(url)) return false;
  const lower = String(url).toLowerCase();
  const filename = lower.split("/").pop() || lower;
  const pathBlob = lower.replace(/^https?:\/\/[^/]+\//, "").replace(/[^a-z0-9]/g, " ");
  const providerPhone = String(provider.phone || "").replace(/\D/g, "");
  const urlPhone = extractPhoneFromPhotoUrl(url);

  if (providerPhone && urlPhone) return urlPhone === providerPhone;
  if (providerPhone && urlPhone && urlPhone !== providerPhone) return false;

  const nameTokens = extractNameTokens(provider.display_name);
  const slugTokens = extractVerificationSlugTokens(provider.verification_url);
  const slugHits = slugTokens.filter((token) => pathBlob.includes(token)).length;
  if (slugTokens.length > 0 && slugHits >= Math.min(2, slugTokens.length)) return true;

  const nameHits = nameTokens.filter((token) => pathBlob.includes(token)).length;
  if (nameTokens.length >= 2 && nameHits >= 2) return true;
  if (nameTokens.length === 1 && nameHits >= 1) return true;
  if (/^[a-f0-9]{16,}\.[a-z0-9]+$/i.test(filename)) return false;
  return false;
}

function selectPhotos(raw, provider) {
  const valid = [...new Set(raw.filter(isValidProfilePhoto))];
  const strict = valid.filter((url) => photoMatchesProvider(url, provider));
  if (strict.length > 0) return strict.slice(0, MAX_PHOTOS);
  // Page-scoped fallback: verification_url is provider-specific, so keep non-hash junk.
  const pageScoped = valid.filter((url) => {
    const filename = String(url).toLowerCase().split("/").pop() || "";
    return !/^[a-f0-9]{16,}\.[a-z0-9]+$/i.test(filename);
  });
  return pageScoped.slice(0, MAX_PHOTOS);
}

function extractPhotos(html) {
  const candidates = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1].trim());
  return [...new Set(candidates)].map((src) => (src.startsWith("http") ? src : new URL(src, BASE_URL).toString()));
}

function extractPhone(html) {
  const phoneHref = html.match(/href="tel:([^"]+)"/i)?.[1];
  const phoneText = html.match(/\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}/)?.[0];
  return (phoneHref ?? phoneText ?? "").trim() || null;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; laboutiquevip-recovery/1.0)" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const prisma = new PrismaClient();
  const providers = await prisma.provider.findMany({
    where: { status: "active", verification_url: { not: null } },
    select: { id: true, display_name: true, phone: true, verification_url: true, photos: true },
  });

  const targets = providers.filter((p) => !Array.isArray(p.photos) || p.photos.length === 0);
  const slice = limit > 0 ? targets.slice(0, limit) : targets;
  console.log(`zero_photo_candidates=${targets.length} processing=${slice.length}`);

  let recovered = 0;
  let failed = 0;

  for (const provider of slice) {
    const url = String(provider.verification_url || "").trim();
    if (!url) continue;
    await sleep(delayMs);
    const html = await fetchText(url);
    if (!html) {
      failed += 1;
      console.log(`FAIL fetch ${provider.display_name}`);
      continue;
    }

    const scrapedPhone = extractPhone(html);
    const enriched = scrapedPhone && !provider.phone ? { ...provider, phone: scrapedPhone } : provider;
    const raw = extractPhotos(html);
    const matched = selectPhotos(raw, enriched);
    if (matched.length === 0) {
      failed += 1;
      console.log(`FAIL no-match ${provider.display_name} raw=${raw.length}`);
      continue;
    }

    if (!dryRun) {
      const data = { photos: matched };
      if (scrapedPhone && !provider.phone) data.phone = scrapedPhone;
      await prisma.provider.update({ where: { id: provider.id }, data });
    }
    recovered += 1;
    console.log(`${dryRun ? "[dry-run] " : ""}${provider.display_name}: recovered ${matched.length} photos`);
  }

  console.log(`recovered=${recovered} failed=${failed}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
