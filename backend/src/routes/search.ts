import type { ApiRequest, ApiResponse } from "../types.js";
import { ZodError, z } from "zod";
import { formatValidationErrors, searchModelsQuerySchema } from "../validation/models.js";
import { buildSearchModelFilters } from "./searchFilters.js";
import { publicProviderVisibilityWhere, publicSearchCacheHeaders, buildPublicPhotoSearchFilter } from "./providerVisibility.js";
import {
  buildLocationFilter,
  suggestLocationQueries,
  isValidUsStateAbbrev,
  resolveStateAbbrev,
  slugify,
  stateDisplayName,
} from "../lib/locationMatch.js";
import { dedupeProviders } from "../lib/providerDedupe.js";

interface SearchRouteContext {
  prisma: any;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

const citySearchSchema = z.object({
  q: z.string().trim().min(1).max(80),
});

const providerSearchSchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
  verified: z.coerce.boolean().optional().default(false),
  premium: z.coerce.boolean().optional().default(false),
  minPrice: z.coerce.number().min(0).max(100000).optional().default(0),
  maxPrice: z.coerce.number().min(0).max(100000).optional().default(2000),
  sort: z.enum(["newest", "rating", "price_low", "price_high"]).optional().default("newest"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(60),
});

function searchPayload(profile: any): Record<string, unknown> {
  return {
    slug: profile.slug,
    displayName: profile.displayName,
    city: profile.city,
    verified: profile.isVerified,
    tags: (profile.tags ?? []).map((tag: any) => tag.tag.slug),
    nextAvailable: profile.availabilityBlocks?.[0]?.startsAt ?? null,
  };
}

