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
  stateDisplayName,
  canonicalizePublicCity,
  isPlausiblePublicCityName,
} from "../lib/locationMatch.js";
import { dedupeProviders } from "../lib/providerDedupe.js";
import { withPublicPhotos } from "../lib/publicPhotoUrls.js";

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
  /** Alias for location (deep links / external clients). */
  city: z.string().trim().max(120).optional().default(""),
  verified: z.coerce.boolean().optional().default(false),
  premium: z.coerce.boolean().optional().default(false),
  minPrice: z.coerce.number().min(0).max(100000).optional().default(0),
  maxPrice: z.coerce.number().min(0).max(100000).optional().default(2000),
  ethnicity: z.string().trim().min(1).max(60).optional(),
  ageMin: z.coerce.number().int().min(18).max(100).optional(),
  ageMax: z.coerce.number().int().min(18).max(100).optional(),
  hasReviews: z.coerce.boolean().optional().default(false),
  sort: z.enum(["newest", "rating", "reviews", "price_low", "price_high"]).optional().default("newest"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(60),
});

/** Phone-shaped queries: "+1 (555) 123-4567", "555.123.4567", "5551234567" etc. */
const PHONE_QUERY_PATTERN = /^[+()\-\.\s\d]{7,}$/;

/**
 * Match provider.phone by digit substring, ignoring stored formatting.
 * Returns null on transient DB error so the caller can fall back to a
 * plain Prisma contains filter.
 */
