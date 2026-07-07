#!/usr/bin/env node
/**
 * Backfill verification badges and hide unverified imported listings from public browse.
 * Evergreen roster is exempt. Set STRICT_VERIFICATION_GATE=0 to preview without deactivating.
 */

import {
  mergeVerificationFields,
  resolveProviderVerification,
} from "./lib/verification-match.mjs";

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

const dryRun = process.argv.includes("--dry-run");
const prisma = await createPrismaClient();

const stats = {
  scanned: 0,
  matched: 0,
  deactivated: 0,
  evergreenSkipped: 0,
};

async function main() {
  const providers = await prisma.provider.findMany({
    where: {
      status: "active",
      verification_provider: { in: ["eros", "tryst"] },
    },
    select: {
      id: true,
      display_name: true,
      verification_provider: true,
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
      is_profile_approved: true,
    },
  });

  for (const provider of providers) {
    stats.scanned += 1;
    const markdown = `${provider.bio ?? ""}\n${provider.ad_body ?? ""}`;
    const verification = await resolveProviderVerification({
      phone: provider.phone,
      email: provider.email,
      markdown,
    });

    const merged = mergeVerificationFields(provider, verification);
    const hasBadge = Boolean(
      merged.p411_url || merged.ter_url || merged.pd_url || merged.tob_url,
    );

    if (hasBadge) {
      stats.matched += 1;
      if (dryRun) {
        console.log(`[dry-run] would update badges ${provider.id} ${provider.display_name}`);
        continue;
      }
      await prisma.provider.update({ where: { id: provider.id }, data: merged });
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] would hide ${provider.id} ${provider.display_name} (no P411/review)`);
      stats.deactivated += 1;
      continue;
    }

    await prisma.provider.update({
      where: { id: provider.id },
      data: {
        is_profile_approved: false,
        admin_notes: "Hidden: no P411 or review-site verification match (enforce-verification-gate)",
      },
    });
    stats.deactivated += 1;
  }

  const evergreen = await prisma.provider.count({
    where: { status: "active", verification_provider: "evergreen" },
  });
  stats.evergreenSkipped = evergreen;

  console.log("[enforce-verification-gate] complete", stats);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
