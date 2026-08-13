import type { ApiRequest, ApiResponse } from "../types.js";
import { loadPublishedCatalog, clearPublishedCatalogCache } from "../lib/publishedCatalog.js";
import {
  buildPublicPhotoSearchFilter,
  publicProviderVisibilityWhere,
  publicSearchCacheHeaders,
} from "./providerVisibility.js";
import {
  canonicalizePublicCity,
  isValidUsStateAbbrev,
  resolveStateAbbrev,
  slugify,
  stateDisplayName,
} from "../lib/locationMatch.js";

interface BrowseRouteContext {
  prisma: any;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

const AGGREGATE_CACHE_TTL_MS = 60_000;

/** US Census Bureau region grouping. */
const STATE_REGIONS: Record<string, string> = {
  CT: "Northeast", ME: "Northeast", MA: "Northeast", NH: "Northeast", RI: "Northeast",
  VT: "Northeast", NJ: "Northeast", NY: "Northeast", PA: "Northeast",
  IL: "Midwest", IN: "Midwest", MI: "Midwest", OH: "Midwest", WI: "Midwest",
  IA: "Midwest", KS: "Midwest", MN: "Midwest", MO: "Midwest", NE: "Midwest",
  ND: "Midwest", SD: "Midwest",
  DE: "South", FL: "South", GA: "South", MD: "South", NC: "South", SC: "South",
  VA: "South", WV: "South", DC: "South", AL: "South", KY: "South", MS: "South",
  TN: "South", AR: "South", LA: "South", OK: "South", TX: "South",
  AZ: "West", CO: "West", ID: "West", MT: "West", NV: "West", NM: "West",
  UT: "West", WY: "West", AK: "West", CA: "West", HI: "West", OR: "West", WA: "West",
};

const REGION_ORDER = ["Northeast", "Midwest", "South", "West"];

interface VisibleLocationRow {
  id: string;
  location_state: string | null;
  location_city: string | null;
  is_verified: boolean | null;
}

let browseStatesCache: { body: unknown; expiresAt: number } | null = null;
const browseStateCitiesCache = new Map<string, { body: unknown; expiresAt: number }>();
let statsCache: { body: unknown; expiresAt: number } | null = null;

/** Test helper — bust in-memory browse/stats caches after data mutations. */
export function clearBrowseCaches(): void {
  browseStatesCache = null;
  browseStateCitiesCache.clear();
  statsCache = null;
  clearPublishedCatalogCache();
}

/**
 * Public-visible providers only: visibility guardrails + SQL photo-ID pre-filter
 * (cached inside providerVisibility for 60s, so repeat calls in one window are cheap).
 */
async function loadVisibleLocationRows(prisma: any): Promise<VisibleLocationRow[]> {
  const where = {
    AND: [publicProviderVisibilityWhere(), await buildPublicPhotoSearchFilter(prisma)],
  };
  return prisma.provider.findMany({
    where,
    select: {
      id: true,
      location_state: true,
      location_city: true,
      is_verified: true,
    },
  }) as Promise<VisibleLocationRow[]>;
}

interface StateAggregate {
  code: string;
  name: string;
  slug: string;
  providerCount: number;
  cities: Map<string, { slug: string; name: string; providerCount: number; verifiedCount: number }>;
}

function aggregateRowsByState(rows: VisibleLocationRow[]): Map<string, StateAggregate> {
  const stateMap = new Map<string, StateAggregate>();

  for (const row of rows) {
    const code = resolveStateAbbrev(String(row.location_state || "").trim());
    if (!code || !isValidUsStateAbbrev(code)) continue;

    const stateEntry = stateMap.get(code) ?? {
      code,
      name: stateDisplayName(code),
      slug: slugify(stateDisplayName(code)),
      providerCount: 0,
      cities: new Map<string, { slug: string; name: string; providerCount: number; verifiedCount: number }>(),
    };
    stateEntry.providerCount += 1;

    const canonical = canonicalizePublicCity(String(row.location_city || "").trim(), code);
    if (canonical) {
      const cityEntry = stateEntry.cities.get(canonical.slug) ?? {
        slug: canonical.slug,
        name: canonical.name,
        providerCount: 0,
        verifiedCount: 0,
      };
      if (canonical.name.length < cityEntry.name.length) cityEntry.name = canonical.name;
      cityEntry.providerCount += 1;
      if (row.is_verified) cityEntry.verifiedCount += 1;
      stateEntry.cities.set(canonical.slug, cityEntry);
    }

    stateMap.set(code, stateEntry);
  }

  return stateMap;
}

/** GET /api/v1/browse/states — states grouped by US region with per-state provider/city counts. */
export async function browseStatesHandler(request: ApiRequest, context: BrowseRouteContext): Promise<ApiResponse> {
  try {
    if (request.method !== "GET") {
      return json(405, { error: "method_not_allowed" });
    }

    const now = Date.now();
    if (browseStatesCache && browseStatesCache.expiresAt > now) {
      return {
        statusCode: 200,
        headers: publicSearchCacheHeaders(),
        body: browseStatesCache.body,
      };
    }

    const rows = await loadVisibleLocationRows(context.prisma);
    const stateMap = aggregateRowsByState(rows);

    const regionMap = new Map<string, Array<{ code: string; name: string; slug: string; providerCount: number; cityCount: number }>>();
    let totalCities = 0;

    for (const state of stateMap.values()) {
      const region = STATE_REGIONS[state.code] ?? "Other";
      const list = regionMap.get(region) ?? [];
      list.push({
        code: state.code,
        name: state.name,
        slug: state.slug,
        providerCount: state.providerCount,
        cityCount: state.cities.size,
      });
      totalCities += state.cities.size;
      regionMap.set(region, list);
    }

    const orderedRegions = [...REGION_ORDER, "Other"].filter((region) => regionMap.has(region));
    const regions = orderedRegions.map((region) => ({
      region,
      states: (regionMap.get(region) ?? []).sort(
        (a, b) => b.providerCount - a.providerCount || a.name.localeCompare(b.name),
      ),
    }));

    const body = {
      regions,
      totals: {
        providers: Array.from(stateMap.values()).reduce((sum, s) => sum + s.providerCount, 0),
        states: stateMap.size,
        cities: totalCities,
      },
    };

    browseStatesCache = { body, expiresAt: now + AGGREGATE_CACHE_TTL_MS };

    return {
      statusCode: 200,
      headers: publicSearchCacheHeaders(),
      body,
    };
  } catch {
    return json(500, { error: "internal_error" });
  }
}

/** GET /api/v1/browse/states/{slug} — cities in one state with provider + verified counts. */
export async function browseStateCitiesHandler(
  request: ApiRequest,
  stateSlug: string,
  context: BrowseRouteContext,
): Promise<ApiResponse> {
  try {
    if (request.method !== "GET") {
      return json(405, { error: "method_not_allowed" });
    }

    const code = resolveStateAbbrev(stateSlug);
    if (!code || !isValidUsStateAbbrev(code)) {
      return json(404, { error: "state_not_found" });
    }

    const now = Date.now();
    const cached = browseStateCitiesCache.get(code);
    if (cached && cached.expiresAt > now) {
      return {
        statusCode: 200,
        headers: publicSearchCacheHeaders(),
        body: cached.body,
      };
    }

    const rows = await loadVisibleLocationRows(context.prisma);
    const stateMap = aggregateRowsByState(rows);
    const state = stateMap.get(code);

    if (!state) {
      return json(404, { error: "state_not_found" });
    }

    const cities = Array.from(state.cities.values()).sort(
      (a, b) => b.providerCount - a.providerCount || a.name.localeCompare(b.name),
    );
    const verifiedTotal = cities.reduce((sum, city) => sum + city.verifiedCount, 0);

    const body = {
      state: { code: state.code, name: state.name, slug: state.slug },
      cities,
      totals: {
        providers: state.providerCount,
        verified: verifiedTotal,
        cities: cities.length,
      },
    };

    browseStateCitiesCache.set(code, { body, expiresAt: now + AGGREGATE_CACHE_TTL_MS });

    return {
      statusCode: 200,
      headers: publicSearchCacheHeaders(),
      body,
    };
  } catch {
    return json(500, { error: "internal_error" });
  }
}

/** GET /api/v1/stats — public catalog totals (providers, cities, states, photos). */
export async function statsHandler(request: ApiRequest, context: BrowseRouteContext): Promise<ApiResponse> {
  try {
    if (request.method !== "GET") {
      return json(405, { error: "method_not_allowed" });
    }

    const now = Date.now();
    if (statsCache && statsCache.expiresAt > now) {
      return {
        statusCode: 200,
        headers: publicSearchCacheHeaders(),
        body: statsCache.body,
      };
    }

    const catalog = await loadPublishedCatalog(context.prisma);
    const body = catalog.stats;

    statsCache = { body, expiresAt: now + AGGREGATE_CACHE_TTL_MS };

    return {
      statusCode: 200,
      headers: publicSearchCacheHeaders(),
      body,
    };
  } catch {
    return json(500, { error: "internal_error" });
  }
}
