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
  biloxi: "MS",
  jackson: "MS",
  hartford: "CT",
  syracuse: "NY",
  albany: "NY",
  buffalo: "NY",
  rochester: "NY",
  "new haven": "CT",
  bridgeport: "CT",
  stamford: "CT",
  providence: "RI",
  worcester: "MA",
  bangor: "ME",
  burlington: "VT",
  manchester: "NH",
  concord: "NH",
  trenton: "NJ",
  paterson: "NJ",
  allentown: "PA",
  erie: "PA",
  harrisburg: "PA",
  scranton: "PA",
  wilmington: "DE",
  norfolk: "VA",
  roanoke: "VA",
  charlottesville: "VA",
  huntington: "WV",
  lexington: "KY",
  louisville: "KY",
  knoxville: "TN",
  chattanooga: "TN",
  clarksville: "TN",
  huntsville: "AL",
  mobile: "AL",
  montgomery: "AL",
  birmingham: "AL",
  gulfport: "MS",
  shreveport: "LA",
  lafayette: "LA",
  "lake charles": "LA",
  wichita: "KS",
  topeka: "KS",
  "cedar rapids": "IA",
  davenport: "IA",
  "sioux falls": "SD",
  fargo: "ND",
  boise: "ID",
  bend: "OR",
  medford: "OR",
  eugene: "OR",
  salem: "OR",
  spokane: "WA",
  olympia: "WA",
  fresno: "CA",
  bakersfield: "CA",
  stockton: "CA",
  "santa barbara": "CA",
  "santa rosa": "CA",
  "santa cruz": "CA",
  modesto: "CA",
  oxnard: "CA",
  ventura: "CA",
  henderson: "NV",
  sparks: "NV",
  ogden: "UT",
  provo: "UT",
  "fort collins": "CO",
  boulder: "CO",
  "grand junction": "CO",
  "sioux city": "IA",
  lincoln: "NE",
  fayetteville: "AR",
  "fort smith": "AR",
  "st joseph": "MO",
  "cedar park": "TX",
  "round rock": "TX",
  "college station": "TX",
  beaumont: "TX",
  lubbock: "TX",
  amarillo: "TX",
  waco: "TX",
  mckinney: "TX",
  frisco: "TX",
  irving: "TX",
  garland: "TX",
  "el paso": "TX",
  "miami beach": "FL",
  "palm beach": "FL",
  "daytona beach": "FL",
  "panama city": "FL",
  pensacola: "FL",
  gainesville: "FL",
  ocala: "FL",
  lakeland: "FL",
  "cape coral": "FL",
  sarasota: "FL",
  "oakland park": "FL",
  "pompano beach": "FL",
  hollywood: "FL",
  hialeah: "FL",
  kendall: "FL",
  doral: "FL",
  "brooklyn park": "MN",
  bloomington: "MN",
  duluth: "MN",
  "ann arbor": "MI",
  lansing: "MI",
  flint: "MI",
  warren: "MI",
  "sterling heights": "MI",
  "fort wayne": "IN",
  evansville: "IN",
  "south bend": "IN",
  rockford: "IL",
  aurora: "IL",
  joliet: "IL",
  "green bay": "WI",
  "coeur d alene": "ID",
  "coeur dalene": "ID",
  billings: "MT",
  missoula: "MT",
  cheyenne: "WY",
  casper: "WY",
  waikiki: "HI",
  "san juan": "PR",
  "santa ana": "CA",
  anaheim: "CA",
  riverside: "CA",
  "rancho cucamonga": "CA",
  "palm springs": "CA",
  "san bernardino": "CA",
  mcallen: "TX",
  brownsville: "TX",
  akron: "OH",
  toledo: "OH",
  dayton: "OH",
  youngstown: "OH",
  savannah: "GA",
  augusta: "GA",
  macon: "GA",
  asheville: "NC",
  greensboro: "NC",
  "winston salem": "NC",
  chandler: "AZ",
  tempe: "AZ",
  bozeman: "MT",
  "santa fe": "NM",
  "las cruces": "NM",
  fairbanks: "AK",
};

