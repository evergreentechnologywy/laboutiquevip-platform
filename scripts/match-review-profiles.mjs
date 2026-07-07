#!/usr/bin/env node
/**
 * Match imported LBV providers to review sites + P411 by phone/email/page links.
 * Sets review_verified_at / p411_verified_at for public badge display.
 */

import {
  extractP411FromMarkdown,
  extractReviewUrlsFromMarkdown,
  mergeVerificationFields,
  resolveProviderVerification,
  searchTerByPhone,
} from "./lib/verification-match.mjs";

const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function createPrismaClient() {
  const runtime = await dynamicImport("@prisma/client");
  return new runtime.PrismaClient();
}

const dryRun = process.argv.includes("--dry-run");
const allSites = process.argv.includes("--all-sites");
const prisma = await createPrismaClient();

function maskEmail(email) {
  const [user, domain] = String(email ?? "").split("@");
  if (!user || !domain) return "[invalid]";
  return `${user.slice(0, 2)}***@${domain}`;
}

async function searchTobStub(_phone, _email) {
  return null;
}

async function searchPdStub(_phone, _email) {
  return null;
}

async function applyVerification(provider, verification) {
  const data = mergeVerificationFields(provider, verification);
  if (!Object.keys(data).length) return false;

  if (dryRun) {
    console.log(
      `[dry-run] ${provider.id} p411=${Boolean(data.p411_url)} review=${Boolean(data.review_verified_at)}`,
    );
    return true;
  }

  await prisma.provider.update({ where: { id: provider.id }, data });
  return true;
}

async function main() {
  const providers = await prisma.provider.findMany({
    where: {
      status: "active",
      verification_provider: { in: ["eros", "tryst"] },
      OR: [{ phone: { not: null } }, { email: { not: null } }],
    },
    select: {
      id: true,
      phone: true,
      email: true,
      bio: true,
      ad_body: true,
      p411_url: true,
      p411_id: true,
      p411_verified_at: true,
      ter_url: true,
      tob_url: true,
      pd_url: true,
      review_urls: true,
      review_site_rating: true,
      review_site_count: true,
      review_verified_at: true,
      review_matched_at: true,
    },
    take: Number(process.env.REVIEW_MATCH_LIMIT ?? "500"),
  });

  let matched = 0;
  let scanned = 0;

  for (const provider of providers) {
    scanned += 1;
    const markdown = `${provider.bio ?? ""}\n${provider.ad_body ?? ""}`;
    const pageSignals = {
      ...extractP411FromMarkdown(markdown),
      ...extractReviewUrlsFromMarkdown(markdown),
    };

    let verification = await resolveProviderVerification({
      phone: provider.phone,
      email: provider.email,
      markdown,
      includeApiLookup: true,
    });

    if (allSites) {
      const phone = verification.normalizedPhone;
      const email = verification.normalizedEmail;
      const extraMatchers = await Promise.all([
        phone && !verification.ter_url ? searchTerByPhone(phone) : null,
        phone || email ? searchTobStub(phone, email) : null,
        phone || email ? searchPdStub(phone, email) : null,
      ]);

      for (const match of extraMatchers.filter(Boolean)) {
        if (match.provider === "ter" && !verification.ter_url) {
          verification = {
            ...verification,
            ter_url: match.url,
            review_site_rating: match.rating,
            review_site_count: match.count,
            importAllowed: true,
            review_verified_at: new Date(),
            review_matched_at: new Date(),
            review_urls: [
              ...(verification.review_urls ?? []),
              {
                provider: "ter",
                url: match.url,
                rating: match.rating,
                count: match.count,
                matched_at: new Date().toISOString(),
              },
            ],
          };
        }
        if (match.provider === "tob") verification = { ...verification, tob_url: match.url, importAllowed: true };
        if (match.provider === "pd") verification = { ...verification, pd_url: match.url, importAllowed: true };
      }
    }

    if (pageSignals.p411_url && !verification.p411_url) {
      verification = {
        ...verification,
        p411_url: pageSignals.p411_url,
        p411_id: pageSignals.p411_id,
        p411_verified_at: new Date(),
        importAllowed: true,
      };
    }

    if (!verification.importAllowed) {
      if (provider.email) console.log(`No match ${provider.id} email=${maskEmail(provider.email)}`);
      continue;
    }

    const applied = await applyVerification(provider, verification);
    if (applied) matched += 1;
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
