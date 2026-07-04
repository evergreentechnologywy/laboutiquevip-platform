/**
 * Derive Eros provider location_state from profile hub URLs.
 * Hub paths look like: eros.com/{state}/{city}/files/{id}.htm
 * e.g. florida/miami, new_york/new_york
 */

const STATE_ALIASES = {
  al: "AL",
  alabama: "AL",
  ak: "AK",
  alaska: "AK",
  az: "AZ",
  arizona: "AZ",
  ar: "AR",
  arkansas: "AR",
  ca: "CA",
  california: "CA",
  co: "CO",
  colorado: "CO",
  ct: "CT",
  connecticut: "CT",
  de: "DE",
  delaware: "DE",
  dc: "DC",
  "district of columbia": "DC",
  "washington dc": "DC",
  fl: "FL",
  florida: "FL",
  ga: "GA",
  georgia: "GA",
  hi: "HI",
  hawaii: "HI",
  id: "ID",
  idaho: "ID",
  il: "IL",
  illinois: "IL",
  in: "IN",
  indiana: "IN",
  ia: "IA",
  iowa: "IA",
  ks: "KS",
  kansas: "KS",
  ky: "KY",
  kentucky: "KY",
  la: "LA",
  louisiana: "LA",
  me: "ME",
  maine: "ME",
  md: "MD",
  maryland: "MD",
  ma: "MA",
  massachusetts: "MA",
  mi: "MI",
  michigan: "MI",
  mn: "MN",
  minnesota: "MN",
  ms: "MS",
  mississippi: "MS",
  mo: "MO",
  missouri: "MO",
  mt: "MT",
  montana: "MT",
  ne: "NE",
  nebraska: "NE",
  nv: "NV",
  nevada: "NV",
  nh: "NH",
  "new hampshire": "NH",
  nj: "NJ",
  "new jersey": "NJ",
  nm: "NM",
  "new mexico": "NM",
  ny: "NY",
  "new york": "NY",
  nc: "NC",
  "north carolina": "NC",
  nd: "ND",
  "north dakota": "ND",
  oh: "OH",
  ohio: "OH",
  ok: "OK",
  oklahoma: "OK",
  or: "OR",
  oregon: "OR",
  pa: "PA",
  pennsylvania: "PA",
  ri: "RI",
  "rhode island": "RI",
  sc: "SC",
  "south carolina": "SC",
  sd: "SD",
  "south dakota": "SD",
  tn: "TN",
  tennessee: "TN",
  tx: "TX",
  texas: "TX",
  ut: "UT",
  utah: "UT",
  vt: "VT",
  vermont: "VT",
  va: "VA",
  virginia: "VA",
  wa: "WA",
  washington: "WA",
  wv: "WV",
  "west virginia": "WV",
  wi: "WI",
  wisconsin: "WI",
  wy: "WY",
  wyoming: "WY",
};

/** Common Eros city hub → state when URL state segment is missing/unusable. */
const CITY_TO_STATE = {
  miami: "FL",
  orlando: "FL",
  tampa: "FL",
  jacksonville: "FL",
  "fort lauderdale": "FL",
  "west palm beach": "FL",
  naples: "FL",
  tallahassee: "FL",
  "new york": "NY",
  manhattan: "NY",
  brooklyn: "NY",
  queens: "NY",
  "los angeles": "CA",
  "san francisco": "CA",
  "san diego": "CA",
  "orange county": "CA",
  sacramento: "CA",
  chicago: "IL",
  houston: "TX",
  dallas: "TX",
  austin: "TX",
  "san antonio": "TX",
  atlanta: "GA",
  "las vegas": "NV",
  phoenix: "AZ",
  seattle: "WA",
  denver: "CO",
  boston: "MA",
  philadelphia: "PA",
  detroit: "MI",
  "washington dc": "DC",
  baltimore: "MD",
  nashville: "TN",
  "new orleans": "LA",
  portland: "OR",
  minneapolis: "MN",
  charlotte: "NC",
  raleigh: "NC",
};

