#!/usr/bin/env node
/**
 * Recover null location_city for active providers.
 * Priority:
 *  1) Eros URL real city hub
 *  2) Eros URL metro hub (new_york/new_york → New York) when slug is a known city
 *  3) Tryst city URL
 *  4) display_name / tagline "in|visit City" ONLY if City is known
 *  5) Eros state-only / unknown state hub → Statewide
 *  6) Any residual row with valid location_state → Statewide
 *
 * Usage:
 *   node scripts/recover-null-cities.mjs
 *   node scripts/recover-null-cities.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseErosLocationFromUrl,
  resolveStateAbbrev,
} from "./lib/eros-location.mjs";
import { parseTrystCityUrl, titleCaseWords } from "./lib/tryst-location.mjs";
import {
  applyCityCanon,
  canonicalizePublicCity,
  extractTrailingKnownCity,
  knownCityState,
  normalizeCityKey,
} from "./lib/city-canon.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");

const STATE_NAME_KEYS = new Set(
  [
    "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
    "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
    "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
    "minnesota","mississippi","missouri","montana","nebraska","nevada",
    "new hampshire","new jersey","new mexico","new york","north carolina",
    "north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island",
    "south carolina","south dakota","tennessee","texas","utah","vermont",
    "virginia","washington","west virginia","wisconsin","wyoming",
    "district of columbia","carolinas","canada",
  ].map((s) => s.replace(/\s+/g, " ")),
);

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    if (!(key in process.env)) {
      process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

loadEnv("/srv/apps/trystlike/repo/.env");
loadEnv(path.resolve(__dirname, "../.env"));

const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function createPrisma() {
  const candidates = [
    path.resolve(__dirname, "../backend/generated/prisma-client/index.js"),
    "/srv/apps/trystlike/repo/backend/generated/prisma-client/index.js",
  ];
  for (const c of candidates) {
    try {
      const mod = await dynamicImport(c);
      if (mod?.PrismaClient) return new mod.PrismaClient();
    } catch {
      /* next */
    }
  }
  throw new Error("PrismaClient not found");
}

function isKnownCityName(name) {
  const n = String(name || "").trim();
  if (!n) return false;
  if (knownCityState(n)) return true;
  const c = canonicalizePublicCity(n);
  // accept only when canon maps to a known city key (not free-form title case)
  if (!c?.name || c.name === "Statewide") return false;
  return Boolean(knownCityState(c.name));
}

function acceptCity(raw, stateHint) {
  const c = canonicalizePublicCity(raw, stateHint);
  if (!c?.name || c.name === "Statewide") return null;
  if (!isKnownCityName(c.name) && !knownCityState(raw)) {
    // still allow extractTrailingKnownCity results already known
    return null;
  }
  return c.name;
}

