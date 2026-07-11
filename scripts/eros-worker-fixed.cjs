#!/usr/bin/env node
"use strict";
const { chromium } = require("playwright");
const { PrismaClient } = require("../backend/generated/prisma-client");

const ZONE = process.env.ZONE || "eros_uk_1783751375";
const ZPASS = process.env.ZONE_PASS || "3ptkunjqgyg0";
const SESSION = process.env.SESSION || "w1";
const PROXY = {
  server: "http://brd.superproxy.io:33335",
  username: `brd-customer-hl_b34cc920-zone-${ZONE}-session-${SESSION}`,
  password: ZPASS,
};

async function scrape(browser, provider) {
  const url = provider.verification_url;
  if (!url) return null;
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();
  const allUrls = [];
  ctx.on("response", r => allUrls.push(r.url()));
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(8000);
  } catch (e) { /* ok */ }
  await ctx.close();
  return [...new Set(allUrls.filter(u =>
    /eros\.com\/(?:i|profile)\//.test(u) && /\.(jpg|jpeg|png|webp|avif|gif)/i.test(u)
  ).map(u => u.split("?")[0]))].filter(u =>
    !u.includes("rta.webp") && !u.includes("asacp.webp") && !u.includes("logo") && !u.includes("secret-ad")
  );
}

async function main() {
  const prisma = new PrismaClient();
  const browser = await chromium.launch({
    headless: true, proxy: PROXY,
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"],
  });
  let total = 0;
  while (true) {
    const providers = await prisma.provider.findMany({
      where: { status: "active", verification_provider: "eros", photos: { equals: [] } },
      select: { id: true, display_name: true, verification_url: true },
      take: 1,
    });
    if (!providers.length) { console.log(`[${SESSION}] DONE`); break; }
    const p = providers[0];
    await prisma.$executeRawUnsafe(
      `UPDATE "Provider" SET photos = '["__LOCKED__"]'::jsonb WHERE id = $1::uuid AND photos = '[]'::jsonb`, p.id);
    const photos = await scrape(browser, p);
    if (photos && photos.length) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Provider" SET photos = $1::jsonb, updated_date = NOW() WHERE id = $2::uuid`,
        JSON.stringify(photos), p.id);
      total++;
      console.log(`OK ${p.display_name} ${SESSION} ${photos.length} [${total}]`);
    } else {
      await prisma.$executeRawUnsafe(`UPDATE "Provider" SET photos = '[]'::jsonb WHERE id = $1::uuid`, p.id);
      console.log(`FAIL ${p.display_name} ${SESSION}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  await browser.close();
  console.log(`[${SESSION}] EXIT total=${total}`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
