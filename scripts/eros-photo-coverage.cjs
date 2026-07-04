#!/usr/bin/env node
/**
 * Report active Eros provider photo URL coverage.
 */
const { PrismaClient } = require("../backend/generated/prisma-client");

const prisma = new PrismaClient();

function classifyUrl(url) {
  const s = String(url || "");
  if (s.includes("/api/r2-photo/")) return "r2";
  if (s.includes("/api/eros-photo")) return "proxy";
  if (/eros\.com/i.test(s)) return "eros";
  return "other";
}

async function main() {
  const providers = await prisma.provider.findMany({
    where: { verification_provider: "eros", status: "active" },
    select: { id: true, photos: true, display_name: true, verification_url: true },
  });

  let empty = 0;
  let nonEmpty = 0;
  let onlyEros = 0;
  let onlyR2 = 0;
  let onlyProxy = 0;
  let mixed = 0;
  let other = 0;
  const samples = { eros: [], r2: [], empty: [], mixed: [] };

  for (const p of providers) {
    const photos = Array.isArray(p.photos) ? p.photos.filter(Boolean) : [];
    if (photos.length === 0) {
      empty += 1;
      if (samples.empty.length < 8) {
        samples.empty.push({ id: p.id, name: p.display_name, url: p.verification_url });
      }
      continue;
    }
    nonEmpty += 1;

    const kinds = new Set(photos.map(classifyUrl));
    const hasR2 = kinds.has("r2");
    const hasEros = kinds.has("eros");
    const hasProxy = kinds.has("proxy");
    const hasOther = kinds.has("other");

    if (hasR2 && !hasEros && !hasProxy && !hasOther) {
      onlyR2 += 1;
      if (samples.r2.length < 10) samples.r2.push({ id: p.id, name: p.display_name, url: photos[0] });
    } else if (hasEros && !hasR2 && !hasProxy) {
      onlyEros += 1;
      if (samples.eros.length < 10) samples.eros.push({ id: p.id, name: p.display_name, url: photos[0] });
    } else if (hasProxy && !hasR2 && !hasEros) {
      onlyProxy += 1;
    } else if (hasR2 || hasEros || hasProxy) {
      mixed += 1;
      if (samples.mixed.length < 8) {
        samples.mixed.push({ id: p.id, name: p.display_name, photos: photos.slice(0, 3) });
      }
    } else {
      other += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        total: providers.length,
        empty,
        nonEmpty,
        onlyEros,
        onlyR2,
        onlyProxy,
        mixed,
        other,
        samples,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
