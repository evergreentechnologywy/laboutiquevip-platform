import type { ApiRequest, ApiResponse } from "../types.js";
import {
  generateCityHubRoutes,
  generateProfileRoutes,
  generateSitemapXml,
} from "../services/seo.js";
import { legacyProviderSlug } from "../lib/providerSlug.js";
import { canonicalizePublicCity } from "../lib/locationMatch.js";
import { publicProviderVisibilityWhere } from "./providerVisibility.js";

interface SeoContext {
  prisma: any;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

export async function seoCityHubsHandler(_request: ApiRequest, context: SeoContext): Promise<ApiResponse> {
  // Public catalog only (Provider). Exclude signup/test provider_profiles noise.
  const rows = await context.prisma.$queryRaw`
    SELECT
      location_city AS city,
      lower(regexp_replace(location_city, ${'[^a-zA-Z0-9]+'}, ${'-'}, ${'g'})) AS city_slug,
      COUNT(*)::int AS profile_count,
      SUM(CASE WHEN is_verified = true THEN 1 ELSE 0 END)::int AS verified_count,
      MAX(updated_date) AS last_updated_at
    FROM "Provider"
    WHERE status = ${'active'}
      AND verification_provider = ANY(${['eros', 'evergreen', 'tryst']}::text[])
      AND location_city IS NOT NULL
      AND btrim(location_city) <> ''
      AND display_name !~* ${'(batch|simulation|test|approval|concurrency)'}
      AND (bio IS NULL OR bio !~* ${'(simulation|test|mixed live-site|simultaneous approval|concurrency|created during)'})
      AND photos IS NOT NULL
      AND CASE
        WHEN jsonb_typeof(photos) = 'array' THEN COALESCE(jsonb_array_length(photos), 0) > 0
        WHEN jsonb_typeof(photos) = 'object' AND jsonb_typeof(photos->'photoUrls') = 'array'
          THEN COALESCE(jsonb_array_length(photos->'photoUrls'), 0) > 0
        ELSE false
      END
    GROUP BY location_city
    ORDER BY location_city ASC
  `;

  // Collapse ad-title pollution ("Asian Beauty Chicago" → Chicago) and drop junk hubs.
  const cityMap = new Map<
    string,
    {
      city: string;
      citySlug: string;
      profileCount: number;
      verifiedCount: number;
      lastUpdatedAt: Date;
    }
  >();
  for (const row of rows as Array<any>) {
    const canonical = canonicalizePublicCity(String(row.city || ""));
    if (!canonical) continue;
    const prev = cityMap.get(canonical.slug);
    const lastUpdatedAt = row.last_updated_at ? new Date(row.last_updated_at) : new Date();
    if (!prev) {
      cityMap.set(canonical.slug, {
        city: canonical.name,
        citySlug: canonical.slug,
        profileCount: Number(row.profile_count ?? 0),
        verifiedCount: Number(row.verified_count ?? 0),
        lastUpdatedAt,
      });
      continue;
    }
    prev.profileCount += Number(row.profile_count ?? 0);
    prev.verifiedCount += Number(row.verified_count ?? 0);
    if (lastUpdatedAt > prev.lastUpdatedAt) prev.lastUpdatedAt = lastUpdatedAt;
  }

  const routes = generateCityHubRoutes(Array.from(cityMap.values()));

  return json(200, { items: routes });
}

export async function seoProfilesHandler(request: ApiRequest, context: SeoContext): Promise<ApiResponse> {
  // Catalog public profiles only. Cap high enough for full crawl coverage.
  const limit = Math.min(20000, Math.max(1, Number(request.query.get("limit") ?? 10000)));

  const legacyProviders = await context.prisma.provider.findMany({
    where: {
      ...publicProviderVisibilityWhere(),
      NOT: {
        OR: [
          { display_name: { contains: "batch", mode: "insensitive" } },
          { display_name: { contains: "simulation", mode: "insensitive" } },
          { display_name: { startsWith: "test ", mode: "insensitive" } },
          { display_name: { endsWith: " test", mode: "insensitive" } },
          { display_name: { equals: "test", mode: "insensitive" } },
          { display_name: { equals: "Page Not Found", mode: "insensitive" } },
          { display_name: { equals: "Not Found", mode: "insensitive" } },
          { display_name: { equals: "404", mode: "insensitive" } },
        ],
      },
    },
    select: {
      id: true,
      display_name: true,
      location_city: true,
      location_state: true,
      updated_date: true,
      verification_username: true,
      verification_url: true,
    },
    orderBy: [{ updated_date: "desc" }],
    take: limit,
  });

  // Prefer unique slugs; keep first (most recently updated).
  const seen = new Set<string>();
  const profileRoutes = generateProfileRoutes(
    legacyProviders
      .map((p: any) => {
        const canonical = canonicalizePublicCity(String(p.location_city || ""), String(p.location_state || ""));
        return {
          slug: legacyProviderSlug(p),
          citySlug: canonical?.slug || "unknown",
          updatedAt: p.updated_date,
        };
      })
      .filter((row: { slug: string }) => {
        if (!row.slug || seen.has(row.slug)) return false;
        seen.add(row.slug);
        return true;
      }),
  );

  return json(200, { items: profileRoutes });
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