function collectUrls(row) {
  const urls = [];
  if (row.verification_url) urls.push(String(row.verification_url));
  const sm = row.social_media;
  if (sm && typeof sm === "object") {
    for (const v of Object.values(sm)) {
      if (typeof v === "string" && /^https?:\/\//i.test(v)) urls.push(v);
    }
  }
  return urls;
}

function cityFromNameOrTag(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const m = raw.match(
    /\b(?:in|visit(?:ing)?|outcall\s+in)\s+([A-Za-z][A-Za-z .'-]{1,40})$/i,
  );
  if (m) {
    const hit = acceptCity(m[1].trim());
    if (hit) return hit;
    // Secaucus etc. may not be in CITY_TO_STATE — keep only multi-word or known
    const candidate = m[1].trim();
    if (candidate.length >= 4 && !/^\d/.test(candidate)) {
      // reject if looks like a person name (two capitalized tokens without known city)
      // keep only if extractTrailingKnownCity finds something
    }
  }

  const trail = extractTrailingKnownCity(raw);
  if (trail && isKnownCityName(trail)) return canonicalizePublicCity(trail).name;

  // NYC / LA short aliases only via canonicalize when whole string is the city
  if (/^(nyc|n\.?y\.?c\.?|la|l\.a\.)$/i.test(raw)) {
    return canonicalizePublicCity(raw)?.name || null;
  }
  return null;
}

function recoverFromErosUrl(url) {
  const text = String(url || "");
  const parsed = parseErosLocationFromUrl(text);
  if (parsed.city) {
    const name = acceptCity(parsed.city, parsed.state) || canonicalizePublicCity(parsed.city, parsed.state)?.name;
    // URL hub cities are trusted even if not in CITY_TO_STATE (e.g. smaller cities)
    if (parsed.city && !parsed.stateWide) {
      const c = canonicalizePublicCity(parsed.city, parsed.state);
      return {
        city: c?.name || titleCaseWords(parsed.city),
        state: parsed.state || null,
        source: "eros_url",
      };
    }
  }

  // Metro hub: /new_york/new_york/ — slug equals state slug but is a real metro city
  const m = text.match(
    /https?:\/\/(?:www|trans|massage)\.eros\.com\/([a-z0-9_-]+)\/([a-z0-9_-]+)(?:\/|$)/i,
  );
  if (m) {
    const a = m[1].toLowerCase();
    const b = m[2].toLowerCase();
    if (a === b && b !== "files") {
      const words = titleCaseWords(b.replace(/[_-]+/g, " "));
      const key = normalizeCityKey(words);
      // Prefer known city; special-case New York metro
      if (key === "new york" || key === "washington dc" || knownCityState(words)) {
        const c = canonicalizePublicCity(words);
        return {
          city: c?.name || words,
          state: parsed.state || resolveStateAbbrev(a) || null,
          source: "eros_metro_hub",
        };
      }
      // pure state hub
      return {
        city: "Statewide",
        state: parsed.state || resolveStateAbbrev(a) || null,
        source: "eros_statewide",
      };
    }
  }

  if (parsed.stateWide) {
    return {
      city: "Statewide",
      state: parsed.state || null,
      source: "eros_statewide",
    };
  }
  return null;
}

function recoverOne(row) {
  const urls = collectUrls(row);
  let city = null;
  let state = resolveStateAbbrev(row.location_state) || row.location_state || null;
  let source = null;

  for (const u of urls) {
    if (/eros\.com/i.test(u)) {
      const hit = recoverFromErosUrl(u);
      if (hit?.city) {
        city = hit.city;
        if (hit.state) state = hit.state;
        source = hit.source;
        break;
      }
    }
    if (/tryst\.link/i.test(u)) {
      const t = parseTrystCityUrl(u);
      if (t?.cityName) {
        const c = canonicalizePublicCity(t.cityName, t.stateAbbrev);
        city = c?.name || t.cityName;
        state = t.stateAbbrev || state;
        source = "tryst_url";
        break;
      }
    }
  }

  if (!city) {
    for (const field of [row.display_name, row.tagline]) {
      const hit = cityFromNameOrTag(field);
      if (hit) {
        city = hit;
        source = field === row.display_name ? "display_name" : "tagline";
        break;
      }
    }
  }

  // Profile-only Tryst/Eros rows often have state but no city URL.
  // Statewide keeps them in state browse without inventing a city hub.
  if (!city && state) {
    const st = resolveStateAbbrev(state) || String(state).trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(st)) {
      city = "Statewide";
      state = st;
      source = "state_only_fallback";
    }
  }

  if (!city) return null;

  const payload = { location_city: city, location_state: state };
  applyCityCanon(payload);
  if (!payload.location_city) return null;

  // Safety: never write a city that equals the display name when not Statewide/known
  const dnorm = normalizeCityKey(row.display_name || "");
  const cnorm = normalizeCityKey(payload.location_city);
  if (
    payload.location_city !== "Statewide" &&
    dnorm &&
    cnorm === dnorm &&
    !knownCityState(payload.location_city)
  ) {
    return null;
  }

  return {
    id: row.id,
    city: payload.location_city,
    state: payload.location_state || state || null,
    source,
  };
}

async function main() {
  const prisma = await createPrisma();
  const rows = await prisma.provider.findMany({
    where: {
      status: "active",
      OR: [{ location_city: null }, { location_city: "" }],
    },
    select: {
      id: true,
      display_name: true,
      tagline: true,
      location_state: true,
      verification_url: true,
      verification_provider: true,
      social_media: true,
    },
  });

  const updates = [];
  const bySource = {};
  for (const row of rows) {
    const rec = recoverOne(row);
    if (!rec) continue;
    updates.push(rec);
    bySource[rec.source || "unknown"] = (bySource[rec.source || "unknown"] || 0) + 1;
  }

  // sample quality: non-statewide real cities
  const realSamples = updates
    .filter((u) => u.city !== "Statewide")
    .slice(0, 20)
    .map((u) => ({ city: u.city, state: u.state, source: u.source }));
  const stateSamples = updates
    .filter((u) => u.city === "Statewide")
    .slice(0, 10)
    .map((u) => ({ city: u.city, state: u.state, source: u.source }));

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        scanned: rows.length,
        recover: updates.length,
        leave_null: rows.length - updates.length,
        statewide: updates.filter((u) => u.city === "Statewide").length,
        real_city: updates.filter((u) => u.city !== "Statewide").length,
        bySource,
        realSamples,
        stateSamples,
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    await prisma.$disconnect();
    return;
  }

  let applied = 0;
  for (const u of updates) {
    await prisma.provider.update({
      where: { id: u.id },
      data: {
        location_city: u.city,
        ...(u.state ? { location_state: u.state } : {}),
      },
    });
    applied += 1;
    if (applied % 250 === 0) console.error(`applied ${applied}/${updates.length}`);
  }
  console.error(`applied_total ${applied}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
