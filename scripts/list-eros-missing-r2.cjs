#!/usr/bin/env node
/** List active Eros provider IDs that have no /api/r2-photo/ URLs. */
const { PrismaClient } = require("../backend/generated/prisma-client");

async function main() {
  const prisma = new PrismaClient();
  const providers = await prisma.provider.findMany({
    where: { verification_provider: "eros", status: "active" },
    select: { id: true, photos: true },
  });
  const missing = providers.filter((p) => {
    const photos = Array.isArray(p.photos) ? p.photos : [];
    return !photos.some((u) => String(u).includes("/api/r2-photo/"));
  });
  for (const p of missing) console.log(p.id);
  console.error(`missing_r2=${missing.length} total_active=${providers.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
