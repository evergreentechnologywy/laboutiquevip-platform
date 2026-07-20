#!/usr/bin/env node
/**
 * Pre-dedupe migration: hard-delete duplicate Provider rows before adding unique constraint.
 *
 * Strategy:
 *   1. Group by (verification_provider, lower(trim(verification_url))) WHERE verification_url IS NOT NULL
 *   2. Keep the best row per group (most photos, verified, oldest with photos)
 *   3. Hard-delete the rest
 *   4. Also group by (verification_provider, normalized name, city, state) for non-URL dupes
 *   5. Same keep logic
 *
 * Run with --dry-run to preview. Run without to execute.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const dryRun = args.has("dry-run");
const verbose = args.has("verbose");

const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function createPrismaClient() {
  try {
    const generated = await dynamicImport("../backend/generated/prisma-client/index.js");
    if (generated?.PrismaClient) return new generated.PrismaClient();
  } catch {}
  const runtime = await dynamicImport("@prisma/client");
  if (!runtime?.PrismaClient) throw new Error("PrismaClient not available.");
  return new runtime.PrismaClient();
}

function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(url) {
  return String(url ?? "")
    .trim()
    .toLowerCase()
    .replace(/\?.*$/, "");
}

function keepScore(p) {
  const photos = Array.isArray(p.photos) ? p.photos.length : 0;
  let score = photos * 10;
  if (p.status === "active") score += 1000;
  if (p.is_verified) score += 500;
  if (p.is_premium) score += 200;
  if (p.is_profile_approved) score += 100;
  if (p.verification_provider === "eros") score += 50;
  if (p.p411_url || p.ter_url || p.pd_url || p.tob_url) score += 300;
  const created = p.created_date ? new Date(p.created_date).getTime() : 0;
  return score + created / 1e12;
}

const prisma = await createPrismaClient();
let totalDeleted = 0;

try {
  // ── Phase 1: URL-based dedupe ──
  console.log("=== Phase 1: URL-based dedupe ===");
  const allProviders = await prisma.provider.findMany({
    where: {
      verification_url: { not: null },
      verification_provider: { in: ["eros", "tryst"] },
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
      p411_url: true,
      ter_url: true,
      pd_url: true,
      tob_url: true,
      created_date: true,
    },
  });

  // Group by normalized (provider, url)
  const urlGroups = new Map();
  for (const p of allProviders) {
    const key = `${p.verification_provider}||${normalizeUrl(p.verification_url)}`;
    if (!urlGroups.has(key)) urlGroups.set(key, []);
    urlGroups.get(key).push(p);
  }

  let urlDupesFound = 0;
  let urlDeleted = 0;
  const toDeleteUrl = [];

  for (const [key, group] of urlGroups) {
    if (group.length < 2) continue;
    urlDupesFound++;
    const sorted = [...group].sort((a, b) => keepScore(b) - keepScore(a));
    const winner = sorted[0];
    const losers = sorted.slice(1);
    if (verbose) {
      console.log(`  [url-dupe] ${key}: keep ${winner.display_name} (${winner.id.slice(0, 8)}); delete ${losers.length}`);
    }
    for (const loser of losers) {
      toDeleteUrl.push(loser.id);
      urlDeleted++;
    }
  }

  console.log(`URL dupes: ${urlDupesFound} groups, ${urlDeleted} rows to delete`);

  // ── Phase 2: Name+City+State dedupe ──
  console.log("\n=== Phase 2: Name+City+State dedupe ===");
  const nameGroups = new Map();
  for (const p of allProviders) {
    if (toDeleteUrl.includes(p.id)) continue;
    const city = String(p.location_city ?? "").toLowerCase().trim();
    const state = String(p.location_state ?? "").toLowerCase().trim();
    if (!city || !state) continue;
    const key = `${p.verification_provider}||${normalizeName(p.display_name)}||${city}||${state}`;
    if (!nameGroups.has(key)) nameGroups.set(key, []);
    nameGroups.get(key).push(p);
  }

  let nameDupesFound = 0;
  let nameDeleted = 0;
  const toDeleteName = [];

  for (const [key, group] of nameGroups) {
    if (group.length < 2) continue;
    nameDupesFound++;
    const sorted = [...group].sort((a, b) => keepScore(b) - keepScore(a));
    const winner = sorted[0];
    const losers = sorted.slice(1);
    if (verbose) {
      console.log(`  [name-dupe] ${key}: keep ${winner.display_name} (${winner.id.slice(0, 8)}); delete ${losers.length}`);
    }
    for (const loser of losers) {
      toDeleteName.push(loser.id);
      nameDeleted++;
    }
  }

  console.log(`Name dupes: ${nameDupesFound} groups, ${nameDeleted} rows to delete`);

  const allToDelete = [...new Set([...toDeleteUrl, ...toDeleteName])];
  console.log(`\n=== Summary ===`);
  console.log(`Total rows to hard-delete: ${allToDelete.length}`);
  console.log(`Dry run: ${dryRun}`);

  if (dryRun || allToDelete.length === 0) {
    if (dryRun && allToDelete.length > 0) {
      const samples = await prisma.provider.findMany({
        where: { id: { in: allToDelete.slice(0, 20) } },
        select: { id: true, display_name: true, location_city: true, location_state: true, verification_provider: true, verification_url: true },
      });
      console.log("\nSample rows to delete:");
      for (const s of samples) {
        console.log(`  ${s.display_name} | ${s.location_city}, ${s.location_state} | ${s.verification_provider} | ${s.id.slice(0, 8)}`);
      }
    }
  } else {
    for (let i = 0; i < allToDelete.length; i += 100) {
      const batch = allToDelete.slice(i, i + 100);
      const result = await prisma.provider.deleteMany({
        where: { id: { in: batch } },
      });
      totalDeleted += result.count;
      console.log(`  Deleted batch ${Math.floor(i / 100) + 1}: ${result.count} rows`);
    }
    console.log(`\nTotal deleted: ${totalDeleted}`);
  }
} finally {
  await prisma.$disconnect();
}