export async function searchCitiesHandler(request: ApiRequest, context: SearchRouteContext): Promise<ApiResponse> {
  try {
    const query = citySearchSchema.parse({ q: request.query.get("q") ?? "" });
    const searchTerm = query.q.toLowerCase();
    const prefix = `${searchTerm}%`;
    const partial = `%${searchTerm}%`;

    const rows = await context.prisma.$queryRaw`
      SELECT DISTINCT city, city_slug
      FROM (
        SELECT city, city_slug FROM provider_profiles
        UNION ALL
        SELECT city, city_slug FROM provider_availability_blocks
        UNION ALL
        SELECT city, city_slug FROM provider_tours
        UNION ALL
        SELECT location_city as city, lower(regexp_replace(location_city, '[^a-zA-Z0-9]+', '-', 'g')) as city_slug FROM "Provider" WHERE location_city IS NOT NULL AND status = 'active' AND is_profile_approved = true AND verification_provider IN ('eros', 'evergreen', 'tryst')
        UNION ALL
        SELECT location_state as city, lower(regexp_replace(location_state, '[^a-zA-Z0-9]+', '-', 'g')) as city_slug FROM "Provider" WHERE location_state IS NOT NULL AND status = 'active' AND is_profile_approved = true AND verification_provider IN ('eros', 'evergreen', 'tryst')
        UNION ALL
        SELECT concat(location_city, ', ', location_state) as city, lower(regexp_replace(concat(location_city, '-', location_state), '[^a-zA-Z0-9]+', '-', 'g')) as city_slug
          FROM "Provider"
          WHERE location_city IS NOT NULL AND location_state IS NOT NULL AND status = 'active' AND is_profile_approved = true AND verification_provider IN ('eros', 'evergreen', 'tryst')
      ) city_pool
      WHERE lower(city) LIKE ${partial}
         OR lower(city_slug) LIKE ${prefix}
         OR lower(city_slug) LIKE ${partial}
      ORDER BY city ASC
      LIMIT 25
    `;

    const staticSuggestions = suggestLocationQueries(query.q);
    const merged = [...staticSuggestions, ...(rows as Array<{ city: string; city_slug: string }>).map((row) => ({
      slug: row.city_slug,
      displayName: String(row.city || "").replace(/,\s*$/g, "").trim(),
    }))];

    return json(200, {
      query: query.q,
      items: merged
        .filter((row) => row.displayName.length > 1)
        .filter((row, index, all) => all.findIndex((item) => item.displayName.toLowerCase() === row.displayName.toLowerCase()) === index)
        .slice(0, 25),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return json(400, {
        error: "validation_error",
        issues: formatValidationErrors(error),
      });
    }

    return json(500, { error: "internal_error" });
  }
}

export async function searchProvidersHandler(request: ApiRequest, context: SearchRouteContext): Promise<ApiResponse> {
  try {
    const query = providerSearchSchema.parse({
      q: request.query.get("q") ?? undefined,
      location: request.query.get("location") ?? undefined,
      verified: request.query.get("verified") ?? undefined,
      premium: request.query.get("premium") ?? undefined,
      minPrice: request.query.get("minPrice") ?? undefined,
      maxPrice: request.query.get("maxPrice") ?? undefined,
      sort: request.query.get("sort") ?? undefined,
      page: request.query.get("page") ?? undefined,
      limit: request.query.get("limit") ?? undefined,
    });

    const andFilters: any[] = [publicProviderVisibilityWhere()];
    andFilters.push(await buildPublicPhotoSearchFilter(context.prisma));

    if (query.q) {
      andFilters.push({
        OR: [
          { display_name: { contains: query.q, mode: "insensitive" } },
          { bio: { contains: query.q, mode: "insensitive" } },
          { tagline: { contains: query.q, mode: "insensitive" } },
          { location_city: { contains: query.q, mode: "insensitive" } },
        ],
      });
    }

    if (query.location) {
      const locationFilter = buildLocationFilter(query.location);
      if (locationFilter) andFilters.push(locationFilter);
    }

    if (query.verified) andFilters.push({ is_verified: true });
    if (query.premium) {
      andFilters.push({
        OR: [{ is_premium: true }, { ad_package: "elite" }],
      });
    }
    andFilters.push({ OR: [{ rate_hourly: null }, { rate_hourly: { gte: query.minPrice, lte: query.maxPrice } }] });

    const where = { AND: andFilters };
    const orderBy =
      query.sort === "rating" ? [{ is_premium: "desc" }, { rating_average: "desc" }, { created_date: "desc" }] :
      query.sort === "price_low" ? [{ is_premium: "desc" }, { rate_hourly: "asc" }, { created_date: "desc" }] :
      query.sort === "price_high" ? [{ is_premium: "desc" }, { rate_hourly: "desc" }, { created_date: "desc" }] :
      [{ is_premium: "desc" }, { created_date: "desc" }];

    const skip = (query.page - 1) * query.limit;

    const [providers, total, aggregate] = await context.prisma.$transaction([
      context.prisma.provider.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        select: {
          id: true,
          display_name: true,
          tagline: true,
          bio: true,
          location_city: true,
          location_state: true,
          location_country: true,
          age: true,
          ethnicity: true,
          height: true,
          body_type: true,
          hair_color: true,
          eye_color: true,
          service_type: true,
          services_offered: true,
          social_media: true,
          verification_provider: true,
          verification_username: true,
          verification_url: true,
          review_provider: true,
          review_username: true,
          review_url: true,
          photos: true,
          tour_plan: true,
          ad_headline: true,
          ad_body: true,
          is_premium: true,
          is_verified: true,
          ad_package: true,
          views_count: true,
          rating_average: true,
          reviews_count: true,
          rate_hourly: true,
          created_date: true,
          updated_date: true,
        },
      }),
      context.prisma.provider.count({ where }),
      context.prisma.provider.aggregate({
        _max: { rate_hourly: true },
        where: { NOT: { rate_hourly: null } },
      }),
    ]);

    const maxRate = aggregate._max.rate_hourly || 2000;

    const dedupedProviders = dedupeProviders(providers);
    const duplicateCount = providers.length - dedupedProviders.length;

    const cityGroups = (Array.from(
      dedupedProviders.reduce((map: Map<string, { city: string; state: string; count: number }>, provider: any) => {
        const key = `${provider.location_city || "Unknown"}||${provider.location_state || "Unknown"}`;
        const current = map.get(key) ?? {
          city: provider.location_city || "Unknown",
          state: provider.location_state || "Unknown",
          count: 0,
        };
        current.count += 1;
        map.set(key, current);
        return map;
      }, new Map<string, { city: string; state: string; count: number }>()).values(),
    ) as Array<{ city: string; state: string; count: number }>).sort((a, b) => a.city.localeCompare(b.city));

    return {
      statusCode: 200,
      headers: publicSearchCacheHeaders(),
      body: {
      page: query.page,
      limit: query.limit,
      total: Math.max(0, total - duplicateCount),
      totalPages: Math.max(1, Math.ceil(Math.max(0, total - duplicateCount) / query.limit)),
      maxRate,
      cityGroups,
      items: dedupedProviders,
      },
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return json(400, {
        error: "validation_error",
        issues: formatValidationErrors(error),
      });
    }

    return json(500, { error: "internal_error" });
  }
}

type LocationCityRow = { slug: string; name: string; count: number };
type LocationStateRow = { code: string; name: string; count: number; cities: LocationCityRow[] };

const LOCATIONS_CACHE_TTL_MS = 60_000;
let locationsCache: { body: { states: LocationStateRow[] }; expiresAt: number } | null = null;

/** Test helper — bust in-memory locations cache after data mutations. */
export function clearSearchLocationsCache(): void {
  locationsCache = null;
}

