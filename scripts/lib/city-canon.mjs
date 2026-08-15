/**
 * Shared city canonicalization for LBV catalog importers.
 * Mirrors backend/src/lib/locationMatch.ts public-city rules so DB writes
 * never re-pollute location_city with ad titles / bio fragments.
 */

const CITY_TO_STATE = {
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

const CITY_MARKETING_RE =
  /\b(beauty|pornstar|porn|kink|kinky|gfe|bbbj|bbw|queen|booty|throat|goat|exotic|experience|experienc|curves|providing|royal|anal|spinner|sensual|unforgettable|muse|latina|latino|angel|seductive|authentic|witty|spicy|t-boy|tboy|deal|special|someone|control|physical|auburn|nessa|passion|pleasure|rated|afro|sexy|baby|modern|love|blonde|brunette|redhead|milf|ts\b|trans|escort|companion|available|inviting|tempt|relaxed|travel|caters|privacy\s*policy)\b/i;

const US_STATE_ABBREV = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM",
  "NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA",
  "WV","WI","WY",
]);

export function normalizeCityKey(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function titleCaseCity(value) {
  const key = normalizeCityKey(value);
  if (key === "washington dc" || key === "washington d c") return "Washington DC";
  if (key === "st louis" || key === "st. louis" || key === "saint louis") return "St. Louis";
  if (key === "st paul" || key === "st. paul" || key === "saint paul") return "St. Paul";
  if (key === "st petersburg" || key === "saint petersburg") return "St. Petersburg";
  if (key === "port st lucie" || key === "port saint lucie") return "Port St. Lucie";
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function knownCityState(city) {
  return CITY_TO_STATE[normalizeCityKey(city)] ?? null;
}

export function extractTrailingKnownCity(raw) {
  let text = String(raw || "").trim();
  if (!text) return null;
  text = text.replace(/\b([A-Za-z.'-]+(?:\s+[A-Za-z.'-]+)?)\s+\1\b/i, "$1");
  text = text.replace(/\s*[-–—]\s*/g, " ");
  text = text.replace(/[.!?]+/g, " ");
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  for (const take of [3, 2, 1]) {
    if (words.length <= take) continue;
    const candidate = words.slice(-take).join(" ");
    if (knownCityState(candidate)) return titleCaseCity(candidate);
  }
  const last = words[words.length - 1];
  const prefix = words.slice(0, -1).join(" ");
  if (
    last &&
    /^[A-Za-z][A-Za-z.'-]{1,24}$/.test(last) &&
    !CITY_MARKETING_RE.test(last) &&
    (CITY_MARKETING_RE.test(prefix) || words.length >= 4) &&
    !/^(usa|us|the|and|of|in|to|for)$/i.test(last)
  ) {
    return titleCaseCity(last);
  }
  return null;
}

export function isPlausiblePublicCityName(raw) {
  const city = String(raw || "").trim();
  if (!city || city.length < 2 || city.length > 40) return false;
  if (/https?:\/\//i.test(city) || /tryst\.link|eros\.com|a4cdn/i.test(city)) return false;
  if (/^(unknown|n\/?a|none|null|statewide|caters\s*to|privacy\s*policy)$/i.test(city)) return false;
  if (/\bi create\b/i.test(city)) return false;
  if (/caters\s*to/i.test(city)) return false;
  if (/[0-9]/.test(city)) return false;
  if (/[@#*&/\\|]/.test(city)) return false;
  const words = city.split(/\s+/).filter(Boolean);
  if (words.length > 4) return false;
  if (/^[A-Za-z .'-]+\.\s+[A-Za-z]/.test(city)) return false;
  if (/[.!?]/.test(city) && words.length >= 2) return false;
  if (knownCityState(city)) return true;
  if (CITY_MARKETING_RE.test(city)) return false;
  const trailing = extractTrailingKnownCity(city);
  if (trailing && normalizeCityKey(trailing) !== normalizeCityKey(city)) return false;
  if (words.length >= 4) return false;
  return true;
}

/**
 * @returns {{ name: string, slug: string } | null}
 */
export function canonicalizePublicCity(rawCity, stateCode = null) {
  let city = String(rawCity || "").trim();
  if (!city) return null;
  if (/^statewide$/i.test(city)) return { name: "Statewide", slug: "statewide" };

  if (knownCityState(city)) {
    const name = titleCaseCity(city);
    return { name, slug: slugify(name) };
  }

  if (/^new\s+york\s+city\s*[-–—]?\s*manhattan$/i.test(city)) {
    return { name: "Manhattan", slug: "manhattan" };
  }

  if (city.includes(",")) {
    const left = city.split(",")[0].trim();
    if (left) city = left;
  }

  const trailingState = city.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (trailingState) {
    const maybe = trailingState[2].toUpperCase();
    if (
      US_STATE_ABBREV.has(maybe) &&
      maybe !== "DC" &&
      (!stateCode || maybe === String(stateCode).toUpperCase()) &&
      !knownCityState(city)
    ) {
      city = trailingState[1].trim();
    }
  }

  if (!isPlausiblePublicCityName(city)) {
    const recovered = extractTrailingKnownCity(city);
    if (!recovered || !isPlausiblePublicCityName(recovered)) return null;
    city = recovered;
  } else {
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
  const name = titleCaseCity(city);
  const slug = slugify(name);
  if (!slug) return null;
  return { name, slug };
}

/**
 * Mutates payload.location_city (and optionally fills state from known map).
 * @returns {{ cityChanged: boolean, originalCity: string|null, newCity: string|null }}
 */
export function applyCityCanon(payload) {
  const original = payload?.location_city ?? null;
  if (original == null || String(original).trim() === "") {
    return { cityChanged: false, originalCity: original, newCity: original };
  }
  if (/^statewide$/i.test(String(original).trim())) {
    payload.location_city = "Statewide";
    return { cityChanged: String(original) !== "Statewide", originalCity: original, newCity: "Statewide" };
  }
  const canon = canonicalizePublicCity(original, payload.location_state);
  const next = canon?.name ?? null;
  payload.location_city = next;
  if (!payload.location_state && next && next !== "Statewide") {
    const inferred = knownCityState(next);
    if (inferred) payload.location_state = inferred;
  }
  return {
    cityChanged: String(original || "") !== String(next || ""),
    originalCity: original,
    newCity: next,
  };
}
