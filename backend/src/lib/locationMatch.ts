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

/** Common city names → state abbrev for state-wide Eros hub matching. */
const CITY_TO_STATE: Record<string, string> = {
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
  tucson: "AZ",
  scottsdale: "AZ",
  mesa: "AZ",
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
  durham: "NC",
  charleston: "SC",
  columbia: "SC",
  greenville: "SC",
};

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

export function resolveStateAbbrev(raw: string): string | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
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

  const stateMatchers = stateTerms.flatMap((term) => [
    { location_state: { contains: term, mode: "insensitive" } },
    { location_city: { contains: term, mode: "insensitive" } },
  ]);

  const branches: Record<string, unknown>[] = [...cityMatchers, ...stateMatchers];

  if (parsed.state) {
    for (const term of stateSearchTerms(parsed.state)) {
      branches.push({
        AND: [
          { location_city: { contains: parsed.city ?? location, mode: "insensitive" } },
          {
            OR: [
              { location_state: { contains: term, mode: "insensitive" } },
              { location_city: { contains: term, mode: "insensitive" } },
            ],
          },
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

  return {
    location_city: city,
    location_state: state,
    eros_state_wide,
  };
}
