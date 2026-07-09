#!/usr/bin/env node
/**
 * Clean image/CDN URLs from Provider.social_media.extra_links.
 * Run: node scripts/clean-image-extra-links.cjs [--dry-run]
 */
const { PrismaClient } = require("../backend/generated/prisma-client");
const p = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

const IMAGE_PATTERNS = [
  /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)(\?|$)/i,
  /a4cdn\.(?:ch|org)\/profiles\//i,
  /media.*\.tryst/i,
  /tryst\.link\/media/i,
  /cdn\.(?:tryst|imgbox|image)/i,
];

function isImageUrl(url) {
  const s = String(url).toLowerCase();
  return IMAGE_PATTERNS.some(r => r.test(s));
}

(async () => {
  const all = await p.provider.findMany({
    where: { status: "active" },
    select: { id: true, display_name: true, social_media: true },
  });

  let cleaned = 0;
  let totalRemoved = 0;

  for (const prov of all) {
    const sm = (prov.social_media && typeof prov.social_media === "object" && !Array.isArray(prov.social_media))
      ? { ...prov.social_media }
      : {};
    const links = Array.isArray(sm.extra_links) ? sm.extra_links : [];
    const clean = links.filter(u => !isImageUrl(u));

    if (clean.length !== links.length) {
      totalRemoved += links.length - clean.length;
      cleaned++;
      if (clean.length === 0) {
        delete sm.extra_links;
      } else {
        sm.extra_links = clean;
      }
      if (!dryRun) {
        await p.provider.update({ where: { id: prov.id }, data: { social_media: sm } });
      }
    }
  }

  console.log(JSON.stringify({
    event: "clean_image_extra_links",
    dryRun,
    total: all.length,
    cleaned,
    totalRemoved,
  }));

  await p.$disconnect();
})().catch(err => { console.error(err); process.exit(1); });