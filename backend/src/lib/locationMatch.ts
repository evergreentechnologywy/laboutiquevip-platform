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
  const locationSlug = slugify(location);

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

  return { OR: branches };
}

export function parseErosLocationFromUrl(url: string): { city: string | null; state: string | null } {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 1) return { city: null, state: null };

    const stateSlug = segments[0];
    const citySlug = segments[1];

    // State-only hub: /{state}/files/{id}.htm
    if (stateSlug && citySlug === "files") {
      const state =
        resolveStateAbbrev(stateSlug) ??
        (stateSlug.length <= 3
          ? stateSlug.toUpperCase()
          : titleCaseWords(stateSlug.replace(/[_-]+/g, " ")));
      return { city: null, state };
    }

    if (!stateSlug || !citySlug || citySlug === "files") return { city: null, state: null };

    const state = resolveStateAbbrev(stateSlug) ?? stateSlug.toUpperCase();
    const city = titleCaseWords(citySlug.replace(/[_-]+/g, " "));
    return { city, state };
  } catch {
    return { city: null, state: null };
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
}): { location_city: string | null; location_state: string | null } {
  let city = String(input.location_city || "").trim() || null;
  let state = String(input.location_state || "").trim() || null;

  if (city?.includes(",")) {
    const parsed = parseCityStateCombo(city);
    city = parsed.city;
    state = state || parsed.state;
  }

  if ((!state || state.length > 3) && input.verification_provider === "eros" && input.verification_url) {
    const fromUrl = parseErosLocationFromUrl(input.verification_url);
    city = city || fromUrl.city;
    state = state || fromUrl.state;
  }

  // State-only Eros hubs often store the state name in location_city
  if (!state && city) {
    state = resolveStateAbbrev(city);
  }

  if (state && state.length > 3) {
    state = resolveStateAbbrev(state) ?? state.toUpperCase();
  }

  return {
    location_city: city,
    location_state: state,
  };
}
