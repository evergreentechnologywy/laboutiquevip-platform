#!/usr/bin/env node
/**
 * Deactivate duplicate Provider rows, keeping the best profile per dedupe key.
 * Groups by Eros file id or normalized (display_name + city + state).
 */

import {
  providerDedupeKey,
  providerKeepScore,
  normalizeProviderName,
} from "./lib/eros-url.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const dryRun = args.has("dry-run");

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

function uniqueUrls(urls) {
  return [...new Set((urls ?? []).filter(Boolean))];
}

const prisma = await createPrismaClient();

try {
  const providers = await prisma.provider.findMany({
    where: {
      OR: [
        { status: "active" },
        { verification_provider: "eros", verification_url: { not: null } },
      ],
    },
    select: {
      id: true,
      display_name: true,
      location_city: true,
      location_state: true,
      verification_provider: true,
      verification_url: true,
      photos: true,
      status: true,
      is_verified: true,
      is_premium: true,
      is_profile_approved: true,
      updated_date: true,
    },
  });

  const groups = new Map();
  for (const provider of providers) {
    const key = providerDedupeKey(provider);
    const list = groups.get(key) ?? [];
    list.push(provider);
    groups.set(key, list);
  }

  let deactivated = 0;
  const citiesAffected = new Set();

  for (const [key, group] of groups) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) => providerKeepScore(b) - providerKeepScore(a));
    const winner = sorted[0];
    const losers = sorted.slice(1);

    const mergedPhotos = uniqueUrls([
      ...(Array.isArray(winner.photos) ? winner.photos : []),
      ...losers.flatMap((p) => (Array.isArray(p.photos) ? p.photos : [])),
    ]).slice(0, 32);

    if (winner.location_city) citiesAffected.add(winner.location_city);

    console.log(
      `[dedupe] ${key}: keep ${winner.display_name} (${winner.id}) score=${providerKeepScore(winner).toFixed(0)}; ` +
        `deactivate ${losers.map((p) => `${p.display_name}:${p.id.slice(0, 8)}`).join(", ")}`,
    );

    if (dryRun) {
      deactivated += losers.length;
      continue;
    }

    if (mergedPhotos.length > (Array.isArray(winner.photos) ? winner.photos.length : 0)) {
      await prisma.provider.update({
        where: { id: winner.id },
        data: { photos: mergedPhotos, updated_date: new Date() },
      });
    }

    for (const loser of losers) {
      if (loser.id === winner.id) continue;
      await prisma.provider.update({
        where: { id: loser.id },
        data: {
          status: "inactive",
          admin_notes: `dedupe merge into ${winner.id} (${normalizeProviderName(winner.display_name)})`,
          updated_date: new Date(),
        },
      });
      deactivated += 1;
    }
  }

  console.log(JSON.stringify({
    dryRun,
    duplicateGroups: [...groups.values()].filter((g) => g.length > 1).length,
    deactivated,
    cities: [...citiesAffected].sort(),
  }));
} finally {
  await prisma.$disconnect();
}
