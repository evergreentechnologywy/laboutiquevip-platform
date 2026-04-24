import type { ApiRequest, ApiResponse } from "../types.js";
import {
  generateCityHubRoutes,
  generateProfileRoutes,
  generateSitemapXml,
} from "../services/seo.js";

interface SeoContext {
  prisma: any;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

export async function seoCityHubsHandler(_request: ApiRequest, context: SeoContext): Promise<ApiResponse> {
  const rows = await context.prisma.$queryRaw`
    SELECT
      city,
      city_slug,
      COUNT(*)::int AS profile_count,
      SUM(CASE WHEN is_verified = true THEN 1 ELSE 0 END)::int AS verified_count,
      MAX(updated_at) AS last_updated_at
    FROM provider_profiles
    WHERE is_published = true
      AND display_name !~* '(batch|user|simulation|test|approval|concurrency)'
      AND (bio IS NULL OR bio !~* '(simulation|test|mixed live-site|simultaneous approval|concurrency|created during)')
    GROUP BY city, city_slug
    ORDER BY city ASC
  `;

  const routes = generateCityHubRoutes(
    (rows as Array<any>).map((row) => ({
      city: row.city,
      citySlug: row.city_slug,
      profileCount: Number(row.profile_count ?? 0),
      verifiedCount: Number(row.verified_count ?? 0),
      lastUpdatedAt: row.last_updated_at ? new Date(row.last_updated_at) : new Date(),
    })),
  );

  return json(200, { items: routes });
}

export async function seoProfilesHandler(request: ApiRequest, context: SeoContext): Promise<ApiResponse> {
  const limit = Math.min(1000, Number(request.query.get("limit") ?? 500));
  const profiles = await context.prisma.providerProfile.findMany({
    where: {
      isPublished: true,
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
    },
    select: { slug: true, citySlug: true, updatedAt: true },
    orderBy: [{ updatedAt: "desc" }],
    take: Number.isFinite(limit) && limit > 0 ? limit : 500,
  });

  return json(200, {
    items: generateProfileRoutes(profiles),
  });
}

export async function sitemapHandler(request: ApiRequest, context: SeoContext): Promise<ApiResponse> {
  const cityResponse = await seoCityHubsHandler(request, context);
  const profileResponse = await seoProfilesHandler(request, context);
  const cityRoutes = ((cityResponse.body as any)?.items ?? []) as Array<Record<string, unknown>>;
  const profileRoutes = ((profileResponse.body as any)?.items ?? []) as Array<Record<string, unknown>>;

  const xml = generateSitemapXml(cityRoutes, profileRoutes);
  return {
    statusCode: 200,
    headers: { "content-type": "application/xml; charset=utf-8" },
    rawBody: xml,
  };
}

export async function robotsHandler(): Promise<ApiResponse> {
  const robots = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /admin/",
    "Disallow: /viewprofile*",
    "",
    "Sitemap: https://www.laboutiquevip.net/sitemap.xml",
  ].join("\n");

  return {
    statusCode: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
    rawBody: robots,
  };
}