function titleCaseWords(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeStateKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function resolveStateAbbrev(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
  const key = normalizeStateKey(text);
  return STATE_ALIASES[key] ?? null;
}

export function resolveStateFromCity(city) {
  const key = normalizeStateKey(city);
  if (!key) return null;
  return CITY_TO_STATE[key] ?? null;
}

function stateFromSlug(stateSlug) {
  if (!stateSlug) return null;
  return (
    resolveStateAbbrev(stateSlug) ??
    // Regional hubs (e.g. carolinas) and non-US: keep readable label
    (stateSlug.length <= 3
      ? stateSlug.toUpperCase()
      : titleCaseWords(stateSlug.replace(/[_-]+/g, " ")))
  );
}

/**
 * True when the Eros URL is a whole-state (or regional) hub, not a city hub.
 * Patterns:
 *   - /{state}/files/{id}.htm  (state-only)
 *   - /{state}/{state}/files/...  (state slug equals city slug, e.g. arizona/arizona)
 */
export function isErosStateWideHub(url) {
  const text = String(url ?? "");

  if (
    /https?:\/\/(?:www|trans|massage)\.eros\.com\/[a-z0-9_-]+\/files\//i.test(text)
  ) {
    return true;
  }

  const match = text.match(
    /https?:\/\/(?:www|trans|massage)\.eros\.com\/([a-z0-9_-]+)\/([a-z0-9_-]+)(?:\/|$)/i,
  );
  if (!match) return false;

  const stateSlug = match[1].toLowerCase();
  const citySlug = match[2].toLowerCase();
  if (!stateSlug || !citySlug || citySlug === "files") return false;
  return stateSlug === citySlug;
}

/**
 * Parse eros.com/{state}/{city}/files/... or state-only eros.com/{state}/files/...
 * Underscores and hyphens in state slugs both map to US 2-letter codes.
 * State-wide hubs return city: null and stateWide: true.
 */
export function parseErosLocationFromUrl(url) {
  const text = String(url ?? "");

  // State-only hub: eros.com/{state}/files/{id}.htm
  const stateOnly = text.match(
    /https?:\/\/(?:www|trans|massage)\.eros\.com\/([a-z0-9_-]+)\/files\//i,
  );
  if (stateOnly) {
    return { city: null, state: stateFromSlug(stateOnly[1]), stateWide: true };
  }

  // City hub: eros.com/{state}/{city}/files/...
  const match = text.match(
    /https?:\/\/(?:www|trans|massage)\.eros\.com\/([a-z0-9_-]+)\/([a-z0-9_-]+)(?:\/|$)/i,
  );
  if (!match) return { city: null, state: null, stateWide: false };

  const stateSlug = match[1];
  const citySlug = match[2];
  if (!stateSlug || !citySlug || citySlug.toLowerCase() === "files") {
    return { city: null, state: null, stateWide: false };
  }

  // Whole-state hub when path segments match (arizona/arizona, carolinas/carolinas)
  if (stateSlug.toLowerCase() === citySlug.toLowerCase()) {
    return {
      city: null,
      state: stateFromSlug(stateSlug),
      stateWide: true,
    };
  }

  return {
    city: titleCaseWords(citySlug.replace(/[_-]+/g, " ")),
    state: stateFromSlug(stateSlug),
    stateWide: false,
  };
}

/**
 * Prefer title-parsed state; fall back to verification_url hub path, then city map.
 */
export function resolveErosLocationState({ location_state, location_city, verification_url } = {}) {
  let state = resolveStateAbbrev(location_state) ?? (String(location_state || "").trim() || null);

  if (!state && verification_url) {
    const fromUrl = parseErosLocationFromUrl(verification_url);
    state = fromUrl.state;
  }

  if (!state && location_city) {
    // State-only hubs often store the state name in location_city (e.g. "Virginia")
    state = resolveStateAbbrev(location_city) ?? resolveStateFromCity(location_city);
  }

  if (state && state.length > 2) {
    state = resolveStateAbbrev(state) ?? state;
  }

  return state || null;
}
