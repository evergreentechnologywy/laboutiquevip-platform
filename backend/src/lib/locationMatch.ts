const STATE_ALIASES: Record<string, string[]> = {
  AL: ["alabama"],
  AK: ["alaska"],
  AZ: ["arizona"],
  AR: ["arkansas"],
  CA: ["california"],
  CO: ["colorado"],
  CT: ["connecticut"],
  DE: ["delaware"],
  DC: ["district of columbia", "washington dc", "washington d.c."],
  FL: ["florida"],
  GA: ["georgia"],
  HI: ["hawaii"],
  ID: ["idaho"],
  IL: ["illinois"],
  IN: ["indiana"],
  IA: ["iowa"],
  KS: ["kansas"],
  KY: ["kentucky"],
  LA: ["louisiana"],
  ME: ["maine"],
  MD: ["maryland"],
  MA: ["massachusetts"],
  MI: ["michigan"],
  MN: ["minnesota"],
  MS: ["mississippi"],
  MO: ["missouri"],
  MT: ["montana"],
  NE: ["nebraska"],
  NV: ["nevada"],
  NH: ["new hampshire"],
  NJ: ["new jersey"],
  NM: ["new mexico"],
  NY: ["new york"],
  NC: ["north carolina"],
  ND: ["north dakota"],
  OH: ["ohio"],
  OK: ["oklahoma"],
  OR: ["oregon"],
  PA: ["pennsylvania"],
  RI: ["rhode island"],
  SC: ["south carolina"],
  SD: ["south dakota"],
  TN: ["tennessee"],
  TX: ["texas"],
  UT: ["utah"],
  VT: ["vermont"],
  VA: ["virginia"],
  WA: ["washington"],
  WV: ["west virginia"],
  WI: ["wisconsin"],
  WY: ["wyoming"],
};

const SLUG_TO_ABBREV = Object.fromEntries(
  Object.entries(STATE_ALIASES).flatMap(([abbrev, names]) => [
    [abbrev.toLowerCase(), abbrev],
    ...names.map((name) => [slugify(name), abbrev]),
  ]),
);

const ABBREV_TO_NAMES = Object.fromEntries(
  Object.entries(STATE_ALIASES).map(([abbrev, names]) => [abbrev, names]),
);

/** Common city names → state abbrev for hub matching + ad-title city recovery. */
const CITY_TO_STATE: Record<string, string> = {
  miami: "FL",
  orlando: "FL",
  tampa: "FL",
  jacksonville: "FL",
  "fort lauderdale": "FL",
  "west palm beach": "FL",
  naples: "FL",
  tallahassee: "FL",
  "st petersburg": "FL",
  "saint petersburg": "FL",
  "clearwater": "FL",
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
  springfield: "IL",
  peoria: "IL",
  houston: "TX",
  dallas: "TX",
  austin: "TX",
  "san antonio": "TX",
  "fort worth": "TX",
  plano: "TX",
  arlington: "TX",
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
  cambridge: "MA",
  philadelphia: "PA",
  pittsburgh: "PA",
  detroit: "MI",
  "washington dc": "DC",
  washington: "DC",
  baltimore: "MD",
  nashville: "TN",
  memphis: "TN",
  "new orleans": "LA",
  portland: "OR",
  minneapolis: "MN",
  "st paul": "MN",
  charlotte: "NC",
  raleigh: "NC",
  durham: "NC",
  charleston: "SC",
  columbia: "SC",
  greenville: "SC",
  columbus: "OH",
  cleveland: "OH",
  cincinnati: "OH",
  indianapolis: "IN",
  "kansas city": "MO",
  "st louis": "MO",
  "saint louis": "MO",
  milwaukee: "WI",
  madison: "WI",
  "salt lake city": "UT",
  omaha: "NE",
  "oklahoma city": "OK",
  tulsa: "OK",
  albuquerque: "NM",
  "virginia beach": "VA",
  richmond: "VA",
  "jersey city": "NJ",
  newark: "NJ",
  honolulu: "HI",
  anchorage: "AK",
  "o'hare airport": "IL",
  "ohare airport": "IL",
  "corpus christi": "TX",
  "palm beach gardens": "FL",
  "port st lucie": "FL",
  "port saint lucie": "FL",
  "grand rapids": "MI",
  livonia: "MI",
  bellevue: "WA",
  "boca raton": "FL",
  "fort myers": "FL",
  "tysons corner": "VA",
  "long island": "NY",
  "north hollywood": "CA",
  "west hollywood": "CA",
  "atlantic city": "NJ",
  "des moines": "IA",
  "little rock": "AR",
  "baton rouge": "LA",
  "myrtle beach": "SC",
  "cherry hill": "NJ",
  "overland park": "KS",
};

