#!/usr/bin/env node
/**
 * One-shot: rewrite polluted Provider.location_city values via Prisma.
 *
 * Prefer trailing known-city recovery (ad titles → real city).
 * Null only when no recoverable city remains.
 *
 * Usage:
 *   node scripts/clean-junk-locations.cjs           # dry-run
 *   node scripts/clean-junk-locations.cjs --apply   # write
 */
const path = require("path");
const fs = require("fs");

const apply = process.argv.includes("--apply");

function loadEnv() {
  for (const p of [
    path.resolve(__dirname, "../backend/.env"),
    path.resolve(__dirname, "../.env"),
    "/etc/laboutiquevip/backend.env",
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const CITY_TO_STATE = {
  miami: "FL",
  orlando: "FL",
  tampa: "FL",
  jacksonville: "FL",
  "fort lauderdale": "FL",
  "west palm beach": "FL",
  naples: "FL",
  "st petersburg": "FL",
  "saint petersburg": "FL",
  clearwater: "FL",
  "new york": "NY",
  "new york city": "NY",
  nyc: "NY",
  manhattan: "NY",
  brooklyn: "NY",
  queens: "NY",
  bronx: "NY",
  "los angeles": "CA",
  la: "CA",
  "san francisco": "CA",
  "san diego": "CA",
  "orange county": "CA",
  sacramento: "CA",
  "long beach": "CA",
  oakland: "CA",
  "san jose": "CA",
  chicago: "IL",
  naperville: "IL",
  schaumburg: "IL",
  houston: "TX",
  dallas: "TX",
  austin: "TX",
  "san antonio": "TX",
  "fort worth": "TX",
  atlanta: "GA",
  "las vegas": "NV",
  reno: "NV",
  phoenix: "AZ",
  tucson: "AZ",
  scottsdale: "AZ",
  mesa: "AZ",
  seattle: "WA",
  tacoma: "WA",
  denver: "CO",
  "colorado springs": "CO",
  boston: "MA",
  philadelphia: "PA",
  pittsburgh: "PA",
  detroit: "MI",
  "washington dc": "DC",
  "washington d.c.": "DC",
  dc: "DC",
  baltimore: "MD",
  "new orleans": "LA",
  nashville: "TN",
  memphis: "TN",
  charlotte: "NC",
  raleigh: "NC",
  minneapolis: "MN",
  "st louis": "MO",
  "saint louis": "MO",
  "kansas city": "MO",
  columbus: "OH",
  cleveland: "OH",
  cincinnati: "OH",
  indianapolis: "IN",
  portland: "OR",
  "salt lake city": "UT",
  honolulu: "HI",
  anchorage: "AK",
  "oklahoma city": "OK",
  tulsa: "OK",
  albuquerque: "NM",
  omaha: "NE",
  milwaukee: "WI",
  madison: "WI",
  "virginia beach": "VA",
  richmond: "VA",
  "grand rapids": "MI",
  livonia: "MI",
  bellevue: "WA",
  "st. louis": "MO",
  "st louis": "MO",
  "saint louis": "MO",
  "forest park": "IL",
  "fort myers": "FL",
  "boca raton": "FL",
  "palm beach": "FL",
  "palm springs": "CA",
  "beverly hills": "CA",
  "santa monica": "CA",
  "marina del rey": "CA",
  "newport beach": "CA",
  irvine: "CA",
  "huntington beach": "CA",
  "el paso": "TX",
  plano: "TX",
  arlington: "TX",
  "jersey city": "NJ",
  newark: "NJ",
  princeton: "NJ",
  "atlantic city": "NJ",
  cambridge: "MA",
  brookline: "MA",
  "fort collins": "CO",
  boulder: "CO",
  "scottsdale": "AZ",
  tempe: "AZ",
  chandler: "AZ",
  "paradise valley": "AZ",
  "corpus christi": "TX",
  "new york city manhattan": "NY",
};

const MARKETING_RE =
  /\b(beauty|beauties|escort|companion|vip|elite|goddess|queen|princess|sexy|hot|wet|throat|booty|goat|gfe|pse|bbbj|cim|daty|dfk|greek|party|available|travel|tempt|relaxed|asian|latina|ebony|blonde|brunette|redhead|curvy|thick|petite|busty|big|nessa)\b/i;

function normKey(v) {
  return String(v || "")
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function titleCase(s) {
  const key = String(s || "").toLowerCase().trim();
  if (key === "washington dc" || key === "washington d c") return "Washington DC";
  if (key === "st louis" || key === "st. louis") return "St. Louis";
  if (key === "las vegas") return "Las Vegas";
  if (key === "los angeles") return "Los Angeles";
  if (key === "new york" || key === "new york city") return "New York";
  return key
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function extractTrailingKnownCity(raw) {
  let text = String(raw || "").trim();
  if (!text) return null;
  text = text.replace(/\b([A-Za-z.'-]+(?:\s+[A-Za-z.'-]+)?)\s+\1\b/i, "$1");
  // "New York City - Manhattan" / "Foo — Bar"
  text = text.replace(/\s+[-–—]\s+/g, " ");
  // Sentence end before city: "desire. Livonia"
  text = text.replace(/[.!?]+/g, " ");
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  for (const take of [3, 2, 1]) {
    if (words.length <= take) continue;
    const candidate = words.slice(-take).join(" ");
    const key = normKey(candidate).replace(/\bst\./g, "st");
    if (CITY_TO_STATE[key] || CITY_TO_STATE[normKey(candidate)]) {
      return titleCase(key.replace(/\./g, " ").replace(/\s+/g, " ").trim());
    }
  }
  // Last bare token after marketing junk (e.g. "BIG BUTT Bellevue")
  const last = words[words.length - 1];
  const prefix = words.slice(0, -1).join(" ");
  if (
    last &&
    /^[A-Za-z][A-Za-z.'-]{1,24}$/.test(last) &&
    !MARKETING_RE.test(last) &&
    (MARKETING_RE.test(prefix) || /[.!?]/.test(String(raw || "")) || words.length >= 3) &&
    !/^(usa|us|the|and|of|in|to|for|appt|texting|before|read)$/i.test(last)
  ) {
    return titleCase(normKey(last));
  }
  return null;
}

function isPlausible(raw) {
  const city = String(raw || "").trim();
  if (!city || city.length < 2 || city.length > 40) return false;
  if (/https?:\/\//i.test(city) || /tryst\.link|eros\.com|a4cdn/i.test(city)) return false;
  if (/^(unknown|n\/?a|none|null|statewide|caters\s*to)$/i.test(city)) return false;
  if (/\bi create\b/i.test(city) || /caters\s*to/i.test(city)) return false;
  if (/[0-9]/.test(city) || /[@#*&/\\|]/.test(city)) return false;
  const words = city.split(/\s+/).filter(Boolean);
  if (words.length > 4) return false;
  if (/^[A-Za-z .'-]+\.\s+[A-Za-z]/.test(city)) return false;
  if (/[.!?]/.test(city) && words.length >= 2) return false;
  if (CITY_TO_STATE[normKey(city)]) return true;
  if (MARKETING_RE.test(city)) return false;
  const trailing = extractTrailingKnownCity(city);
  if (trailing && normKey(trailing) !== normKey(city)) return false;
  if (words.length >= 4) return false;
  return true;
}

function canonicalize(raw) {
  let city = String(raw || "").trim();
  if (!city) return null;

  // Prefer full known city before stripping tokens
  if (CITY_TO_STATE[normKey(city)]) {
    return titleCase(normKey(city).replace(/\./g, ""));
  }

  if (city.includes(",")) {
    const left = city.split(",")[0].trim();
    if (left) city = left;
  }

  // Strip trailing US state abbrev only (not DC when part of "Washington DC")
  const trailingState = city.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (trailingState) {
    const abbr = trailingState[2].toUpperCase();
    const US_ABBR = new Set([
      "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
      "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
      "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
      "VA","WA","WV","WI","WY",
    ]);
    if (US_ABBR.has(abbr) && !CITY_TO_STATE[normKey(city)]) {
      city = trailingState[1].trim();
    }
  }

  // Normalize "St." / punctuation before gazetteer match
  const dotted = normKey(city).replace(/\bst\./g, "st");
  if (CITY_TO_STATE[dotted]) return titleCase(dotted);
  if (CITY_TO_STATE[normKey(city)]) return titleCase(normKey(city));

  if (!isPlausible(city)) {
    const recovered = extractTrailingKnownCity(city);
    if (!recovered || !isPlausible(recovered)) return null;
    city = recovered;
  } else {
    const recovered = extractTrailingKnownCity(city);
    if (recovered && normKey(recovered) !== normKey(city) && MARKETING_RE.test(city)) {
      city = recovered;
    }
  }
  if (!isPlausible(city)) return null;
  return titleCase(normKey(city));
}

function needsChange(raw) {
  const city = String(raw || "").trim();
  if (!city) return { change: false };
  const next = canonicalize(city);
  if (next && normKey(next) !== normKey(city)) {
    return { change: true, next, action: "rewrite" };
  }
  if (!next && !isPlausible(city)) {
    return { change: true, next: null, action: "nullify" };
  }
  // strip ", ST" when city alone is fine
  if (city.includes(",")) {
    const left = city.split(",")[0].trim();
    if (left && isPlausible(left) && normKey(left) !== normKey(city)) {
      return { change: true, next: titleCase(normKey(left)), action: "rewrite" };
    }
  }
  return { change: false };
}

async function main() {
  loadEnv();
  const { PrismaClient } = require("../backend/generated/prisma-client");
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw`
      SELECT id::text AS id, location_city, location_state
      FROM "Provider"
      WHERE location_city IS NOT NULL
        AND btrim(location_city) <> ''
    `;
    let rewrite = 0;
    let nullify = 0;
    const samples = [];

    for (const row of rows) {
      const raw = String(row.location_city || "").trim();
      const decision = needsChange(raw);
      if (!decision.change) continue;

      if (decision.action === "rewrite") rewrite += 1;
      else nullify += 1;
      if (samples.length < 25) {
        samples.push({
          id: row.id,
          from: raw,
          to: decision.next,
          state: row.location_state,
          action: decision.action,
        });
      }

      if (apply) {
        await prisma.$executeRaw`
          UPDATE "Provider"
          SET location_city = ${decision.next}, updated_date = NOW()
          WHERE id = ${row.id}::uuid
        `;
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "dry-run",
          scanned: rows.length,
          rewrite,
          nullify,
          samples,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
