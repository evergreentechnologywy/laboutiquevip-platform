#!/usr/bin/env node
/**
 * Playwright + Bright Data ISP proxy scraper for Eros photos.
 * Handles Cloudflare Turnstile with real Chromium rendering.
 * Targets remaining providers with empty photos.
 *
 * Usage:
 *   set -a; . ./.env; set +a
 *   NODE_PATH=... node scripts/scrape-eros-playwright.cjs --limit=50
 */
"use strict";

const fs = require("node:fs");
const { chromium } = require("playwright");
const { PrismaClient } = require("../backend/generated/prisma-client");

// ── env ──
function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    if (!(key in process.env)) process.env[key] = rest.join("=").replace(/^["']|["']$/g, "").trim();
  }
}
loadEnv(require("node:path").join(__dirname, "..", ".env"));

const BRD_PROXY = {
  server: "http://brd.superproxy.io:33335",
  username: process.env.BRD_PROXY_USER || "brd-customer-hl_b34cc920-zone-isp_proxy2",
  password: process.env.BRD_PROXY_PASS || "hft551e9wyw2",
};

const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0);
const MAX_PHOTOS = 24;

function resolveErosUrl(provider) {
  for (const raw of [provider.verification_url, provider.review_url].filter(Boolean)) {
    const u = String(raw).trim();
    const m = u.match(/https?:\/\/(?:www|trans|massage)\.eros\.com\/[^\s"'<>]+\/files\/\d+\.htm[^"'<>]*/i);
    if (m) return m[0].split("#")[0];
  }
  return null;
}

async function scrapeOne(provider) {
  const erosUrl = resolveErosUrl(provider);
  if (!erosUrl) return null;

  console.log(`[${provider.display_name}] browser → ${erosUrl.slice(0, 70)}...`);
  const browser = await chromium.launch({
    headless: true,
    proxy: BRD_PROXY,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
      viewport: { width: 1400, height: 900 },
    });
    const page = await context.newPage();

    // Navigate and wait for Cloudflare Turnstile to resolve
    await page.goto(erosUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for either: photos load OR Cloudflare challenge passes (up to 15s)
    try {
      await page.waitForSelector("img[src*='i.eros.com'], img[src*='eros.com/i/'], img[src*='eros.com/profile/']", { timeout: 15000 });
    } catch {
      // Cloudflare may still be resolving — wait a bit more
      await page.waitForTimeout(5000);
    }

    // Extract all image URLs
    const photos = await page.evaluate(() => {
      const urls = new Set();
      // From img tags
      document.querySelectorAll("img[src*='i.eros.com'], img[src*='eros.com/i/'], img[src*='eros.com/profile/']").forEach((img) => {
        const s = img.getAttribute("src") || img.getAttribute("data-src") || "";
        if (s) urls.add(s.split("?")[0]);
      });
      // From background images
      document.querySelectorAll("[style*='i.eros.com'], [data-style*='i.eros.com']").forEach((el) => {
        const style = el.getAttribute("style") || "";
        const m = style.match(/https?:\/\/i\.eros\.com\/[^\s)"']+/);
        if (m) urls.add(m[0]);
      });
      // From page source links
      const html = document.documentElement.outerHTML;
      const re = /https?:\/\/(?:i|[a-z0-9-]+)\.eros\.com\/(?:i|profile)\/[^\s)"'<>]+/gi;
      for (const m of html.matchAll(re)) urls.add(m[0]);
      return [...urls].filter((u) => /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(u) || /\/i\/|\/profile\//i.test(u));
    });

    await context.close();
    await browser.close();

    const filtered = photos.slice(0, MAX_PHOTOS).reverse(); // newest first
    console.log(`[${provider.display_name}] → ${filtered.length} photos`);
    return filtered;
  } catch (e) {
    console.log(`[${provider.display_name}] FAIL: ${e.message.slice(0, 100)}`);
    await browser.close().catch(() => {});
    return null;
  }
}

async function main() {
  const prisma = new PrismaClient();
  const where = {
    status: "active",
    verification_provider: { in: ["eros", "tryst"] },
    photos: { equals: [] },
  };
  let providers = await prisma.provider.findMany({
    where,
    select: { id: true, display_name: true, verification_url: true, review_url: true, photos: true },
    orderBy: { updated_date: "asc" },
    take: LIMIT > 0 ? LIMIT : 300,
  });

  // Filter to only those with valid Eros URLs
  providers = providers.filter((p) => resolveErosUrl(p));
  console.log(`targets=${providers.length} limit=${LIMIT}`);

  let updated = 0;
  let failed = 0;
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    const photos = await scrapeOne(p);
    if (!photos || !photos.length) {
      failed++;
      continue;
    }
    await prisma.$executeRawUnsafe(
      `UPDATE "Provider" SET photos = $1::jsonb, updated_date = NOW() WHERE id = $2::uuid`,
      JSON.stringify(photos),
      p.id,
    );
    updated++;
    console.log(`OK ${p.display_name}: ${photos.length} eros cdn [${i + 1}/${providers.length}] updated=${updated} failed=${failed}`);
    // Short delay between browsers to avoid proxy rate limits
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
  }

  console.log(`done updated=${updated} failed=${failed}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