/** Ad/bio tokens that never belong in a public city label. */
const CITY_MARKETING_RE =
  /\b(beauty|pornstar|porn|kink|kinky|gfe|bbbj|bbw|queen|booty|throat|goat|exotic|experience|experienc|curves|providing|royal|anal|spinner|sensual|unforgettable|muse|latina|latino|angel|seductive|authentic|witty|spicy|t-boy|tboy|deal|special|someone|control|physical|auburn|nessa|passion|pleasure|rated|afro|sexy|baby|modern|love|blonde|brunette|redhead|milf|ts\b|trans|escort|companion|available|inviting|tempt|relaxed|travel|caters)\b/i;

export function stateDisplayName(abbrev: string): string {
  const code = String(abbrev || "").trim().toUpperCase();
  const names = ABBREV_TO_NAMES[code];
  return names?.[0] ? titleCaseWords(names[0]) : code;
}

export function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function titleCaseWords(value: string): string {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function titleCaseCity(value: string): string {
  const key = normalizeCityKey(value);
  if (key === "washington dc" || key === "washington d c") return "Washington DC";
  if (key === "st louis" || key === "st. louis" || key === "saint louis") return "St. Louis";
  if (key === "st paul" || key === "st. paul" || key === "saint paul") return "St. Paul";
  if (key === "st petersburg" || key === "saint petersburg") return "St. Petersburg";
  if (key === "port st lucie" || key === "port saint lucie") return "Port St. Lucie";
  return titleCaseWords(value);
}

function normalizeCityKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function knownCityState(city: string): string | null {
  return CITY_TO_STATE[normalizeCityKey(city)] ?? null;
}

/**
 * Recover a real city when Eros/Tryst ad titles leak into location_city
 * (e.g. "Asian Beauty Chicago" → "Chicago", "Vanessa Big Booty Nessa Chicago" → "Chicago").
 */
export function extractTrailingKnownCity(raw: string): string | null {
  let text = String(raw || "").trim();
  if (!text) return null;
  text = text.replace(/\b([A-Za-z.'-]+(?:\s+[A-Za-z.'-]+)?)\s+\1\b/i, "$1");
  text = text.replace(/\s*[-–—]\s*/g, " ");
  text = text.replace(/[.!?]+/g, " ");
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  // Prefer longest known city window; scan from the end (trailing bias).
  // Never invent cities from marketing tokens (e.g. "...Chicago tonight" → Chicago).
  for (const take of [3, 2, 1] as const) {
    for (let i = words.length - take; i >= 0; i--) {
      const candidate = words.slice(i, i + take).join(" ");
      if (knownCityState(candidate)) return titleCaseCity(candidate);
    }
  }
  return null;
}

/**
 * Reject bio fragments, ad titles, placeholders, and other non-city values.
 * Keep real place names (including multi-word cities like "New York" / "West Palm Beach").
 */
