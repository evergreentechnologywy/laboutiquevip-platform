#!/usr/bin/env node
/**
 * Rotating-IP Playwright scraper for Eros profiles.
 * Uses Bright Data isp_proxy3 static IPs — one per profile to avoid Cloudflare.
 * After each IP is used, rotates to the next.
 * 
 * Usage: node scripts/scrape-eros-rotate.cjs
 */
"use strict";

const { chromium } = require("playwright");
const { PrismaClient } = require("../backend/generated/prisma-client");

const ZONE_PASS = "x2bifk0us8r8";
const IP_POOL = [
  "75.153.64.2",
  "168.158.39.13",
  "31.105.213.175",
  "31.105.219.28",
  "37.49.147.92",
];
let ipIndex = 0;

function nextIp() {
  const ip = IP_POOL[ipIndex % IP_POOL.length];
  ipIndex++;
  return ip;
}

async function scrapeOne(browser, provider) {
  const url = provider.verification_url;
  if (!url) return null;

  const ip = nextIp();
  const proxyUser = `brd-customer-hl_b34cc920-zone-isp_proxy3-ip-${ip}`;
  console.log(`[${provider.display_name}] IP=${ip} → ${url.slice(0, 60)}...`);

  const ctx = await browser.newContext({
    proxy: { server: `http://brd.superproxy.io:33335`, username: proxyUser, password: ZONE_PASS },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();

  const photoUrls = new Set();
  page.on("response", (resp) => {
    const u = resp.url();
    if (/eros\.com\/(?:i|profile)\//.test(u) && /\.(jpg|jpeg|png|webp|avif|gif)/i.test(u)) {
      photoUrls.add(u.split("?")[0]);
    }
  });

  try {
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(8000);
  } catch (e) {
    console.log(`[${provider.display_name}] goto err: ${e.message.slice(0, 60)}`);
  }

  await ctx.close();

  const photos = [...photoUrls].filter(u =>
    !u.includes("rta.webp") && !u.includes("asacp.webp") && !u.includes("logo") && !u.includes("favicon") && !u.includes("secret-ad")
  );
  console.log(`[${provider.display_name}] → ${photos.length} photos`);
  return photos;
}

async function main() {
  const prisma = new PrismaClient();
  const providers = await prisma.provider.findMany({
    where: { status: "active", verification_provider: "eros", photos: { equals: [] } },
    select: { id: true, display_name: true, verification_url: true },
  });

  if (!providers.length) { console.log("no empty providers"); await prisma.$disconnect(); return; }
  console.log(`targets: ${providers.length}, IPs: ${IP_POOL.length}`);

  let updated = 0, failed = 0;

  // Batch per IP rotation cycle
  const BATCH = IP_POOL.length;
  for (let batchStart = 0; batchStart < providers.length; batchStart += BATCH) {
    const batch = providers.slice(batchStart, batchStart + BATCH);
    console.log(`\n=== BATCH ${Math.floor(batchStart / BATCH) + 1}: ${batch.length} profiles, using fresh IPs ===`);

    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    for (const p of batch) {
      const photos = await scrapeOne(browser, p);
      if (!photos || !photos.length) { failed++; continue; }
      await prisma.$executeRawUnsafe(
        `UPDATE "Provider" SET photos = $1::jsonb, updated_date = NOW() WHERE id = $2::uuid`,
        JSON.stringify(photos), p.id,
      );
      updated++;
      console.log(`  OK ${p.display_name}: ${photos.length}`);
      // Short delay between profiles on same batch
      await new Promise(r => setTimeout(r, 1000));
    }

    await browser.close();

    if (batchStart + BATCH < providers.length) {
      // Wait for Cloudflare cooldown before next IP batch
      console.log(`  waiting 60s for IP cooldown...`);
      await new Promise(r => setTimeout(r, 60000));
    }
  }

  console.log(`\ndone updated=${updated} failed=${failed}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
