#!/usr/bin/env node
/**
 * Remove cross-model and junk photos from Provider.photos using phone + slug matching.
 */
const { PrismaClient } = require("../backend/generated/prisma-client");

const JUNK_SUBSTRINGS = [
  "/api/r2-photo/",
  "theeroticreview.com/library/",
  "coop.theeroticreview.com/hit.php",
  "eros-logo",
  "loader.php",
];

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
    .split(/[\s,._-]+/)
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

function filterPhotos(photos, provider) {
  if (!Array.isArray(photos)) return [];
  const seen = new Set();
  return photos.filter((url) => {
    const key = String(url).toLowerCase();
    if (seen.has(key)) return false;
    if (!photoMatchesProvider(url, provider)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const prisma = new PrismaClient();
  const dryRun = process.argv.includes("--dry-run");
  const onlyPremium = process.argv.includes("--premium-only");

  const where = onlyPremium
    ? { status: "active", OR: [{ is_premium: true }, { ad_package: "elite" }] }
    : { status: "active" };

  const providers = await prisma.provider.findMany({
    where,
    select: {
      id: true,
      display_name: true,
      phone: true,
      verification_url: true,
      photos: true,
    },
  });

  let updated = 0;
  let removedTotal = 0;

  for (const provider of providers) {
    const before = Array.isArray(provider.photos) ? provider.photos : [];
    const after = filterPhotos(before, provider);
    if (after.length === before.length) continue;

    removedTotal += before.length - after.length;
    if (!dryRun) {
      await prisma.provider.update({
        where: { id: provider.id },
        data: { photos: after },
      });
    }
    updated += 1;
    console.log(
      `${dryRun ? "[dry-run] " : ""}${provider.display_name}: ${before.length} -> ${after.length} photos`,
    );
  }

  console.log(`providers_updated=${updated} photos_removed=${removedTotal}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