export function isPlausiblePublicCityName(raw: string): boolean {
  const city = String(raw || "").trim();
  if (!city || city.length < 2 || city.length > 40) return false;
  if (/https?:\/\//i.test(city) || /tryst\.link|eros\.com|a4cdn/i.test(city)) return false;
  if (/^(unknown|n\/?a|none|null|statewide|caters\s*to)$/i.test(city)) return false;
  if (/\bi create\b/i.test(city)) return false;
  if (/caters\s*to/i.test(city)) return false;
  if (/[0-9]/.test(city)) return false;
  if (/[@#*&/\\|]/.test(city)) return false;

  const words = city.split(/\s+/).filter(Boolean);
  if (words.length > 4) return false;

  // Sentence / bio fragment: "Miami. Travel" or longer punctuated phrases
  if (/^[A-Za-z .'-]+\.\s+[A-Za-z]/.test(city)) return false;
  if (/[.!?]/.test(city) && words.length >= 2) return false;
  if (/\b(travel|relaxed|tempt|available|inviting)\b/i.test(city) && /[.!]/.test(city)) {
    return false;
  }

  // Known multi-word cities always pass (West Palm Beach, New York City, …)
  if (knownCityState(city)) return true;

  // Ad headline leaked into city field
  if (CITY_MARKETING_RE.test(city)) return false;

  // "Something Something Chicago" — prefix + known city = ad title, not a place
  const trailing = extractTrailingKnownCity(city);
  if (trailing && normalizeCityKey(trailing) !== normalizeCityKey(city)) return false;

  // Unknown 4-word labels are almost never real cities in this catalog
  if (words.length >= 4) return false;

  return true;
}

/**
 * Canonical city label for location pickers / autocomplete / browse hubs.
 * Strips "City, ST" combos, recovers city from ad-title pollution, title-cases.
 */
export function canonicalizePublicCity(
  rawCity: string,
  stateCode?: string | null,
): { slug: string; name: string } | null {
  let city = String(rawCity || "").trim();
  if (!city) return null;

  // Full known labels first (keeps "Washington DC", multi-word cities)
  if (knownCityState(city)) {
    const name = titleCaseWords(normalizeCityKey(city));
    if (normalizeCityKey(city) === "washington dc") {
      return { slug: "washington-dc", name: "Washington DC" };
    }
    return { slug: slugify(name), name };
  }

  // NYC hub variants → Manhattan
  if (/^new\s+york\s+city\s*[-–—]?\s*manhattan$/i.test(city)) {
    return { slug: "manhattan", name: "Manhattan" };
  }

  if (city.includes(",")) {
    const parsed = parseCityStateCombo(city);
    if (parsed.city) city = parsed.city;
  }

  // "Miami FL" trailing state token — never strip DC from "Washington DC"
  const trailingState = city.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (trailingState) {
    const maybeState = resolveStateAbbrev(trailingState[2]);
    if (
      maybeState &&
      maybeState !== "DC" &&
      (!stateCode || maybeState === String(stateCode).toUpperCase()) &&
      !knownCityState(city)
    ) {
      city = trailingState[1].trim();
    }
  }

  // Prefer recovered trailing city when the raw value is an ad title
  if (!isPlausiblePublicCityName(city)) {
    const recovered = extractTrailingKnownCity(city);
    if (!recovered || !isPlausiblePublicCityName(recovered)) return null;
    city = recovered;
  } else {
    // Even if loose-plausible, collapse "… Chicago" ad titles that slipped through
    const recovered = extractTrailingKnownCity(city);
    if (
      recovered &&
      normalizeCityKey(recovered) !== normalizeCityKey(city) &&
      (CITY_MARKETING_RE.test(city) || /[-–—]/.test(String(rawCity || "")))
    ) {
      city = recovered;
    }
  }

  if (!isPlausiblePublicCityName(city)) return null;

  if (normalizeCityKey(city) === "washington dc") {
    return { slug: "washington-dc", name: "Washington DC" };
  }

  const name = titleCaseWords(normalizeCityKey(city));
  const slug = slugify(name);
  if (!slug) return null;
  return { slug, name };
}

export function parseCityStateCombo(raw: string): { city: string | null; state: string | null } {
  const text = String(raw || "").trim();
  const match = text.match(/^(.+?),\s*([A-Za-z.\s]{2,})$/);
  if (!match) return { city: text || null, state: null };

  const city = match[1].trim();
  const statePart = match[2].trim();
  const abbrev = resolveStateAbbrev(statePart);
  return {
    city: city || null,
    state: abbrev ?? statePart.toUpperCase(),
  };
}

export function isValidUsStateAbbrev(raw: string): boolean {
  const code = String(raw || "").trim().toUpperCase();
  return Boolean(code && ABBREV_TO_NAMES[code]);
}

export function resolveStateAbbrev(raw: string): string | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  if (/^[A-Za-z]{2}$/.test(text)) {
    const upper = text.toUpperCase();
    return ABBREV_TO_NAMES[upper] ? upper : null;
  }
  const slug = slugify(text);
  return SLUG_TO_ABBREV[slug] ?? SLUG_TO_ABBREV[text.toLowerCase()] ?? null;
}

export function resolveStateFromCity(city: string): string | null {
  const key = String(city || "")
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!key) return null;
  return CITY_TO_STATE[key] ?? null;
}

/** Prisma JSON path filter for social_media.eros_state_wide === true */
export function erosStateWideJsonFilter(): Record<string, unknown> {
  return {
    social_media: {
      path: ["eros_state_wide"],
      equals: true,
    },
  };
}

/**
 * Match active Eros state-wide listings for a resolved state (and Carolinas for NC/SC).
 */
export function buildStateWideLocationBranch(stateRaw: string): Record<string, unknown> | null {
  const abbrev = resolveStateAbbrev(stateRaw);
  const terms = new Set(stateSearchTerms(stateRaw));
  if (abbrev === "NC" || abbrev === "SC") {
    terms.add("Carolinas");
    terms.add("carolinas");
  }
  if (!terms.size) return null;

  return {
    AND: [
      {
        OR: Array.from(terms).map((term) => ({
          location_state: { contains: term, mode: "insensitive" },
        })),
      },
      erosStateWideJsonFilter(),
    ],
  };
}

export function stateSearchTerms(raw: string): string[] {
  const text = String(raw || "").trim();
  if (!text) return [];

  const abbrev = resolveStateAbbrev(text);
  const terms = new Set<string>([text]);
  if (abbrev) {
    terms.add(abbrev);
    for (const name of ABBREV_TO_NAMES[abbrev] ?? []) {
      terms.add(name);
      terms.add(titleCaseWords(name));
      terms.add(name.toUpperCase());
    }
  }

  return Array.from(terms).filter(Boolean);
}

export function buildLocationFilter(rawLocation: string): Record<string, unknown> | null {
  const location = String(rawLocation || "").trim();
  if (!location) return null;

  const parsed = parseCityStateCombo(location);
  const stateOnlyAbbrev =
    !location.includes(",") && resolveStateAbbrev(location) && !resolveStateFromCity(location)
      ? resolveStateAbbrev(location)
      : null;

  // Bare state queries (e.g. "CO", "Texas") should not use city contains — abbrevs like "CO"
  // substring-match half the catalog.
  if (stateOnlyAbbrev) {
    const branches: Record<string, unknown>[] = stateSearchTerms(stateOnlyAbbrev).map((term) => ({
      location_state: { contains: term, mode: "insensitive" },
    }));
    const stateWideBranch = buildStateWideLocationBranch(stateOnlyAbbrev);
    if (stateWideBranch) branches.push(stateWideBranch);
    return { OR: branches };
  }

  const stateTerms = stateSearchTerms(location);
  const citySlug = slugify(parsed.city ?? location);

  const cityMatchers: Record<string, unknown>[] = [
    { location_city: { contains: location, mode: "insensitive" } },
    { location_city: { contains: parsed.city ?? location, mode: "insensitive" } },
  ];

  if (citySlug) {
    cityMatchers.push({
      location_city: { contains: titleCaseWords(citySlug.replace(/-/g, " ")), mode: "insensitive" },
    });
  }

  // State terms match location_state only — matching location_city caused false positives
  // (e.g. state abbrev substrings inside city names).
  const stateMatchers = stateTerms.map((term) => ({
    location_state: { contains: term, mode: "insensitive" },
  }));

  const branches: Record<string, unknown>[] = [...cityMatchers, ...stateMatchers];

  if (parsed.state && parsed.city) {
    for (const term of stateSearchTerms(parsed.state)) {
      branches.push({
        AND: [
          { location_city: { contains: parsed.city, mode: "insensitive" } },
          { location_state: { contains: term, mode: "insensitive" } },
        ],
      });
    }
  }

  // Include Eros whole-state hub listings for any city in that state
  const stateForWide =
    parsed.state ??
    resolveStateAbbrev(location) ??
    resolveStateFromCity(parsed.city ?? location);
  if (stateForWide) {
    const stateWideBranch = buildStateWideLocationBranch(stateForWide);
    if (stateWideBranch) branches.push(stateWideBranch);
  }

  return { OR: branches };
}

export function isErosStateWideHub(url: string): boolean {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 1) return false;

    const stateSlug = segments[0]?.toLowerCase();
    const citySlug = segments[1]?.toLowerCase();
    if (!stateSlug) return false;
    if (citySlug === "files") return true;
    if (!citySlug) return false;
    return stateSlug === citySlug;
  } catch {
    return false;
  }
}

export function parseErosLocationFromUrl(url: string): {
  city: string | null;
  state: string | null;
  stateWide: boolean;
} {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 1) return { city: null, state: null, stateWide: false };

    const stateSlug = segments[0];
    const citySlug = segments[1];

    const stateFromSlug = (slug: string) =>
      resolveStateAbbrev(slug) ??
      (slug.length <= 3
        ? slug.toUpperCase()
        : titleCaseWords(slug.replace(/[_-]+/g, " ")));

    // State-only hub: /{state}/files/{id}.htm
    if (stateSlug && citySlug === "files") {
      return { city: null, state: stateFromSlug(stateSlug), stateWide: true };
    }

    if (!stateSlug || !citySlug || citySlug === "files") {
      return { city: null, state: null, stateWide: false };
    }

    // Whole-state hub when path segments match (arizona/arizona, carolinas/carolinas)
    if (stateSlug.toLowerCase() === citySlug.toLowerCase()) {
      return { city: null, state: stateFromSlug(stateSlug), stateWide: true };
    }

    const state = resolveStateAbbrev(stateSlug) ?? stateSlug.toUpperCase();
    const city = titleCaseWords(citySlug.replace(/[_-]+/g, " "));
    return { city, state, stateWide: false };
  } catch {
    return { city: null, state: null, stateWide: false };
  }
}

