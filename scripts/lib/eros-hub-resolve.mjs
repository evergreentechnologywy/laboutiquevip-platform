/**
 * Map US Census top-5 cities per state to Eros sitemap hub keys.
 * Merges sitemap hubs with priority top-5 city hubs (deduped by state/city slug).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseErosLocationFromUrl } from "./eros-location.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOP5_PATH = path.join(__dirname, "..", "data", "us-top5-cities-by-state.json");

let top5Cache = null;

export function slugifyEros(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function hubKey(hub) {
  return `${hub.state}/${hub.city}`;
}

function syntheticProfileUrl(hub) {
  if (hub.state === hub.city) {
    return `https://www.eros.com/${hub.state}/${hub.state}/files/0.htm`;
  }
  return `https://www.eros.com/${hub.state}/${hub.city}/files/0.htm`;
}

export function hubStateAbbrev(hub) {
  return parseErosLocationFromUrl(syntheticProfileUrl(hub)).state;
}

export function loadTop5CitiesByState() {
  if (top5Cache) return top5Cache;
  const raw = fs.readFileSync(TOP5_PATH, "utf8");
  top5Cache = JSON.parse(raw);
  return top5Cache;
}

function normalizeCityName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function citySlugMatches(hubCitySlug, cityName) {
  const slug = hubCitySlug.toLowerCase();
  const nameSlug = slugifyEros(cityName);
  if (slug === nameSlug) return true;
  const normalized = normalizeCityName(cityName);
  const slugAsWords = slug.replace(/_/g, " ");
  if (slugAsWords === normalized) return true;
  if (normalized.startsWith(slugAsWords) || slugAsWords.startsWith(normalized)) return true;
  return false;
}

/**
 * Find the best Eros hub for a US city + state code among sitemap hubs.
 */
export function matchTop5CityToHub(cityName, stateCode, sitemapHubs) {
  const code = String(stateCode ?? "").toUpperCase();
  const candidates = sitemapHubs.filter((hub) => {
    const abbrev = hubStateAbbrev(hub);
    if (abbrev && abbrev.length === 2 && abbrev !== code) return false;
    return citySlugMatches(hub.city, cityName);
  });

  if (candidates.length === 0) return null;

  const nameSlug = slugifyEros(cityName);
  const exact = candidates.find((h) => h.city.toLowerCase() === nameSlug);
  if (exact) return exact;

  candidates.sort((a, b) => a.city.length - b.city.length);
  return candidates[0];
}

/**
 * Merge all sitemap hubs with top-5 Census city targets (priority flag for higher caps).
 */
export function mergeHubCatalog(sitemapHubs, { includeTop5 = true } = {}) {
  const byKey = new Map();

  for (const hub of sitemapHubs) {
    byKey.set(hubKey(hub), {
      state: hub.state,
      city: hub.city,
      priority: false,
      sources: ["sitemap"],
    });
  }

  let top5Matched = 0;
  let top5Unmatched = 0;

  if (includeTop5) {
    const data = loadTop5CitiesByState();
    for (const [stateCode, cities] of Object.entries(data.states ?? {})) {
      const cityList = Array.isArray(cities) ? cities : [];
      for (const entry of cityList) {
        const cityName = typeof entry === "string" ? entry : entry?.name;
        if (!cityName) continue;
        const matched = matchTop5CityToHub(cityName, stateCode, sitemapHubs);
        if (!matched) {
          top5Unmatched += 1;
          continue;
        }
        top5Matched += 1;
        const key = hubKey(matched);
        const existing = byKey.get(key);
        if (existing) {
          existing.priority = true;
          if (!existing.sources.includes("top5")) existing.sources.push("top5");
          existing.top5City = cityName;
          existing.top5State = stateCode;
        } else {
          byKey.set(key, {
            state: matched.state,
            city: matched.city,
            priority: true,
            sources: ["top5"],
            top5City: cityName,
            top5State: stateCode,
          });
        }
      }
    }
  }

  const hubs = [...byKey.values()].sort((a, b) => hubKey(a).localeCompare(hubKey(b)));
  return { hubs, top5Matched, top5Unmatched };
}
