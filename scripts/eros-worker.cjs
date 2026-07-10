#!/usr/bin/env node
/**
 * Parallel Eros worker — one IP per instance. Claims empty providers from DB.
 * Run 5 instances in parallel, each with a different Bright Data ISP IP.
 *
 * Usage:
 *   IP=75.153.64.2 node scripts/eros-worker.cjs
 */
"use strict";

const { chromium } = require("playwright");
const { PrismaClient } = require("../backend/generated/prisma-client");

const IP = process.env.IP || "31.105.213.175";
const PROXY = {
  server: "http://brd.superproxy.io:33335",
  username: `brd-customer-hl_b34cc920-zone-isp_proxy3-ip-${IP}`,
  password: "x2bifk0us8r8",
};

async function scrapeOne(provider) {
  const url = provider.verification_url;
  if (!url) return null;
  const browser = await chromium.launch({
    headless: true, proxy: PROXY,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();
  const urls = new Set();
  page.on("response", (r) => {
    const u = r.url();
    if (/eros\.com\/(?:i|profile)\//.test(u) && /\.(jpg|jpeg|png|webp|avif|gif)/i.test(u)) {
      urls.add(u.split("?")[0]);
    }
  });
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(8000);
  } catch (e) {
    console.log(`[${provider.display_name}] IP=${IP} goto err: ${e.message.slice(0, 60)}`);
  }
  await ctx.close();
  await browser.close();
  return [...urls].filter(u =>
    !u.includes("rta.webp") && !u.includes("asacp.webp") && !u.includes("logo") && !u.includes("favicon") && !u.includes("secret-ad") && !u.includes("images/")
  );
}

async function main() {
  const prisma = new PrismaClient();
  let total = 0;
  while (true) {
    const providers = await prisma.provider.findMany({
      where: { status: "active", verification_provider: "eros", photos: { equals: [] } },
      select: { id: true, display_name: true, verification_url: true },
      take: 1,
    });
    if (!providers.length) {
      console.log(`IP=${IP} DONE — no more empty providers`);
      break;
    }
    const prov = providers[0];
    // Claim it atomically with a placeholder to prevent other workers from picking it
    await prisma.$executeRawUnsafe(
      `UPDATE "Provider" SET photos = '["__LOCKED__"]'::jsonb WHERE id = $1::uuid AND photos = '[]'::jsonb`,
      prov.id,
    );

    const photos = await scrapeOne(prov);
    if (photos && photos.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Provider" SET photos = $1::jsonb, updated_date = NOW() WHERE id = $2::uuid`,
        JSON.stringify(photos), prov.id,
      );
      total++;
      console.log(`OK ${prov.display_name} IP=${IP} ${photos.length} photos [total=${total}]`);
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "Provider" SET photos = '[]'::jsonb WHERE id = $1::uuid`,
        prov.id,
      );
      console.log(`FAIL ${prov.display_name} IP=${IP} — 0 photos`);
    }
    // Short delay between profiles to avoid rate limits
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`IP=${IP} EXIT total=${total}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