export function suggestLocationQueries(raw: string): Array<{ slug: string; displayName: string }> {
  const term = String(raw || "").trim().toLowerCase();
  if (!term) return [];

  const suggestions: Array<{ slug: string; displayName: string }> = [];
  for (const [abbrev, names] of Object.entries(STATE_ALIASES)) {
    const fullName = names[0] ?? "";
    const displayName = titleCaseWords(fullName);
    const candidates = [abbrev.toLowerCase(), fullName, displayName.toLowerCase()];
    if (candidates.some((value) => value.startsWith(term) || value.includes(term))) {
      suggestions.push({ slug: slugify(fullName), displayName });
      if (abbrev.toLowerCase().startsWith(term) || term.length <= 2) {
        suggestions.push({ slug: abbrev.toLowerCase(), displayName: abbrev });
      }
    }
  }

  return suggestions;
}

export function normalizeProviderLocation(input: {
  location_city?: string | null;
  location_state?: string | null;
  verification_url?: string | null;
  verification_provider?: string | null;
}): { location_city: string | null; location_state: string | null; eros_state_wide: boolean } {
  let city = String(input.location_city || "").trim() || null;
  let state = String(input.location_state || "").trim() || null;
  let eros_state_wide = false;

  if (city?.includes(",")) {
    const parsed = parseCityStateCombo(city);
    city = parsed.city;
    state = state || parsed.state;
  }

  if (input.verification_provider === "eros" && input.verification_url) {
    const fromUrl = parseErosLocationFromUrl(input.verification_url);
    eros_state_wide = fromUrl.stateWide;
    if (eros_state_wide) {
      city = "Statewide";
      state = state || fromUrl.state;
    } else if (!state || state.length > 3) {
      city = city || fromUrl.city;
      state = state || fromUrl.state;
    }
  }

  // State-only Eros hubs often store the state name in location_city
  if (!state && city && city.toLowerCase() !== "statewide") {
    state = resolveStateAbbrev(city);
  }

  if (state && state.length > 3) {
    state = resolveStateAbbrev(state) ?? state.toUpperCase();
  }

  if (city && city.toLowerCase() !== "statewide") {
    const canonical = canonicalizePublicCity(city, state);
    if (canonical) {
      city = canonical.name;
      state = state || knownCityState(canonical.name);
    } else if (!isPlausiblePublicCityName(city)) {
      city = null;
    }
  }

  return {
    location_city: city,
    location_state: state,
    eros_state_wide,
  };
}
