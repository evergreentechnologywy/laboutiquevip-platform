import type { ApiRequest, ApiResponse } from "../types.js";
import {
  generateCityHubRoutes,
  generateProfileRoutes,
  generateSitemapXml,
} from "../services/seo.js";
import { loadPublishedCatalog } from "../lib/publishedCatalog.js";
import { publicSearchCacheHeaders } from "./providerVisibility.js";

interface SeoContext {
  prisma: any;
}

function json(statusCode: number, body: unknown, headers?: Record<string, string>): ApiResponse {
  return { statusCode, headers, body };
}

export async function seoCityHubsHandler(_request: ApiRequest, context: SeoContext): Promise<ApiResponse> {
  const catalog = await loadPublishedCatalog(context.prisma);
  const routes = generateCityHubRoutes(
    catalog.cities.map((city) => ({
      city: city.name,
      citySlug: city.citySlug,
      stateCode: city.stateCode,
      profileCount: city.providerCount,
      verifiedCount: city.verifiedCount,
      lastUpdatedAt: city.lastUpdatedAt,
    })),
  );

  return json(200, { items: routes }, publicSearchCacheHeaders());
}

export async function seoProfilesHandler(_request: ApiRequest, context: SeoContext): Promise<ApiResponse> {
  const catalog = await loadPublishedCatalog(context.prisma);
  const profileRoutes = generateProfileRoutes(
    catalog.profiles.map((profile) => ({
      slug: profile.slug,
      citySlug: profile.citySlug,
      updatedAt: profile.updatedAt,
    })),
  );

  return json(200, { items: profileRoutes }, publicSearchCacheHeaders());
}

export async function sitemapHandler(_request: ApiRequest, context: SeoContext): Promise<ApiResponse> {
  const catalog = await loadPublishedCatalog(context.prisma);
  const cityRoutes = generateCityHubRoutes(
    catalog.cities.map((city) => ({
      city: city.name,
      citySlug: city.citySlug,
      stateCode: city.stateCode,
      profileCount: city.providerCount,
      verifiedCount: city.verifiedCount,
      lastUpdatedAt: city.lastUpdatedAt,
    })),
  );
  const profileRoutes = generateProfileRoutes(
    catalog.profiles.map((profile) => ({
      slug: profile.slug,
      citySlug: profile.citySlug,
      updatedAt: profile.updatedAt,
    })),
  );

  const xml = generateSitemapXml(cityRoutes, profileRoutes);
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      ...publicSearchCacheHeaders(),
    },
    rawBody: xml,
  };
}

export async function robotsHandler(): Promise<ApiResponse> {
  const robots = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /admin/",
    "Disallow: /devdashboard",
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