/** Hierarchical state → city list derived from active public listings (query-driven, not static config). */
export async function searchLocationsHandler(request: ApiRequest, context: SearchRouteContext): Promise<ApiResponse> {
  try {
    if (request.method !== "GET") {
      return json(405, { error: "method_not_allowed" });
    }

    const now = Date.now();
    if (locationsCache && locationsCache.expiresAt > now) {
      return {
        statusCode: 200,
        headers: publicSearchCacheHeaders(),
        body: locationsCache.body,
      };
    }

    const rows = await context.prisma.provider.findMany({
      where: {
        status: "active",
        location_state: { not: null },
        location_city: { not: null },
        NOT: { location_city: { equals: "Statewide", mode: "insensitive" } },
      },
      select: { location_state: true, location_city: true },
    });

    const stateMap = new Map<string, { name: string; count: number; cities: Map<string, LocationCityRow> }>();

    for (const row of rows as Array<{ location_state: string | null; location_city: string | null }>) {
      const rawState = String(row.location_state || "").trim();
      const rawCity = String(row.location_city || "").trim();
      if (!rawState || !rawCity) continue;

      const code = resolveStateAbbrev(rawState);
      if (!code || !isValidUsStateAbbrev(code)) continue;
      if (rawCity.length > 80 || /https?:\/\//i.test(rawCity)) continue;

      const stateName = stateDisplayName(code);
      const citySlug = slugify(rawCity);
      const cityName = rawCity;

      const stateEntry = stateMap.get(code) ?? { name: stateName, count: 0, cities: new Map<string, LocationCityRow>() };
      stateEntry.count += 1;

      const cityEntry = stateEntry.cities.get(citySlug) ?? { slug: citySlug, name: cityName, count: 0 };
      cityEntry.count += 1;
      stateEntry.cities.set(citySlug, cityEntry);
      stateMap.set(code, stateEntry);
    }

    const states: LocationStateRow[] = Array.from(stateMap.entries())
      .map(([code, entry]) => ({
        code,
        name: entry.name,
        count: entry.count,
        cities: Array.from(entry.cities.values()).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const body = { states };
    locationsCache = { body, expiresAt: now + LOCATIONS_CACHE_TTL_MS };

    return {
      statusCode: 200,
      headers: publicSearchCacheHeaders(),
      body,
    };
  } catch {
    return json(500, { error: "internal_error" });
  }
}

export async function searchModelsHandler(request: ApiRequest, context: SearchRouteContext): Promise<ApiResponse> {
  try {
    const query = searchModelsQuerySchema.parse({
      city: request.query.get("city") ?? undefined,
      verified: request.query.get("verified") ?? undefined,
      tag: request.query.get("tag") ?? undefined,
      available_from: request.query.get("available_from") ?? undefined,
      available_to: request.query.get("available_to") ?? undefined,
      page: request.query.get("page") ?? undefined,
      limit: request.query.get("limit") ?? undefined,
    });

    const filters = buildSearchModelFilters(query);
    const testFilter = {
      NOT: {
        OR: [
          { displayName: { contains: "batch", mode: "insensitive" } },
          { displayName: { contains: "user", mode: "insensitive" } },
          { displayName: { contains: "simulation", mode: "insensitive" } },
          { displayName: { contains: "test", mode: "insensitive" } },
          { displayName: { contains: "approval", mode: "insensitive" } },
          { displayName: { contains: "concurrency", mode: "insensitive" } },
          { bio: { contains: "simulation", mode: "insensitive" } },
          { bio: { contains: "test", mode: "insensitive" } },
          { bio: { contains: "mixed live-site", mode: "insensitive" } },
          { bio: { contains: "simultaneous approval", mode: "insensitive" } },
          { bio: { contains: "concurrency", mode: "insensitive" } },
          { bio: { contains: "created during", mode: "insensitive" } },
        ],
      },
    };
    const where = { AND: [filters.where, testFilter] };

    const [profiles, total] = await context.prisma.$transaction([
      context.prisma.providerProfile.findMany({
        where,
        include: {
          tags: {
            include: { tag: true },
          },
          availabilityBlocks: {
            where: {
              isAvailable: true,
              startsAt: { gte: new Date() },
            },
            orderBy: [{ startsAt: "asc" }],
            take: 1,
          },
        },
        skip: filters.skip,
        take: filters.take,
        orderBy: [{ isVerified: "desc" }, { updatedAt: "desc" }],
      }),
      context.prisma.providerProfile.count({ where }),
    ]);

    return json(200, {
      page: query.page,
      limit: query.limit,
      total,
      items: profiles.map(searchPayload),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return json(400, {
        error: "validation_error",
        issues: formatValidationErrors(error),
      });
    }

    return json(500, { error: "internal_error" });
  }
}
