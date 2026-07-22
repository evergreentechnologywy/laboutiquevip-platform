/**
 * Static US state + region reference data.
 * Used as a graceful fallback when /api/v1/browse/states is unavailable,
 * and to resolve region labels for state slugs.
 */

export const US_REGIONS = ["Northeast", "Southeast", "Midwest", "Southwest", "West"];

// [name, abbrev, region]
const STATE_ROWS = [
  ["Connecticut", "CT", "Northeast"],
  ["Maine", "ME", "Northeast"],
  ["Massachusetts", "MA", "Northeast"],
  ["New Hampshire", "NH", "Northeast"],
  ["New Jersey", "NJ", "Northeast"],
  ["New York", "NY", "Northeast"],
  ["Pennsylvania", "PA", "Northeast"],
  ["Rhode Island", "RI", "Northeast"],
  ["Vermont", "VT", "Northeast"],
  ["Alabama", "AL", "Southeast"],
  ["Arkansas", "AR", "Southeast"],
  ["Delaware", "DE", "Southeast"],
  ["District of Columbia", "DC", "Southeast"],
  ["Florida", "FL", "Southeast"],
  ["Georgia", "GA", "Southeast"],
  ["Kentucky", "KY", "Southeast"],
  ["Louisiana", "LA", "Southeast"],
  ["Maryland", "MD", "Southeast"],
  ["Mississippi", "MS", "Southeast"],
  ["North Carolina", "NC", "Southeast"],
  ["South Carolina", "SC", "Southeast"],
  ["Tennessee", "TN", "Southeast"],
  ["Virginia", "VA", "Southeast"],
  ["West Virginia", "WV", "Southeast"],
  ["Illinois", "IL", "Midwest"],
  ["Indiana", "IN", "Midwest"],
  ["Iowa", "IA", "Midwest"],
  ["Kansas", "KS", "Midwest"],
  ["Michigan", "MI", "Midwest"],
  ["Minnesota", "MN", "Midwest"],
  ["Missouri", "MO", "Midwest"],
  ["Nebraska", "NE", "Midwest"],
  ["North Dakota", "ND", "Midwest"],
  ["Ohio", "OH", "Midwest"],
  ["South Dakota", "SD", "Midwest"],
  ["Wisconsin", "WI", "Midwest"],
  ["Arizona", "AZ", "Southwest"],
  ["New Mexico", "NM", "Southwest"],
  ["Oklahoma", "OK", "Southwest"],
  ["Texas", "TX", "Southwest"],
  ["Alaska", "AK", "West"],
  ["California", "CA", "West"],
  ["Colorado", "CO", "West"],
  ["Hawaii", "HI", "West"],
  ["Idaho", "ID", "West"],
  ["Montana", "MT", "West"],
  ["Nevada", "NV", "West"],
  ["Oregon", "OR", "West"],
  ["Utah", "UT", "West"],
  ["Washington", "WA", "West"],
  ["Wyoming", "WY", "West"],
];

export function slugifyStateName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const US_STATES = STATE_ROWS.map(([name, abbrev, region]) => ({
  name,
  abbrev,
  region,
  slug: slugifyStateName(name),
}));

const BY_SLUG = new Map(US_STATES.map((s) => [s.slug, s]));
const BY_NAME_LOWER = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s]));
const BY_ABBREV = new Map(US_STATES.map((s) => [s.abbrev, s]));

export function getStateBySlug(slug) {
  return BY_SLUG.get(String(slug || "").toLowerCase()) || null;
}

export function getStateByName(name) {
  const raw = String(name || "").trim();
  if (!raw) return null;
  return (
    BY_NAME_LOWER.get(raw.toLowerCase()) ||
    BY_ABBREV.get(raw.toUpperCase()) ||
    BY_SLUG.get(slugifyStateName(raw)) ||
    null
  );
}

/** Group a list of state objects (with .region) into the canonical region order. */
export function groupStatesByRegion(states) {
  const groups = new Map(US_REGIONS.map((r) => [r, []]));
  for (const state of states || []) {
    const region = US_REGIONS.includes(state?.region)
      ? state.region
      : getStateBySlug(state?.slug)?.region || getStateByName(state?.name)?.region;
    if (region) groups.get(region).push(state);
  }
  return US_REGIONS.map((region) => ({ region, states: groups.get(region) })).filter(
    (g) => g.states.length > 0,
  );
}
