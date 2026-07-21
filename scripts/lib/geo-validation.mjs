/**
 * City→state geo validation for imported providers.
 *
 * When a parsed city is a well-known US city that clearly belongs to a different
 * state than the parsed state, correct the state (or log a warning).
 *
 * This catches bugs like "Milwaukee, VA" (should be Milwaukee, WI).
 *
 * IMPORTANT: Cities that exist in multiple states (e.g. Springfield in IL/MA/MO)
 * are mapped to an array — correction only fires when the city maps to exactly
 * one state, avoiding false-positive corrections.
 */

/**
 * Map from lowercase city → single expected state code.
 * Only cities that are unambiguously associated with ONE state belong here.
 * Cities in multiple states are in AMBIGUOUS_CITY_STATES and are skipped.
 */
const CITY_STATE_MAP = {
  // Wisconsin
  "milwaukee": "WI",
  "madison": "WI",
  "green bay": "WI",
  "kenosha": "WI",
  "racine": "WI",
  "appleton": "WI",
  "eau claire": "WI",
  "oshkosh": "WI",
  "janesville": "WI",
  "waupaca": "WI",
  "sheboygan": "WI",
  "waukesha": "WI",
  "west allis": "WI",
  "la crosse": "WI",
  "wisconsin rapids": "WI",
  "marshfield": "WI",
  "wisconsin dells": "WI",

  // Florida
  "miami": "FL",
  "orlando": "FL",
  "tampa": "FL",
  "jacksonville": "FL",
  "fort lauderdale": "FL",
  "west palm beach": "FL",
  "naples": "FL",
  "tallahassee": "FL",
  "st. petersburg": "FL",
  "sarasota": "FL",
  "fort myers": "FL",
  "clearwater": "FL",
  "gainesville": "FL",
  "daytona beach": "FL",
  "key west": "FL",
  "panama city": "FL",

  // New York
  "new york": "NY",
  "manhattan": "NY",
  "brooklyn": "NY",
  "queens": "NY",
  "bronx": "NY",
  "staten island": "NY",
  "buffalo": "NY",
  "albany": "NY",
  "syracuse": "NY",
  "yonkers": "NY",
  "utica": "NY",
  "ithaca": "NY",
  "niagara falls": "NY",

  // California
  "los angeles": "CA",
  "san francisco": "CA",
  "san diego": "CA",
  "sacramento": "CA",
  "san jose": "CA",
  "orange county": "CA",
  "long beach": "CA",
  "oakland": "CA",
  "fresno": "CA",
  "santa ana": "CA",
  "anaheim": "CA",
  "riverside": "CA",
  "bakersfield": "CA",
  "stockton": "CA",
  "modesto": "CA",
  "santa barbara": "CA",
  "pasadena": "CA",
  "beverly hills": "CA",
  "west hollywood": "CA",
  "palm springs": "CA",
  "huntington beach": "CA",
  "irvine": "CA",

  // Texas
  "houston": "TX",
  "dallas": "TX",
  "san antonio": "TX",
  "fort worth": "TX",
  "el paso": "TX",
  "plano": "TX",
  "lubbock": "TX",
  "amarillo": "TX",
  "corpus christi": "TX",
  "mcallen": "TX",
  "laredo": "TX",
  "galveston": "TX",

  // Illinois
  "chicago": "IL",
  "naperville": "IL",
  "rockford": "IL",
  "peoria": "IL",
  "evanston": "IL",
  "schaumburg": "IL",
  "oak brook": "IL",
  "skokie": "IL",

  // Nevada
  "las vegas": "NV",
  "reno": "NV",
  "henderson": "NV",
  "carson city": "NV",
  "sparks": "NV",

  // Georgia
  "atlanta": "GA",
  "savannah": "GA",
  "augusta": "GA",
  "macon": "GA",
  "sandy springs": "GA",
  "marietta": "GA",

  // Colorado
  "denver": "CO",
  "colorado springs": "CO",
  "boulder": "CO",
  "fort collins": "CO",

  // Washington
  "seattle": "WA",
  "spokane": "WA",
  "tacoma": "WA",
  "bellevue": "WA",
  "olympia": "WA",

  // Arizona
  "phoenix": "AZ",
  "tucson": "AZ",
  "scottsdale": "AZ",
  "mesa": "AZ",
  "tempe": "AZ",
  "chandler": "AZ",

  // Massachusetts
  "boston": "MA",
  "cambridge": "MA",
  "worcester": "MA",

  // Pennsylvania
  "philadelphia": "PA",
  "pittsburgh": "PA",
  "harrisburg": "PA",
  "allentown": "PA",
  "erie": "PA",

  // Michigan
  "detroit": "MI",
  "grand rapids": "MI",
  "ann arbor": "MI",
  "lansing": "MI",
  "flint": "MI",

  // Tennessee
  "nashville": "TN",
  "memphis": "TN",
  "knoxville": "TN",
  "chattanooga": "TN",
  "gatlinburg": "TN",

  // North Carolina
  "charlotte": "NC",
  "raleigh": "NC",
  "greensboro": "NC",
  "durham": "NC",
  "asheville": "NC",
  // Ohio
  "columbus": "OH",
  "cleveland": "OH",
  "cincinnati": "OH",
  "toledo": "OH",
  "akron": "OH",
  "youngstown": "OH",

  // Indiana
  "indianapolis": "IN",
  "fort wayne": "IN",
  "evansville": "IN",
  "south bend": "IN",
  "bloomington": "IN",

  // Minnesota
  "minneapolis": "MN",
  "duluth": "MN",

  // Maryland
  "baltimore": "MD",
  "annapolis": "MD",
  "bethesda": "MD",

  // Missouri (kansas city excluded — ambiguous with Kansas City KS)
  "st. louis": "MO",

  // Virginia
  "virginia beach": "VA",
  "norfolk": "VA",
  "alexandria": "VA",

  // Oregon
  "eugene": "OR",

  // Louisiana
  "new orleans": "LA",
  "baton rouge": "LA",
  "shreveport": "LA",

  // Kentucky
  "louisville": "KY",
  "lexington": "KY",

  // Connecticut
  "hartford": "CT",
  "new haven": "CT",
  "stamford": "CT",

  // Utah
  "salt lake city": "UT",
  "park city": "UT",
  "provo": "UT",

  // Alabama
  "birmingham": "AL",
  "montgomery": "AL",
  "mobile": "AL",

  // Iowa
  "des moines": "IA",

  // Kansas
  "wichita": "KS",

  // Nebraska
  "omaha": "NE",
  "lincoln": "NE",

  // New Jersey (newark excluded — ambiguous: Newark DE exists)
  "jersey city": "NJ",
  "atlantic city": "NJ",

  // New Mexico
  "albuquerque": "NM",
  "santa fe": "NM",

  // Oklahoma
  "oklahoma city": "OK",
  "tulsa": "OK",

  // Arkansas
  "little rock": "AR",

  // Montana
  "billings": "MT",

  // Idaho
  "boise": "ID",

  // Delaware
  "wilmington": "DE",

  // DC
  "washington dc": "DC",

  // Hawaii
  "honolulu": "HI",

  // Alaska
  "anchorage": "AK",

  // New Hampshire (manchester excluded — ambiguous: Manchester CT)
  "nashua": "NH",

  // Rhode Island
  "providence": "RI",

  // Vermont (burlington excluded — ambiguous: Burlington NC/MA/IA/NJ)
  "montpelier": "VT",

  // Wyoming
  "cheyenne": "WY",

  // North Dakota
  "fargo": "ND",

  // South Dakota
  "sioux falls": "SD",
};

