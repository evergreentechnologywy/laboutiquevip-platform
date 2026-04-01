import type { ApiRequest, ApiResponse } from "../types.js";
import { ZodError, z } from "zod";
import { formatValidationErrors, searchModelsQuerySchema } from "../validation/models.js";
import { buildSearchModelFilters } from "./searchFilters.js";
import { publicProviderVisibilityWhere, publicSearchCacheHeaders } from "./providerVisibility.js";

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
      ) city_pool
      WHERE lower(city) LIKE ${partial}
         OR lower(city_slug) LIKE ${prefix}
      ORDER BY city ASC
      LIMIT 25
    `;

    return json(200, {
      query: query.q,
      items: (rows as Array<{ city: string; city_slug: string }>).map((row) => ({
        slug: row.city_slug,
        displayName: row.city,
      })),
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

    if (query.q) {
      andFilters.push({
        OR: [
          { display_name: { contains: query.q, mode: "insensitive" } },
          { bio: { contains: query.q, mode: "insensitive" } },
          { tagline: { contains: query.q, mode: "insensitive" } },
        ],
      });
    }

    if (query.location) {
      andFilters.push({
        OR: [
          { location_city: { equals: query.location, mode: "insensitive" } },
          { location_city: { startsWith: query.location, mode: "insensitive" } },
          { location_state: { equals: query.location, mode: "insensitive" } },
          { location_state: { startsWith: query.location, mode: "insensitive" } },
        ],
      });
    }

    if (query.verified) andFilters.push({ is_verified: true });
    if (query.premium) andFilters.push({ is_premium: true });
    andFilters.push({ OR: [{ rate_hourly: null }, { rate_hourly: { gte: query.minPrice, lte: query.maxPrice } }] });

    const where = { AND: andFilters };
    const orderBy =
      query.sort === "rating" ? [{ rating_average: "desc" }, { created_date: "desc" }] :
      query.sort === "price_low" ? [{ rate_hourly: "asc" }, { created_date: "desc" }] :
      query.sort === "price_high" ? [{ rate_hourly: "desc" }, { created_date: "desc" }] :
      [{ created_date: "desc" }];

    const skip = (query.page - 1) * query.limit;

    const [providers, total] = await context.prisma.$transaction([
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
          verification_provider: true,
          verification_username: true,
          verification_url: true,
          review_provider: true,
          review_username: true,
          review_url: true,
          photos: true,
          is_premium: true,
          is_verified: true,
          views_count: true,
          rating_average: true,
          reviews_count: true,
          rate_hourly: true,
          created_date: true,
          updated_date: true,
        },
      }),
      context.prisma.provider.count({ where }),
    ]);

    const cityGroups = (Array.from(
      providers.reduce((map: Map<string, { city: string; state: string; count: number }>, provider: any) => {
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
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      cityGroups,
      items: providers,
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

    const [profiles, total] = await context.prisma.$transaction([
      context.prisma.providerProfile.findMany({
        where: filters.where,
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
      context.prisma.providerProfile.count({ where: filters.where }),
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
