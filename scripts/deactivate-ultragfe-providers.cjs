#!/usr/bin/env node
/**
 * Deactivate legacy ultragfe / untagged scraped providers (eros-only catalog policy).
 * Does not delete rows — sets status=inactive for public visibility hide.
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
    const ultragfe = await prisma.provider.updateMany({
      where: { verification_provider: "ultragfe", status: "active" },
      data: { status: "inactive" },
    });

    const legacyNull = await prisma.provider.updateMany({
      where: {
        status: "active",
        verification_provider: null,
        user_id: null,
      },
      data: { status: "inactive" },
    });

    const activeEros = await prisma.provider.count({
      where: { verification_provider: "eros", status: "active" },
    });
    const activeEvergreen = await prisma.provider.count({
      where: { verification_provider: "evergreen", status: "active" },
    });

    console.log(
      `[deactivate-ultragfe] ultragfe=${ultragfe.count} legacy_null_no_user=${legacyNull.count} active_eros=${activeEros} active_evergreen=${activeEvergreen}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[deactivate-ultragfe] fatal", err);
  process.exit(1);
});
