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

/**
 * Top 5 major cities per US state (Tryst URL slugs).
 * Skips city discovery — generates URLs directly.
 * Each city typically has 6-7+ pages of models.
 */
export const TRYST_MAJOR_CITIES = {
  alabama: ["birmingham", "montgomery", "mobile", "huntsville", "tuscaloosa"],
  alaska: ["anchorage", "fairbanks", "juneau", "wasilla", "sitka"],
  arizona: ["phoenix", "tucson", "mesa", "scottsdale", "tempe"],
  arkansas: ["little-rock", "fayetteville", "fort-smith", "springdale", "jonesboro"],
  california: ["los-angeles", "san-francisco", "san-diego", "sacramento", "san-jose"],
  colorado: ["denver", "colorado-springs", "boulder", "fort-collins", "aurora"],
  connecticut: ["hartford", "new-haven", "stamford", "bridgeport", "waterbury"],
  delaware: ["wilmington", "dover", "newark", "middletown", "smyrna"],
  "district-of-columbia": ["washington-dc"],
  florida: ["miami", "orlando", "tampa", "jacksonville", "fort-lauderdale"],
  georgia: ["atlanta", "savannah", "augusta", "columbus", "macon"],
  hawaii: ["honolulu", "hilo", "kailua", "lahaina", "waikiki"],
  idaho: ["boise", "meridian", "nampa", "idaho-falls", "coeur-dalene"],
  illinois: ["chicago", "springfield", "peoria", "rockford", "naperville"],
  indiana: ["indianapolis", "fort-wayne", "evansville", "south-bend", "bloomington"],
  iowa: ["des-moines", "cedar-rapids", "davenport", "iowa-city", "sioux-city"],
  kansas: ["wichita", "kansas-city", "topeka", "lawrence", "overland-park"],
  kentucky: ["louisville", "lexington", "bowling-green", "owensboro", "covington"],
  louisiana: ["new-orleans", "baton-rouge", "shreveport", "lafayette", "lake-charles"],
  maine: ["portland", "bangor", "augusta", "lewiston", "bar-harbor"],
  maryland: ["baltimore", "annapolis", "bethesda", "silver-spring", "frederick"],
  massachusetts: ["boston", "springfield", "worcester", "cambridge", "salem"],
  michigan: ["detroit", "grand-rapids", "ann-arbor", "lansing", "flint"],
  minnesota: ["minneapolis", "st-paul", "rochester", "duluth", "bloomington"],
  mississippi: ["jackson", "gulfport", "biloxi", "hattiesburg", "southaven"],
  missouri: ["kansas-city", "st-louis", "springfield", "columbia", "branson"],
  montana: ["billings", "missoula", "bozeman", "helena", "kalispell"],
  nebraska: ["omaha", "lincoln", "grand-island", "kearney", "bellevue"],
  nevada: ["las-vegas", "reno", "henderson", "carson-city", "sparks"],
  "new-hampshire": ["manchester", "nashua", "concord", "portsmouth", "dover"],
  "new-jersey": ["newark", "jersey-city", "atlantic-city", "trenton", "hoboken"],
  "new-mexico": ["albuquerque", "santa-fe", "las-cruces", "roswell", "taos"],
  "new-york": ["new-york-city", "buffalo", "rochester", "albany", "syracuse"],
  "north-carolina": ["charlotte", "raleigh", "greensboro", "durham", "asheville"],
  "north-dakota": ["fargo", "bismarck", "grand-forks", "minot", "williston"],
  ohio: ["columbus", "cleveland", "cincinnati", "toledo", "dayton"],
  oklahoma: ["oklahoma-city", "tulsa", "norman", "stillwater", "edmond"],
  oregon: ["portland", "salem", "eugene", "bend", "medford"],
  pennsylvania: ["philadelphia", "pittsburgh", "harrisburg", "allentown", "erie"],
  "rhode-island": ["providence", "newport", "warwick", "cranston", "pawtucket"],
  "south-carolina": ["charleston", "columbia", "greenville", "myrtle-beach", "hilton-head"],
  "south-dakota": ["sioux-falls", "rapid-city", "aberdeen", "brookings", "watertown"],
  tennessee: ["nashville", "memphis", "knoxville", "chattanooga", "gatlinburg"],
  texas: ["houston", "dallas", "austin", "san-antonio", "fort-worth"],
  utah: ["salt-lake-city", "park-city", "provo", "ogden", "st-george"],
  vermont: ["burlington", "montpelier", "rutland", "stowe", "brattleboro"],
  virginia: ["richmond", "virginia-beach", "norfolk", "arlington", "alexandria"],
  washington: ["seattle", "spokane", "tacoma", "bellevue", "olympia"],
  "west-virginia": ["charleston", "morgantown", "huntington", "wheeling", "martinsburg"],
  wisconsin: ["milwaukee", "madison", "green-bay", "kenosha", "racine"],
  wyoming: ["cheyenne", "jackson", "casper", "laramie", "cody"],
};
