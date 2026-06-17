const { PrismaClient } = require("../backend/generated/prisma-client");

const prisma = new PrismaClient();
const BATCH_SIZE = 500;
const LOG_EVERY = 1000;

function titleCaseWords(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

const STATE_ALIASES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

function resolveStateAbbrev(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
  return STATE_ALIASES[text.toLowerCase()] ?? text.toUpperCase();
}

function parseCityStateCombo(raw) {
  const text = String(raw || "").trim();
  const match = text.match(/^(.+?),\s*([A-Za-z.\s]{2,})$/);
  if (!match) return { city: text || null, state: null };
  return {
    city: match[1].trim() || null,
    state: resolveStateAbbrev(match[2].trim()),
  };
}

function parseErosLocationFromUrl(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2 || segments[1] === "files") return { city: null, state: null };
    const state = resolveStateAbbrev(segments[0]) ?? segments[0].toUpperCase();
    const city = titleCaseWords(segments[1].replace(/-/g, " "));
    return { city, state };
  } catch {
    return { city: null, state: null };
  }
}

function normalizeProviderLocation(row) {
  let city = String(row.location_city || "").trim() || null;
  let state = String(row.location_state || "").trim() || null;

  if (city?.includes(",")) {
    const parsed = parseCityStateCombo(city);
    city = parsed.city;
    state = state || parsed.state;
  }

  if ((!state || state.length > 3) && row.verification_provider === "eros" && row.verification_url) {
    const fromUrl = parseErosLocationFromUrl(row.verification_url);
    city = city || fromUrl.city;
    state = state || fromUrl.state;
  }

  if (state) state = resolveStateAbbrev(state) ?? state.toUpperCase();
  if (city) city = titleCaseWords(city.replace(/,\s*[A-Z]{2}$/i, ""));

  return { location_city: city, location_state: state };
}

async function main() {
  const rows = await prisma.provider.findMany({
    where: { status: "active" },
    select: {
      id: true,
      location_city: true,
      location_state: true,
      verification_provider: true,
      verification_url: true,
    },
  });

  let updated = 0;
  let processed = 0;

  for (const row of rows) {
    const next = normalizeProviderLocation(row);
    const changed =
      next.location_city !== (row.location_city || null) ||
      next.location_state !== (row.location_state || null);

    if (changed) {
      await prisma.provider.update({
        where: { id: row.id },
        data: next,
      });
      updated += 1;
    }

    processed += 1;
    if (processed % LOG_EVERY === 0) {
      console.log(JSON.stringify({ phase: "normalize", processed, total: rows.length, updated }, null, 2));
    }
  }

  console.log(JSON.stringify({ total: rows.length, updated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