/**
 * Cities that exist in multiple US states — we intentionally SKIP these
 * to avoid false-positive corrections. If someone says "Springfield, VA",
 * we leave it alone because Springfield, IL/MA/MO are all legitimate too.
 */
const AMBIGUOUS_CITY_STATES = new Set([
  "aurora",        // IL, CO
  "springfield",   // IL, MA, MO, OR
  "rochester",     // NY, MN
  "columbus",      // GA, OH, IN, TX
  "madison",       // WI, AL, IN, TN, NJ, MS
  "kansas city",   // MO, KS
  "portland",      // OR, ME
  "salem",         // MA, OR
  "charleston",    // SC, WV
  "arlington",     // TX, VA
  "austin",        // TX, MN
  "jackson",       // MS, TN, FL, WY, MI
  "columbia",      // SC, MD, MO
  "richmond",      // VA, CA, IN, KY
  "newark",        // NJ, DE, OH
  "dayton",        // OH, TN, NV
  "manchester",    // NH, CT, MA
  "burlington",    // VT, NC, MA, IA, NJ
  "greenville",    // SC, NC, MS, TX
  "glendale",      // CA, AZ
  "pasadena",      // CA, TX
  "alexandria",    // VA, LA
  "clinton",       // IA, MD, MI, MS, NJ, NY
  "auburn",        // AL, ME, NY, WA
  "dover",         // DE, NH, NJ
  "franklin",      // TN, WI, MA, IN, many others
  "marion",        // IN, OH, IL, IA
  "troy",          // NY, MI, AL, OH
  "lancaster",     // PA, CA, OH, NY
  "florence",      // AL, SC, KY, AZ
  "oxford",        // MS, OH, AL, CT, MA
  "bristol",       // CT, TN, VA, RI
  "canton",        // OH, GA, IL, MA, MI
  "chester",       // PA, VA, MD, NJ, NY
  "bloomington",   // IN, IL, MN, CA
  "georgetown",    // DC, TX, KY, SC
  "newport",       // RI, KY, OR, CA
  "milford",       // CT, MA, DE, MI, NH
  "fairfield",     // CT, CA, IA, NJ, OH
  "riverside",     // CA (primary) — also small towns elsewhere; kept ambiguous
]);

/**
 * Validate and potentially correct city→state mapping.
 * Returns { city, state, corrected } where corrected is true if state was changed.
 *
 * @param {string} city - parsed city name
 * @param {string} state - parsed 2-letter state code
 * @returns {{ city: string, state: string, corrected: boolean }}
 */
export function validateCityState(city, state) {
  if (!city || !state) return { city, state, corrected: false };

  const normalizedCity = city.toLowerCase().trim();
  const normalizedState = state.toUpperCase().trim();

  // Skip ambiguous cities — can't reliably correct them
  if (AMBIGUOUS_CITY_STATES.has(normalizedCity)) {
    return { city, state: normalizedState, corrected: false };
  }

  const expectedState = CITY_STATE_MAP[normalizedCity];
  if (expectedState && expectedState !== normalizedState) {
    return { city, state: expectedState, corrected: true };
  }

  return { city, state: normalizedState, corrected: false };
}

/**
 * Apply geo validation to a provider payload before insert/update.
 * Mutates location_state if needed and returns { corrected, originalState, newState }.
 *
 * @param {{ location_city?: string, location_state?: string }} payload
 * @returns {{ corrected: boolean, originalState: string|null, newState: string|null, city: string|null }}
 */
export function applyGeoValidation(payload) {
  const city = payload.location_city;
  const state = payload.location_state;
  if (!city || !state) return { corrected: false, originalState: state ?? null, newState: state ?? null, city };

  const result = validateCityState(city, state);
  if (result.corrected) {
    payload.location_state = result.state;
    return { corrected: true, originalState: state, newState: result.state, city };
  }
  return { corrected: false, originalState: state, newState: state, city };
}
