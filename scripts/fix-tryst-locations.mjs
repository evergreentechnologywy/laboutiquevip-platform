#!/usr/bin/env node
/**
 * Repair Tryst provider rows with invalid location_state/location_city (bio scrape pollution).
 * Prefers hub metadata from social_media.tryst_profile when present.
 *
 * Usage:
 *   node scripts/fix-tryst-locations.mjs [--dry-run] [--limit=500]
 */
import { parseTrystCityUrl } from "./lib/tryst-location.mjs";

const dryRun = process.argv.includes("--dry-run");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0);

const VALID_STATE = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
  "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY",
]);

function isValidState(value) {
  return VALID_STATE.has(String(value || "").trim().toUpperCase());
}

function isValidCity(value) {
  const city = String(value || "").trim();
  return city.length > 0 && city.length <= 80 && !/https?:\/\//i.test(city);
}

function hubFromSocial(social) {
  if (!social || typeof social !== "object") return null;
  const profile = social.tryst_profile || social.trystProfile;
  if (!profile || typeof profile !== "string") return null;
  const cityMatch = profile.match(/tryst\.link\/us\/escorts\/([a-z0-9-]+)\/([a-z0-9-]+)/i);
  if (!cityMatch) return null;
  return parseTrystCityUrl(`https://tryst.link/us/escorts/${cityMatch[1]}/${cityMatch[2]}`);
}

const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function createPrismaClient() {
  try {
    const generated = await dynamicImport("../backend/generated/prisma-client/index.js");
    if (generated?.PrismaClient) return new generated.PrismaClient();
  } catch {
    // fallback
  }
  const runtime = await dynamicImport("@prisma/client");
  return new runtime.PrismaClient();
}

const prisma = await createPrismaClient();

const rows = await prisma.provider.findMany({
  where: { verification_provider: "tryst" },
  select: {
    id: true,
    location_city: true,
    location_state: true,
    social_media: true,
    verification_url: true,
  },
  ...(limit > 0 ? { take: limit } : {}),
});

let scanned = 0;
let fixed = 0;
let skipped = 0;

for (const row of rows) {
  scanned += 1;
  const stateOk = isValidState(row.location_state);
  const cityOk = isValidCity(row.location_city);
  if (stateOk && cityOk) {
    skipped += 1;
    continue;
  }

  const hub =
    hubFromSocial(row.social_media) ||
    (row.verification_url?.includes("/us/escorts/")
      ? parseTrystCityUrl(row.verification_url)
      : null);

  if (!hub) {
    skipped += 1;
    continue;
  }

  const nextCity = cityOk ? row.location_city : hub.cityName;
  const nextState = stateOk ? row.location_state : hub.stateAbbrev;

  if (nextCity === row.location_city && nextState === row.location_state) {
    skipped += 1;
    continue;
  }

  console.log(
    `[fix-tryst-locations] ${row.id} ${row.location_state}/${row.location_city} -> ${nextState}/${nextCity}`,
  );

  if (!dryRun) {
    await prisma.provider.update({
      where: { id: row.id },
      data: { location_city: nextCity, location_state: nextState },
    });
  }
  fixed += 1;
}

console.log(
  `fix-tryst-locations complete scanned=${scanned} fixed=${fixed} skipped=${skipped} dryRun=${dryRun}`,
);
await prisma.$disconnect();
