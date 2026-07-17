/**
 * Canonical city grouping for Browse — dedupe "Miami" / "Miami, FL" / casing,
 * state-first detection, top-N cities by inventory.
 */

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const NAME_TO_ABBREV = Object.fromEntries(
  Object.entries(STATE_NAMES).flatMap(([code, name]) => [
    [name.toLowerCase(), code],
    [code.toLowerCase(), code],
  ]),
);

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function titleCaseWords(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function resolveStateAbbrev(raw) {
  const t = String(raw || "").trim();
  if (!t) return null;
  if (/^[A-Za-z]{2}$/.test(t)) {
    const code = t.toUpperCase();
    return STATE_NAMES[code] ? code : null;
  }
  return NAME_TO_ABBREV[t.toLowerCase()] || null;
}

/** True when the location query is a US state (abbrev or full name), not a city. */
export function isStateLocationQuery(raw) {
  const t = String(raw || "").trim();
  if (!t || t.includes(",")) return false;
  return Boolean(resolveStateAbbrev(t));
}

/**
 * Normalize messy provider city strings into a stable { name, slug }.
 * Drops Statewide / Unknown / bio junk.
 */
export function canonicalizeCity(rawCity, stateHint = "") {
  let city = String(rawCity || "").trim();
  if (!city) return null;
  if (/^(unknown|n\/?a|none|null|statewide|caters\s*to)$/i.test(city)) return null;
  if (city.length > 40 || /https?:\/\//i.test(city)) return null;

  // Strip trailing ", FL" / " FL" / " (FL)"
  city = city
    .replace(/\s*\(([A-Za-z]{2})\)\s*$/i, "")
    .replace(/,\s*[A-Za-z]{2}\s*$/i, "")
    .replace(/\s+[A-Za-z]{2}\s*$/i, (m) => {
      const maybe = resolveStateAbbrev(m.trim());
      return maybe ? "" : m;
    })
    .replace(/\s+/g, " ")
    .trim();

  if (!city || city.length < 2) return null;

  const state = resolveStateAbbrev(stateHint);
  // "Florida" stored as city when state-wide junk
  if (state && resolveStateAbbrev(city) === state) return null;

  const slug = slugify(city);
  if (!slug) return null;
  return { name: titleCaseWords(city), slug };
}

/**
 * Group providers by canonical city for a state-wide browse.
 * Returns top cities by listing count (default 5, expand if needed).
 *
 * @returns {{
 *   isState: boolean,
 *   stateCode: string|null,
 *   stateName: string|null,
 *   groups: Array<{ key: string, city: string, state: string, slug: string, count: number, providers: any[] }>,
 *   otherProviders: any[],
 *   cityChips: Array<{ city: string, state: string, count: number, slug: string }>
 * }}
 */
export function groupProvidersForStateBrowse(providers, locationQuery, options = {}) {
  const minTop = options.topCities ?? 5;
  const maxTop = options.maxCities ?? 12;
  const expandIfCountAtLeast = options.expandIfCountAtLeast ?? 2;

  const stateCode = isStateLocationQuery(locationQuery)
    ? resolveStateAbbrev(locationQuery)
    : null;

  const map = new Map();
  const ungrouped = [];

  for (const provider of providers || []) {
    const rawState = provider.location_state || "";
    const code = resolveStateAbbrev(rawState) || stateCode || "";
    const canonical = canonicalizeCity(provider.location_city, code);
    if (!canonical) {
      ungrouped.push(provider);
      continue;
    }
    const key = `${canonical.slug}||${code || "XX"}`;
    const entry = map.get(key) || {
      key,
      city: canonical.name,
      state: code || "",
      slug: canonical.slug,
      providers: [],
    };
    entry.providers.push(provider);
    map.set(key, entry);
  }

  const sorted = Array.from(map.values())
    .map((g) => ({ ...g, count: g.providers.length }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));

  // Dedupe by city slug within same state (already keyed) — also merge near-identical names
  const merged = [];
  const seenSlugs = new Set();
  for (const g of sorted) {
    const sk = `${g.slug}||${g.state}`;
    if (seenSlugs.has(sk)) continue;
    seenSlugs.add(sk);
    merged.push(g);
  }

  let take = minTop;
  while (take < merged.length && take < maxTop && merged[take].count >= expandIfCountAtLeast) {
    take += 1;
  }
  // If few cities total, show all
  if (merged.length <= minTop + 2) take = merged.length;

  const groups = merged.slice(0, take);
  const overflow = merged.slice(take);
  const otherProviders = [
    ...overflow.flatMap((g) => g.providers),
    ...ungrouped,
  ];

  const isState =
    Boolean(stateCode) &&
    (merged.length > 1 ||
      providers.some(
        (p) => resolveStateAbbrev(p.location_state) === stateCode,
      ));

  return {
    isState: Boolean(isState && stateCode),
    stateCode,
    stateName: stateCode ? STATE_NAMES[stateCode] || stateCode : null,
    groups,
    otherProviders,
    cityChips: groups.map(({ city, state, count, slug }) => ({ city, state, count, slug })),
  };
}

/** Flat group for non-state city searches — still de-dupes labels. */
export function groupProvidersByCity(items) {
  const map = new Map();
  for (const provider of items || []) {
    const code = resolveStateAbbrev(provider.location_state) || "";
    const canonical = canonicalizeCity(provider.location_city, code);
    const city = canonical?.name || "Other";
    const state = code || String(provider.location_state || "").trim();
    const key = `${canonical?.slug || "other"}||${state || "XX"}`;
    const label = state ? `${city}, ${state}` : city;
    const entry = map.get(key) || { key, label, city, state, providers: [] };
    entry.providers.push(provider);
    map.set(key, entry);
  }
  return Array.from(map.values())
    .map((g) => ({ ...g, count: g.providers.length }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}
