/**
 * US state slug → abbrev for Tryst URLs (tryst.link/us/escorts/{state}/{city}).
 */
export const TRYST_STATE_SLUGS = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district-of-columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new-hampshire": "NH",
  "new-jersey": "NJ",
  "new-mexico": "NM",
  "new-york": "NY",
  "north-carolina": "NC",
  "north-dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode-island": "RI",
  "south-carolina": "SC",
  "south-dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west-virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

export function titleCaseWords(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function parseTrystCityUrl(url) {
  const match = String(url ?? "").match(/tryst\.link\/us\/escorts\/([a-z0-9-]+)\/([a-z0-9-]+)/i);
  if (!match) return null;
  const stateSlug = match[1].toLowerCase();
  const citySlug = match[2].toLowerCase();
  return {
    stateSlug,
    citySlug,
    stateAbbrev: TRYST_STATE_SLUGS[stateSlug] ?? stateSlug.toUpperCase(),
    cityName: titleCaseWords(citySlug.replace(/-/g, " ")),
  };
}

export function parseTrystProfileUrl(url) {
  const match = String(url ?? "").match(/tryst\.link\/escort\/([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

/** Pilot cities for first rollout (expand after validation). */
export const TRYST_PILOT_CITIES = [
  { state: "florida", city: "miami" },
  { state: "florida", city: "tampa" },
  { state: "texas", city: "dallas" },
  { state: "texas", city: "houston" },
  { state: "california", city: "los-angeles" },
  { state: "nevada", city: "las-vegas" },
  { state: "new-york", city: "new-york-city" },
  { state: "georgia", city: "atlanta" },
];