async function findPhoneMatchProviderIds(prisma: any, digits: string): Promise<string[] | null> {
  try {
    const like = `%${digits}%`;
    const rows = (await prisma.$queryRaw`
      SELECT id FROM "Provider"
      WHERE phone IS NOT NULL
        AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${like}
      LIMIT 500
    `) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  } catch (err) {
    console.warn("[search] Phone match query failed, falling back to contains:", (err as Error).message);
    return null;
  }
}

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

    // City names only — do not UNION state codes or "City, ST" combos (those created duplicate/junk autocomplete hits).
    const rows = await context.prisma.$queryRaw`
      SELECT DISTINCT city, city_slug
      FROM (
        SELECT city, city_slug FROM provider_profiles WHERE city IS NOT NULL
        UNION ALL
        SELECT city, city_slug FROM provider_availability_blocks WHERE city IS NOT NULL
        UNION ALL
        SELECT city, city_slug FROM provider_tours WHERE city IS NOT NULL
        UNION ALL
        SELECT location_city as city,
               lower(regexp_replace(location_city, '[^a-zA-Z0-9]+', '-', 'g')) as city_slug
          FROM "Provider"
         WHERE location_city IS NOT NULL
           AND status = 'active'
           AND is_profile_approved = true
           AND verification_provider IN ('eros', 'evergreen', 'tryst')
      ) city_pool
      WHERE lower(city) LIKE ${partial}
         OR lower(city_slug) LIKE ${prefix}
         OR lower(city_slug) LIKE ${partial}
      ORDER BY city ASC
      LIMIT 40
    `;

    const staticSuggestions = suggestLocationQueries(query.q);
    const fromDb = (rows as Array<{ city: string; city_slug: string }>)
      .map((row) => {
        const canonical = canonicalizePublicCity(String(row.city || ""));
        if (!canonical) return null;
        return { slug: canonical.slug, displayName: canonical.name };
      })
      .filter((row): row is { slug: string; displayName: string } => Boolean(row));

    const merged = [...staticSuggestions, ...fromDb];

    return json(200, {
      query: query.q,
      items: merged
        .filter((row) => row.displayName.length > 1 && isPlausiblePublicCityName(row.displayName))
        .filter((row, index, all) => all.findIndex((item) => item.slug === row.slug || item.displayName.toLowerCase() === row.displayName.toLowerCase()) === index)
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
      city: request.query.get("city") ?? undefined,
      verified: request.query.get("verified") ?? undefined,
      premium: request.query.get("premium") ?? undefined,
      minPrice: request.query.get("minPrice") ?? undefined,
      maxPrice: request.query.get("maxPrice") ?? undefined,
      sort: request.query.get("sort") ?? undefined,
      ethnicity: request.query.get("ethnicity") ?? undefined,
      ageMin: request.query.get("ageMin") ?? undefined,
      ageMax: request.query.get("ageMax") ?? undefined,
      hasReviews: request.query.get("hasReviews") ?? undefined,
      page: request.query.get("page") ?? undefined,
      limit: request.query.get("limit") ?? undefined,
    });

    const andFilters: any[] = [publicProviderVisibilityWhere()];
    andFilters.push(await buildPublicPhotoSearchFilter(context.prisma));

    if (query.q) {
          const orBranches: any[] = [];

          // Phone-shaped query: match phone digits first, then fall through to text fields.
          if (PHONE_QUERY_PATTERN.test(query.q)) {
            const digits = query.q.replace(/\D/g, "");
            if (digits.length >= 7) {
              const phoneIds = await findPhoneMatchProviderIds(context.prisma, digits);
              if (phoneIds) {
                orBranches.push(
                  phoneIds.length > 0
                    ? { id: { in: phoneIds } }
                    : { id: { in: ["__no_phone_match__"] } },
                );
              } else {
                orBranches.push({ phone: { contains: digits } });
              }
            }
          }

          orBranches.push(
            { display_name: { contains: query.q, mode: "insensitive" } },
            { bio: { contains: query.q, mode: "insensitive" } },
            { tagline: { contains: query.q, mode: "insensitive" } },
            { ad_headline: { contains: query.q, mode: "insensitive" } },
            { location_city: { contains: query.q, mode: "insensitive" } },
            { location_state: { contains: query.q, mode: "insensitive" } },
            { verification_username: { contains: query.q, mode: "insensitive" } },
            { review_username: { contains: query.q, mode: "insensitive" } },
          );

          andFilters.push({ OR: orBranches });
        }

    const locationQuery = (query.location || query.city || "").trim();
    if (locationQuery) {
      const locationFilter = buildLocationFilter(locationQuery);
      if (locationFilter) andFilters.push(locationFilter);
    }

    if (query.verified) andFilters.push({ is_verified: true });
    if (query.premium) {
      andFilters.push({
        OR: [{ is_premium: true }, { ad_package: "elite" }],
      });
    }
    if (query.ethnicity) {
      andFilters.push({ ethnicity: { equals: query.ethnicity, mode: "insensitive" } });
    }
    if (query.ageMin !== undefined || query.ageMax !== undefined) {
      const ageFilter: Record<string, number> = {};
      if (query.ageMin !== undefined) ageFilter.gte = query.ageMin;
      if (query.ageMax !== undefined) ageFilter.lte = query.ageMax;
      andFilters.push({ age: ageFilter });
    }
    if (query.hasReviews) {
      andFilters.push({
        OR: [{ reviews_count: { gt: 0 } }, { review_site_count: { gt: 0 } }],
      });
    }
    andFilters.push({ OR: [{ rate_hourly: null }, { rate_hourly: { gte: query.minPrice, lte: query.maxPrice } }] });

    const where = { AND: andFilters };
    const orderBy =
      query.sort === "rating" ? [{ is_premium: "desc" }, { rating_average: "desc" }, { created_date: "desc" }] :
      query.sort === "reviews" ? [{ is_premium: "desc" }, { reviews_count: "desc" }, { review_site_count: "desc" }, { created_date: "desc" }] :
      query.sort === "price_low" ? [{ is_premium: "desc" }, { rate_hourly: "asc" }, { created_date: "desc" }] :
      query.sort === "price_high" ? [{ is_premium: "desc" }, { rate_hourly: "desc" }, { created_date: "desc" }] :
      query.q ? [{ is_premium: "desc" }, { reviews_count: "desc" }, { created_date: "desc" }] :
      [{ is_premium: "desc" }, { created_date: "desc" }];

    const skip = (query.page - 1) * query.limit;
    // Over-fetch so in-memory dedupe can still fill a full page when near-duplicates share a page.
    const fetchTake = Math.min(100, Math.max(query.limit * 3, query.limit + 20));

    const [providers, total, aggregate] = await context.prisma.$transaction([
      context.prisma.provider.findMany({
        where,
        orderBy,
        skip,
        take: fetchTake,
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
          review_site_rating: true,
          review_site_count: true,
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

    const photoQuality = (provider: any): number => {
          const photos = Array.isArray(provider?.photos) ? provider.photos : [];
          let score = 0;
          for (const raw of photos) {
            const url = typeof raw === "string" ? raw : String((raw as any)?.url || "");
            if (!url) continue;
            if (url.includes("/api/r2-photo/")) score += 12;
            else if (/eros\.com\/(?:i|profile)\//i.test(url)) score += 6;
            else if (/media-v\d*\.tryst\.|tryst\.a4cdn\.org/i.test(url) && !/sharks_512|packs\/static/i.test(url)) score += 4;
            else if (/\.(jpe?g|png|webp|avif)(\?|$)/i.test(url)) score += 2;
          }
          return Math.min(score, 120) + Math.min(photos.length, 12);
        };

        // Prefer premium, then photo quality, then requested sort signal within the page window.
        const normalizedQuery = query.q.trim().toLowerCase();
        const dedupedProviders = dedupeProviders(providers)
          .sort((a: any, b: any) => {
            const prem = Number(Boolean(b.is_premium)) - Number(Boolean(a.is_premium));
            if (prem !== 0) return prem;
            // Exact display_name match boost when a text query is present.
            if (normalizedQuery) {
              const aExact = String(a.display_name || "").trim().toLowerCase() === normalizedQuery ? 1 : 0;
              const bExact = String(b.display_name || "").trim().toLowerCase() === normalizedQuery ? 1 : 0;
              if (aExact !== bExact) return bExact - aExact;
            }
            const photo = photoQuality(b) - photoQuality(a);
            if (photo !== 0) return photo;
            if (query.sort === "rating") {
              return Number(b.rating_average || 0) - Number(a.rating_average || 0);
            }
            if (query.sort === "reviews") {
              return (
                (Number(b.reviews_count || 0) + Number(b.review_site_count || 0)) -
                (Number(a.reviews_count || 0) + Number(a.review_site_count || 0))
              );
            }
            if (query.sort === "price_low") {
              return Number(a.rate_hourly ?? 1e9) - Number(b.rate_hourly ?? 1e9);
            }
            if (query.sort === "price_high") {
              return Number(b.rate_hourly ?? 0) - Number(a.rate_hourly ?? 0);
            }
            // Relevance-flavored default for text queries: most-reviewed first.
            if (normalizedQuery) {
              const reviews = Number(b.reviews_count || 0) - Number(a.reviews_count || 0);
              if (reviews !== 0) return reviews;
            }
            return new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime();
          })
          .slice(0, query.limit);
        const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / query.limit));
        const hasMore = query.page < totalPages;

        // State-first city chips from FULL inventory for this query (not just current page).
        const locationRows = await context.prisma.provider.findMany({
          where,
          select: { location_city: true, location_state: true },
        });
        const cityCountMap = locationRows.reduce(
          (map: Map<string, { city: string; state: string; slug: string; count: number }>, provider: any) => {
            const rawState = String(provider.location_state || "").trim();
            const stateCode = resolveStateAbbrev(rawState) || "";
            const canonical = canonicalizePublicCity(String(provider.location_city || ""), stateCode);
            if (!canonical) return map;
            const key = `${canonical.slug}||${stateCode || ""}`;
            const current = map.get(key) ?? {
              city: canonical.name,
              state: stateCode || "",
              slug: canonical.slug,
              count: 0,
            };
            current.count += 1;
            map.set(key, current);
            return map;
          },
          new Map<string, { city: string; state: string; slug: string; count: number }>(),
        );
        const rankedCities = (Array.from(cityCountMap.values()) as Array<{
          city: string;
          state: string;
          slug: string;
          count: number;
        }>).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
        const MIN_TOP = 5;
        const MAX_TOP = 12;
        let take = Math.min(MIN_TOP, rankedCities.length);
        while (
          take < rankedCities.length &&
          take < MAX_TOP &&
          rankedCities[take].count >= 2
        ) {
          take += 1;
        }
        if (rankedCities.length <= MIN_TOP + 2) take = rankedCities.length;
        const cityGroups = rankedCities.slice(0, take);

        return {
          statusCode: 200,
          headers: publicSearchCacheHeaders(),
          body: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages,
          hasMore,
          nextOffset: hasMore ? query.page * query.limit : null,
          maxRate,
          cityGroups,
          // Search cards only need a tight gallery; full sets load on profile.
          items: dedupedProviders.map((provider: any) => withPublicPhotos(provider, 8)),
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

      const canonical = canonicalizePublicCity(rawCity, code);
      if (!canonical) continue;

      const stateName = stateDisplayName(code);
      const citySlug = canonical.slug;
      const cityName = canonical.name;

      const stateEntry = stateMap.get(code) ?? { name: stateName, count: 0, cities: new Map<string, LocationCityRow>() };
      stateEntry.count += 1;

      const cityEntry = stateEntry.cities.get(citySlug) ?? { slug: citySlug, name: cityName, count: 0 };
      // Prefer the shorter/cleaner display name when merging slug collisions
      if (cityName.length < cityEntry.name.length) cityEntry.name = cityName;
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
