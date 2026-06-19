import type { ApiRequest, ApiResponse } from "../types.js";
import {
  generateCityHubRoutes,
  generateProfileRoutes,
  generateSitemapXml,
} from "../services/seo.js";
import { publicProviderVisibilityWhere } from "./providerVisibility.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapProviderProfileToLegacyProvider(profile: Record<string, unknown>): Record<string, unknown> {
  const rates = (profile.rates ?? {}) as Record<string, unknown>;
  const contact = (profile.contactPreferences ?? {}) as Record<string, unknown>;
  const services = Array.isArray(profile.services) ? profile.services : [];

  return {
    id: profile.id,
    user_id: profile.userId,
    display_name: profile.displayName,
    tagline: null,
    bio: profile.bio,
    location_city: profile.city,
    location_state: null,
    location_country: null,
    phone: contact.phone ?? null,
    email: contact.email ?? null,
    photos: [],
    services_offered: services,
    is_premium: false,
    is_verified: profile.isVerified,
    views_count: 0,
    rating_average: 0,
    reviews_count: 0,
    rate_hourly: rates.hourly ?? null,
    rate_two_hours: rates.twoHours ?? rates.two_hours ?? null,
    rate_overnight: rates.overnight ?? null,
    created_date: profile.createdAt,
    updated_date: profile.updatedAt,
  };
}

interface SeoContext {
  prisma: any;
}

function json(statusCode: number, body: unknown): ApiResponse {
  return { statusCode, body };
}

export async function seoCityHubsHandler(_request: ApiRequest, context: SeoContext): Promise<ApiResponse> {
  // Query both new model profiles AND legacy Provider table
  const rows = await context.prisma.$queryRaw`
    SELECT city, city_slug, SUM(profile_count)::int AS profile_count, SUM(verified_count)::int AS verified_count, MAX(last_updated_at) AS last_updated_at
    FROM (
      SELECT
        city,
        city_slug,
        COUNT(*)::int AS profile_count,
        SUM(CASE WHEN is_verified = true THEN 1 ELSE 0 END)::int AS verified_count,
        MAX(updated_at) AS last_updated_at
      FROM provider_profiles
      WHERE is_published = true
        AND display_name !~* ${'(batch|user|simulation|test|approval|concurrency)'}
        AND (bio IS NULL OR bio !~* ${'(simulation|test|mixed live-site|simultaneous approval|concurrency|created during)'})
      GROUP BY city, city_slug

      UNION ALL

      SELECT
        location_city AS city,
        lower(regexp_replace(location_city, ${'[^a-zA-Z0-9]+'}, ${'-'}, ${'g'})) AS city_slug,
        COUNT(*)::int AS profile_count,
        SUM(CASE WHEN is_verified = true THEN 1 ELSE 0 END)::int AS verified_count,
        MAX(updated_date) AS last_updated_at
      FROM "Provider"
      WHERE status = ${'active'}
        AND is_profile_approved = true
        AND location_city IS NOT NULL
        AND display_name !~* ${'(batch|user|simulation|test|approval|concurrency)'}
        AND (bio IS NULL OR bio !~* ${'(simulation|test|mixed live-site|simultaneous approval|concurrency|created during)'})
      GROUP BY location_city
    ) combined
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

  // Get profiles from both systems
  const newProfiles = await context.prisma.providerProfile.findMany({
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
    take: limit,
  });

  // Get legacy Provider profiles
  const legacyProviders = await context.prisma.provider.findMany({
    where: {
      status: "active",
      is_profile_approved: true,
      NOT: {
        OR: [
          { display_name: { contains: "batch", mode: "insensitive" } },
          { display_name: { contains: "user", mode: "insensitive" } },
          { display_name: { contains: "simulation", mode: "insensitive" } },
          { display_name: { contains: "test", mode: "insensitive" } },
          { display_name: { contains: "approval", mode: "insensitive" } },
          { display_name: { contains: "concurrency", mode: "insensitive" } },
        ],
      },
    },
    select: { id: true, location_city: true, updated_date: true },
    orderBy: [{ updated_date: "desc" }],
    take: limit,
  });

  const profileRoutes = [
    ...generateProfileRoutes(newProfiles.map((p: any) => ({
      slug: p.slug,
      citySlug: p.citySlug,
      updatedAt: p.updatedAt,
    }))),
    ...generateProfileRoutes(legacyProviders.map((p: any) => ({
      slug: p.id,
      citySlug: (p.location_city || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      updatedAt: p.updated_date,
    }))),
  ].slice(0, limit);

  return json(200, { items: profileRoutes });
}

export async function seoProfileBySlugHandler(request: ApiRequest, context: SeoContext): Promise<ApiResponse> {
  const matched = request.pathname.match(/^\/api\/v1\/seo\/profile\/([^/]+)$/);
  const slug = matched?.[1] ? decodeURIComponent(matched[1]) : "";
  if (!slug) {
    return json(404, { error: "not_found" });
  }

  const visibilityWhere = publicProviderVisibilityWhere();

  if (UUID_REGEX.test(slug)) {
    const legacyById = await context.prisma.provider.findFirst({
      where: { id: slug, ...visibilityWhere },
    });
    if (legacyById) {
      return json(200, { provider: legacyById });
    }
  }

  const profile = await context.prisma.providerProfile.findFirst({
    where: { slug, isPublished: true },
  });

  if (profile) {
    const linked = await context.prisma.provider.findFirst({
      where: { user_id: profile.userId, ...visibilityWhere },
    });
    if (linked) {
      return json(200, { provider: linked });
    }
    return json(200, { provider: mapProviderProfileToLegacyProvider(profile) });
  }

  const legacy = await context.prisma.provider.findFirst({
    where: { id: slug, ...visibilityWhere },
  });
  if (legacy) {
    return json(200, { provider: legacy });
  }

  return json(404, { error: "not_found" });
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
