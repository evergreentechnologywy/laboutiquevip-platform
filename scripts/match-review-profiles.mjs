#!/usr/bin/env node
/**
 * Match imported LBV providers to review sites + P411 via web search (TER/TOB/PD/Google).
 * Sets review_verified_at / p411_verified_at for public badge display.
 *
 * Usage:
 *   node scripts/match-review-profiles.mjs [--dry-run] [--reverify-all] [--search-only]
 *   REVIEW_MATCH_LIMIT=50 node scripts/match-review-profiles.mjs --dry-run
 */

import {
  extractP411FromMarkdown,
  extractReviewUrlsFromMarkdown,
  mergeVerificationFields,
  providerHasVerificationBadge,
  resolveProviderVerification,
} from "./lib/verification-match.mjs";
import { mergeImportedSocial } from "./lib/extract-social-links.mjs";

import { createPrismaClient } from "./lib/prisma-client.mjs";

const dryRun = process.argv.includes("--dry-run");
const reverifyAll = process.argv.includes("--reverify-all");
const searchOnly = !process.argv.includes("--page-only");
const prisma = await createPrismaClient();

function maskEmail(email) {
  const [user, domain] = String(email ?? "").split("@");
  if (!user || !domain) return "[invalid]";
  return `${user.slice(0, 2)}***@${domain}`;
}

async function applyVerification(provider, verification) {
  const data = mergeVerificationFields(provider, verification);

  if (verification.social_media) {
    data.social_media = mergeImportedSocial(provider.social_media, verification.social_media);
  }

  if (!Object.keys(data).length) return { applied: false, kind: null };

  const kind = data.p411_url && !provider.p411_url ? "p411" : data.ter_url || data.pd_url || data.tob_url ? "review" : "other";

  if (dryRun) {
    console.log(
      `[dry-run] ${provider.id} p411=${Boolean(data.p411_url)} review=${Boolean(data.review_verified_at)} kind=${kind}`,
    );
    return { applied: true, kind };
  }

  await prisma.provider.update({ where: { id: provider.id }, data });
  return { applied: true, kind };
}

async function main() {
  const where = {
    status: "active",
    verification_provider: { in: ["eros", "tryst"] },
    OR: [{ phone: { not: null } }, { email: { not: null } }, { display_name: { not: "" } }],
  };

  const limitRaw = process.env.REVIEW_MATCH_LIMIT;
  const limit = limitRaw == null || limitRaw === "" ? 0 : Number(limitRaw);

  const providers = await prisma.provider.findMany({
    where,
    select: {
      id: true,
      display_name: true,
      location_city: true,
      location_state: true,
      phone: true,
      email: true,
      bio: true,
      ad_body: true,
      social_media: true,
      p411_url: true,
      p411_id: true,
      p411_verified_at: true,
      ter_url: true,
      tob_url: true,
      pd_url: true,
      review_url: true,
      review_urls: true,
      review_site_rating: true,
      review_site_count: true,
      review_verified_at: true,
      review_matched_at: true,
    },
    ...(limit > 0 ? { take: limit } : {}),
  });

  const stats = {
    matched: 0,
    scanned: 0,
    skippedVerified: 0,
    gainedP411: 0,
    gainedReview: 0,
    gainedBoth: 0,
  };

  for (const provider of providers) {
    if (!reverifyAll && providerHasVerificationBadge(provider)) {
      stats.skippedVerified += 1;
      continue;
    }
    stats.scanned += 1;
    const markdown = `${provider.bio ?? ""}\n${provider.ad_body ?? ""}`;
    const pageSignals = {
      ...extractP411FromMarkdown(markdown),
      ...extractReviewUrlsFromMarkdown(markdown),
    };

    let verification = await resolveProviderVerification({
      phone: provider.phone,
      email: provider.email,
      markdown,
      displayName: provider.display_name,
      city: provider.location_city,
      state: provider.location_state,
      includeApiLookup: searchOnly && (reverifyAll || !providerHasVerificationBadge(provider)),
    });

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

    const hadP411 = Boolean(provider.p411_url);
    const hadReview = Boolean(provider.ter_url || provider.pd_url || provider.tob_url);
    const { applied, kind } = await applyVerification(provider, verification);
    if (!applied) continue;

    stats.matched += 1;
    const newP411 = Boolean(verification.p411_url) && !hadP411;
    const newReview =
      Boolean(verification.ter_url || verification.pd_url || verification.tob_url) && !hadReview;
    if (newP411 && newReview) stats.gainedBoth += 1;
    else if (newP411) stats.gainedP411 += 1;
    else if (newReview) stats.gainedReview += 1;
    else if (kind === "p411") stats.gainedP411 += 1;
    else if (kind === "review") stats.gainedReview += 1;
  }

  console.log(
    JSON.stringify({
      event: "review_match_complete",
      scanned: stats.scanned,
      matched: stats.matched,
      skippedVerified: stats.skippedVerified,
      gainedP411: stats.gainedP411,
      gainedReview: stats.gainedReview,
      gainedBoth: stats.gainedBoth,
      dryRun,
      searchOnly,
    }),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
