import type { ApiRequest, ApiResponse } from "../types.js";
import { ZodError, z } from "zod";
import { formatValidationErrors, searchModelsQuerySchema } from "../validation/models.js";
import { buildSearchModelFilters } from "./searchFilters.js";

interface SearchRouteContext {
  prisma: any;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

const citySearchSchema = z.object({
  q: z.string().trim().min(1).max(80),
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
