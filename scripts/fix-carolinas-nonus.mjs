#!/usr/bin/env node
/**
 * Normalize Carolinas regional rows → NC/SC and soft-hide non-US markets.
 *
 * Usage:
 *   node scripts/fix-carolinas-nonus.mjs
 *   node scripts/fix-carolinas-nonus.mjs --apply
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseErosLocationFromUrl } from "./lib/eros-location.mjs";
import { canonicalizePublicCity, knownCityState } from "./lib/city-canon.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { PrismaClient } = require(
  path.join(__dirname, "../backend/generated/prisma-client"),
);

const APPLY = process.argv.includes("--apply");
const NOTE_NONUS = "catalog-sync: non-us-market hide";
const NOTE_CAR = "catalog-sync: carolinas→us-state";

const NC_HINTS =
  /\b(charlotte|raleigh|durham|greensboro|asheville|winston|cary|fayetteville|wilmington nc|chapel hill)\b/i;
const SC_HINTS =
  /\b(charleston|columbia|greenville|myrtle|hilton head|spartanburg|rock hill)\b/i;

const NON_US_STATES = new Set(
  [
    "ontario",
    "england",
    "uk",
    "united kingdom",
    "hong kong",
    "canada",
    "mexico",
    "australia",
    "france",
    "germany",
    "spain",
    "italy",
    "brazil",
    "colombia",
  ].map((s) => s.toLowerCase()),
);

function deriveCarolinasState(row) {
  const url = String(row.verification_url || "");
  const fromUrl = parseErosLocationFromUrl(url);
  if (fromUrl.state && /^[A-Z]{2}$/.test(fromUrl.state)) {
    const city = fromUrl.city
      ? canonicalizePublicCity(fromUrl.city, fromUrl.state)?.name || fromUrl.city
      : row.location_city;
    return {
      state: fromUrl.state,
      city: city && String(city).toLowerCase() !== "statewide" ? city : fromUrl.city || row.location_city,
      stateWide: Boolean(fromUrl.stateWide),
      source: "url",
    };
  }

  const blob = [row.location_city, row.display_name, url].filter(Boolean).join(" ");
  if (NC_HINTS.test(blob)) {
    const m = blob.match(NC_HINTS);
    const hint = m?.[1] || "Charlotte";
    const c = canonicalizePublicCity(hint, "NC");
    return { state: "NC", city: c?.name || hint, stateWide: false, source: "hint-nc" };
  }
  if (SC_HINTS.test(blob)) {
    const m = blob.match(SC_HINTS);
    const hint = m?.[1] || "Charleston";
    const c = canonicalizePublicCity(hint, "SC");
    return { state: "SC", city: c?.name || hint, stateWide: false, source: "hint-sc" };
  }

  const cityRaw = String(row.location_city || "").trim();
  if (cityRaw && !/^statewide$/i.test(cityRaw) && !/^carolinas$/i.test(cityRaw)) {
    const ks = knownCityState(cityRaw);
    if (ks === "NC" || ks === "SC") {
      const c = canonicalizePublicCity(cityRaw, ks);
      return { state: ks, city: c?.name || cityRaw, stateWide: false, source: "city-map" };
    }
  }

  // Dual-region statewide ads: park under NC Statewide; SC search still matches via Carolinas branch until gone.
  return {
    state: "NC",
    city: "Statewide",
    stateWide: true,
    source: "carolinas-default-nc",
  };
}

function isNonUsState(raw) {
  const t = String(raw || "").trim().toLowerCase();
  if (!t) return false;
  if (NON_US_STATES.has(t)) return true;
  if (/^[a-z]{2}$/i.test(t)) return false;
  // Keep US full names / Carolinas / Puerto Rico for other paths
  if (t === "carolinas" || t === "puerto rico") return false;
  return false;
}

async function main() {
  const prisma = new PrismaClient();
  const summary = {
    apply: APPLY,
    carolinasScanned: 0,
    carolinasUpdated: 0,
    nonUsHidden: 0,
    puertoRicoFixed: 0,
    samples: { carolinas: [], nonUs: [] },
  };

  try {
    const carolinas = await prisma.provider.findMany({
      where: {
        status: "active",
        location_state: { equals: "Carolinas", mode: "insensitive" },
      },
      select: {
        id: true,
        display_name: true,
        location_city: true,
        location_state: true,
        verification_url: true,
        social_media: true,
        admin_notes: true,
      },
    });
    summary.carolinasScanned = carolinas.length;

    for (const row of carolinas) {
      const d = deriveCarolinasState(row);
      const nextCity =
        d.city && String(d.city).trim()
          ? String(d.city).trim()
          : row.location_city;
      const sm =
        row.social_media && typeof row.social_media === "object" && !Array.isArray(row.social_media)
          ? { ...row.social_media }
          : {};
      if (d.stateWide) sm.eros_state_wide = true;
      sm.carolinas_hub = true;
      sm.carolinas_normalized_to = d.state;

      const note = String(row.admin_notes || "");
      const nextNotes = note.includes(NOTE_CAR) ? note : [note, NOTE_CAR].filter(Boolean).join(" | ");

      if (summary.samples.carolinas.length < 12) {
        summary.samples.carolinas.push({
          id: row.id,
          name: row.display_name,
          from: `${row.location_city}|${row.location_state}`,
          to: `${nextCity}|${d.state}`,
          source: d.source,
        });
      }

      if (!APPLY) continue;
      await prisma.provider.update({
        where: { id: row.id },
        data: {
          location_state: d.state,
          location_city: nextCity,
          social_media: sm,
          admin_notes: nextNotes,
        },
      });
      summary.carolinasUpdated += 1;
    }

    const prRows = await prisma.provider.findMany({
      where: {
        status: "active",
        location_state: { equals: "Puerto Rico", mode: "insensitive" },
      },
      select: { id: true, location_city: true, admin_notes: true },
    });
    for (const row of prRows) {
      if (!APPLY) {
        summary.puertoRicoFixed += 1;
        continue;
      }
      await prisma.provider.update({
        where: { id: row.id },
        data: {
          location_state: "PR",
          location_city: row.location_city || "Statewide",
        },
      });
      summary.puertoRicoFixed += 1;
    }

    // Non-US markets still active
    const candidates = await prisma.provider.findMany({
      where: { status: "active" },
      select: {
        id: true,
        display_name: true,
        location_city: true,
        location_state: true,
        admin_notes: true,
      },
    });
    for (const row of candidates) {
      if (!isNonUsState(row.location_state)) continue;
      if (summary.samples.nonUs.length < 15) {
        summary.samples.nonUs.push({
          id: row.id,
          name: row.display_name,
          city: row.location_city,
          state: row.location_state,
        });
      }
      if (!APPLY) {
        summary.nonUsHidden += 1;
        continue;
      }
      const note = String(row.admin_notes || "");
      await prisma.provider.update({
        where: { id: row.id },
        data: {
          status: "inactive",
          admin_notes: note.includes(NOTE_NONUS)
            ? note
            : [note, NOTE_NONUS].filter(Boolean).join(" | "),
        },
      });
      summary.nonUsHidden += 1;
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