const BARE_CITY_FRAGMENTS = new Set([
  "city",
  "county",
  "beach",
  "bay",
  "arbor",
  "barbara",
  "arrow",
  "ana",
  "charles",
  "cherokee",
  "park",
  "falls",
  "springs",
  "heights",
  "hills",
  "grove",
  "valley",
  "station",
  "center",
  "centre",
  "port",
  "fort",
  "lake",
  "point",
  "view",
  "junction",
  "crossing",
  "island",
  "wood",
  "woods",
  "land",
  "town",
  "ville",
  "burg",
  "burgh",
  "haven",
  "worth",
  "wayne",
  "bend",
  "paul",
  "louis",
  "petersburg",
  "lucie",
  "raphael",
  "diego",
  "jose",
  "francisco",
  "antonio",
  "angeles",
]);

const GEO_CITY_PREFIX_RE = /^(north|south|east|west|northeast|northwest|southeast|southwest|fort|port|saint|st|new|los|las|san|santa|des|el|la|mt|mount|lake|upper|lower|great|little|big|royal|palm|long|grand|green|red|white|black|blue)$/i;

const CITY_MARKETING_RE = /(beauty|pornstar|porn|kink|kinky|gfe|bbbj|bbw|queen|booty|throat|goat|exotic|experience|experienc|curves|providing|royal|anal|spinner|sensual|unforgettable|muse|latina|latino|angel|seductive|authentic|witty|spicy|t-boy|tboy|deal|special|someone|control|physical|auburn|nessa|passion|pleasure|rated|afro|sexy|baby|modern|love|blonde|brunette|redhead|milf|ts|trans|escort|companion|available|inviting|tempt|relaxed|travel|caters|addictive|barbie|desired|beautiful|bad-assy|letsexplore)/i;

const US_STATE_ABBREV = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM",
  "NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA",
  "WV","WI","WY","PR",
]);

export function normalizeCityKey(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\./g, "")
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
  if (!words.length) return null;
  // Prefer longest known city window; scan from the end (trailing bias).
  // Never invent cities from marketing tokens (e.g. "...Chicago tonight" → Chicago).
  for (const take of [3, 2, 1]) {
    for (let i = words.length - take; i >= 0; i--) {
      const candidate = words.slice(i, i + take).join(" ");
      if (knownCityState(candidate)) return titleCaseCity(candidate);
    }
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
  // Bare place fragments ("Beach", "City", "Arbor") are not real hubs alone
  if (words.length === 1 && BARE_CITY_FRAGMENTS.has(normalizeCityKey(city))) {
    return false;
  }
  if (CITY_MARKETING_RE.test(city)) return false;
  const trailing = extractTrailingKnownCity(city);
  if (trailing && normalizeCityKey(trailing) !== normalizeCityKey(city)) {
    const recoveredWords = normalizeCityKey(trailing).split(" ").filter(Boolean);
    const allWords = normalizeCityKey(city).split(" ").filter(Boolean);
    const prefixWords = allWords.slice(0, Math.max(0, allWords.length - recoveredWords.length));
    const onlyGeoPrefix =
      prefixWords.length > 0 && prefixWords.every((w) => GEO_CITY_PREFIX_RE.test(w));
    if (!onlyGeoPrefix) return false;
  }
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
  } else if (!knownCityState(city)) {
    // Collapse "Bree Biloxi" / "Addictive Medford" person+city labels.
    // Keep real geo compounds ("North Miami") when every prefix is geographic.
    const recovered = extractTrailingKnownCity(city);
    if (recovered && normalizeCityKey(recovered) !== normalizeCityKey(city)) {
      const recoveredWords = normalizeCityKey(recovered).split(" ").filter(Boolean);
      const allWords = normalizeCityKey(city).split(" ").filter(Boolean);
      const prefixWords = allWords.slice(0, Math.max(0, allWords.length - recoveredWords.length));
      const onlyGeoPrefix =
        prefixWords.length > 0 && prefixWords.every((w) => GEO_CITY_PREFIX_RE.test(w));
      if (
        !onlyGeoPrefix ||
        CITY_MARKETING_RE.test(city) ||
        /[-–—]/.test(String(rawCity || ""))
      ) {
        city = recovered;
      }
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
