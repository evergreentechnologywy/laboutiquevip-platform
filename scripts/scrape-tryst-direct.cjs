#!/usr/bin/env node
/**
 * Direct Tryst photo scraper using curl (Node fetch blocked by Tryst TLS fingerprinting).
 * Extracts media-v2.tryst.a4cdn.org URLs from profile pages.
 */
"use strict";

const { execFileSync } = require("node:child_process");
const { PrismaClient } = require("../backend/generated/prisma-client");

const CONCURRENCY = 6;
const MAX_PHOTOS = 32;

function fetchTryst(url) {
  try {
    const out = execFileSync("curl", [
      "-s", "--connect-timeout", "12", "--max-time", "15",
      "-H", "Accept: text/html,application/xhtml+xml",
      "-H", "Accept-Language: en-US,en;q=0.9",
      "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
      url,
    ], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 15000 });
    return out;
  } catch { return null; }
}

function extractTrystPhotos(html) {
  const urls = new Set();
  const re = /https?:\/\/media-v2\.tryst\.a4cdn\.org\/profiles\/[a-f0-9-]+\/photos\/[a-f0-9-]+\/[^\s"'<>)]+/gi;
  for (const m of html.matchAll(re)) {
    let u = m[0].replace(/[),.;]+$/, "");
    u = u.replace(/\/thumb\.(jpe?g|png|webp|avif)/i, ".$1");
    urls.add(u);
  }
  if (urls.size === 0) {
    const re2 = /https?:\/\/[^"'\s]*?a4cdn\.(?:org|ch)\/[^"'\s]*?\.(jpe?g|png|webp|avif)/gi;
    for (const m of html.matchAll(re2)) {
      const u = m[0].replace(/[),.;]+$/, "");
      if (!u.includes("static/") && !u.includes("opengraph") && !u.includes("sharks") && !u.includes("logo"))
        urls.add(u);
    }
  }
  return [...urls].slice(0, MAX_PHOTOS);
}

async function main() {
  const prisma = new PrismaClient();
  const providers = await prisma.provider.findMany({
    where: { status: "active", verification_provider: "tryst", photos: { equals: [] } },
    select: { id: true, display_name: true, verification_url: true },
  });
  console.log(`tryst targets: ${providers.length}`);

  let updated = 0, failed = 0, cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= providers.length) break;
      const p = providers[i];
      if (!p.verification_url) { failed++; continue; }
      const html = fetchTryst(p.verification_url);
      if (!html) { failed++; console.log(`FAIL ${p.display_name}`); continue; }
      const photos = extractTrystPhotos(html);
      if (!photos.length) { failed++; console.log(`NOPE ${p.display_name}`); continue; }
      await prisma.$executeRawUnsafe(
        `UPDATE "Provider" SET photos = $1::jsonb, updated_date = NOW() WHERE id = $2::uuid`,
        JSON.stringify(photos), p.id);
      updated++;
      console.log(`OK ${p.display_name}: ${photos.length} [${i+1}/${providers.length}]`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`done updated=${updated} failed=${failed}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
