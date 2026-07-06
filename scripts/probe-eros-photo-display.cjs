#!/usr/bin/env node
/**
 * Sample active Eros providers and check resolved public photo URLs return HTTP 200.
 */
const { PrismaClient } = require("../backend/generated/prisma-client");

const BASE = process.env.PUBLIC_BASE || "https://www.laboutiquevip.net";
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 20);

function isR2(u) {
  return String(u || "").includes("/api/r2-photo/");
}
function isEros(u) {
  return /(?:^|\/\/)(?:[\w-]+\.)?eros\.com\/(?:i|profile)\//i.test(String(u || ""));
}
function resolve(src, id) {
  const v = String(src || "").trim();
  if (!v) return null;
  if (isR2(v)) {
    const i = v.indexOf("/api/r2-photo/");
    return i >= 0 ? v.slice(i) : v;
  }
  if (isEros(v)) {
    const p = new URLSearchParams({ url: v });
    if (id) p.set("providerId", String(id));
    return `/api/eros-photo?${p}`;
  }
  return v;
}
function primary(p) {
  const photos = Array.isArray(p.photos) ? p.photos : [];
  const src = photos.find(isR2) || photos.find(isEros) || photos[0] || null;
  return resolve(src, p.id);
}

async function main() {
  const prisma = new PrismaClient();
  const providers = await prisma.provider.findMany({
    where: { verification_provider: "eros", status: "active" },
    select: { id: true, photos: true, display_name: true },
    take: limit,
    orderBy: { updated_date: "desc" },
  });

  const results = [];
  for (const p of providers) {
    const url = primary(p);
    if (!url) {
      results.push({ id: p.id, name: p.display_name, status: "no_photo" });
      continue;
    }
    const abs = url.startsWith("http") ? url : `${BASE}${url}`;
    try {
      const res = await fetch(abs, { method: "GET" });
      const ct = res.headers.get("content-type") || "";
      results.push({
        id: p.id,
        name: p.display_name,
        code: res.status,
        ct,
        kind: url.includes("r2-photo") ? "r2" : url.includes("eros-photo") ? "proxy" : "other",
        bytes: Number(res.headers.get("content-length") || 0),
      });
    } catch (err) {
      results.push({ id: p.id, name: p.display_name, status: "fetch_error", error: err.message });
    }
  }

  console.log(JSON.stringify(results, null, 2));
  const ok = results.filter((r) => r.code === 200).length;
  const fail = results.filter((r) => r.code && r.code !== 200).length;
  const none = results.filter((r) => r.status === "no_photo").length;
  const err = results.filter((r) => r.status === "fetch_error").length;
  console.log(JSON.stringify({ sample: results.length, ok, fail, none, err }));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
