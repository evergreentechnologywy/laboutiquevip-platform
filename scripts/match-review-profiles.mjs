#!/usr/bin/env node
/**
 * Match imported LBV providers to review sites by phone/email.
 *
 * Phase C skeleton — TER first (VPS ter-bot), TOB + PrivateDelights stubbed.
 * Copies link + aggregate stats only (no full review text scrape).
 *
 * Scarlet client boundary: emails are matched but never logged to stdout.
 */

const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function createPrismaClient() {
  const runtime = await dynamicImport("@prisma/client");
  return new runtime.PrismaClient();
}

const dryRun = process.argv.includes("--dry-run");
const terOnly = !process.argv.includes("--all-sites");
const prisma = await createPrismaClient();

function normalizePhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

function maskEmail(email) {
  const [user, domain] = String(email ?? "").split("@");
  if (!user || !domain) return "[invalid]";
  return `${user.slice(0, 2)}***@${domain}`;
}

async function searchTerByPhone(phone) {
  // TER bot on VPS exposes internal lookup — wire via TER_LOOKUP_URL when deployed.
  const lookupUrl = process.env.TER_LOOKUP_URL;
  if (!lookupUrl) return null;

  const response = await fetch(`${lookupUrl}?phone=${encodeURIComponent(phone)}`, {
    headers: { authorization: `Bearer ${process.env.TER_LOOKUP_TOKEN ?? ""}` },
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data?.profileUrl) return null;
  return {
    provider: "ter",
    url: data.profileUrl,
    rating: data.rating ?? null,
    count: data.reviewCount ?? null,
  };
}

async function searchTobStub(_phone, _email) {
  return null; // Phase C2 — TheOtherBoard matcher
}

async function searchPdStub(_phone, _email) {
  return null; // Phase C2 — PrivateDelights matcher
}

async function applyMatch(provider, match) {
  const reviewUrls = Array.isArray(provider.review_urls) ? [...provider.review_urls] : [];
  const existingIdx = reviewUrls.findIndex((row) => row?.provider === match.provider);
  const entry = {
    provider: match.provider,
    url: match.url,
    rating: match.rating,
    count: match.count,
    matched_at: new Date().toISOString(),
  };
  if (existingIdx >= 0) reviewUrls[existingIdx] = entry;
  else reviewUrls.push(entry);

  const data = {
    review_urls: reviewUrls,
    review_matched_at: new Date(),
    review_site_rating: match.rating ?? provider.review_site_rating,
    review_site_count: match.count ?? provider.review_site_count,
  };

  if (match.provider === "ter") data.ter_url = match.url;
  if (match.provider === "tob") data.tob_url = match.url;
  if (match.provider === "pd") data.pd_url = match.url;

  if (dryRun) {
    console.log(`[dry-run] match ${provider.id} → ${match.provider}`);
    return;
  }
  await prisma.provider.update({ where: { id: provider.id }, data });
}

async function main() {
  const providers = await prisma.provider.findMany({
    where: {
      status: "active",
      OR: [{ phone: { not: null } }, { email: { not: null } }],
    },
    select: {
      id: true,
      phone: true,
      email: true,
      review_urls: true,
      review_site_rating: true,
      review_site_count: true,
    },
    take: 500,
  });

  let matched = 0;
  let scanned = 0;

  for (const provider of providers) {
    scanned += 1;
    const phone = normalizePhone(provider.phone);
    const email = provider.email ? String(provider.email).trim().toLowerCase() : null;

    if (email) {
      console.log(`Scanning provider ${provider.id} email=${maskEmail(email)}`);
    }

    const matchers = [];
    if (terOnly || process.argv.includes("--all-sites")) {
      if (phone) matchers.push(searchTerByPhone(phone));
    }
    if (process.argv.includes("--all-sites")) {
      if (phone || email) matchers.push(searchTobStub(phone, email));
      if (phone || email) matchers.push(searchPdStub(phone, email));
    }

    const results = (await Promise.all(matchers)).filter(Boolean);
    for (const match of results) {
      await applyMatch(provider, match);
      matched += 1;
    }
  }

  console.log(`Review match complete scanned=${scanned} matched=${matched} dryRun=${dryRun}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
