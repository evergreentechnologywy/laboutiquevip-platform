#!/usr/bin/env node
/**
 * Deactivate legacy UltraGFE / untagged scraped providers (eros+tryst catalog policy).
 * Does not delete rows — sets status=inactive for public hide.
 */
const path = require("node:path");

function loadPrisma() {
  const repo = process.env.REPO_DIR || "/srv/apps/trystlike/repo";
  try {
    const generated = require(path.join(repo, "backend/generated/prisma-client/index.js"));
    if (generated?.PrismaClient) return new generated.PrismaClient();
  } catch {
    // fallback
  }
  const { PrismaClient } = require("@prisma/client");
  return new PrismaClient();
}

async function main() {
  const prisma = loadPrisma();
  try {
    const byProvider = await prisma.provider.updateMany({
      where: {
        status: { not: "inactive" },
        OR: [
          { verification_provider: "ultragfe" },
          { review_provider: "ultragfe" },
          { verification_url: { contains: "ultragfe.com", mode: "insensitive" } },
          { review_url: { contains: "ultragfe.com", mode: "insensitive" } },
        ],
      },
      data: {
        status: "inactive",
        is_profile_approved: false,
        admin_notes: "retired: ultragfe source disabled 2026-08-15",
      },
    });

    const legacyNull = await prisma.provider.updateMany({
      where: {
        status: "active",
        verification_provider: null,
        user_id: null,
      },
      data: {
        status: "inactive",
        admin_notes: "retired: untagged scrape row (no user) 2026-08-15",
      },
    });

    const counts = await prisma.provider.groupBy({
      by: ["verification_provider", "status"],
      _count: { _all: true },
    });

    const activeEros = await prisma.provider.count({
      where: { verification_provider: "eros", status: "active" },
    });
    const activeTryst = await prisma.provider.count({
      where: { verification_provider: "tryst", status: "active" },
    });
    const activeUltragfe = await prisma.provider.count({
      where: { verification_provider: "ultragfe", status: "active" },
    });
    const inactiveUltragfe = await prisma.provider.count({
      where: { verification_provider: "ultragfe", status: "inactive" },
    });

    console.log(
      JSON.stringify({
        ok: true,
        deactivated_ultragfe_like: byProvider.count,
        deactivated_legacy_null: legacyNull.count,
        active_eros: activeEros,
        active_tryst: activeTryst,
        active_ultragfe: activeUltragfe,
        inactive_ultragfe: inactiveUltragfe,
        groups: counts.map((row) => ({
          verification_provider: row.verification_provider,
          status: row.status,
          count: row._count._all,
        })),
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[deactivate-ultragfe] fatal", err);
  process.exit(1);
});
