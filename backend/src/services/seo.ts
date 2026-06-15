export interface SeoCityHubRecord {
  city: string;
  citySlug: string;
  profileCount: number;
  verifiedCount: number;
  lastUpdatedAt: Date;
}

export interface SeoProfileRecord {
  slug: string;
  citySlug: string;
  updatedAt: Date;
}

const BASE_URL = process.env.PUBLIC_BASE_URL ?? "https://example.com";

export const STATIC_SITEMAP_PATHS = [
  "/",
  "/Browse",
  "/Pricing",
  "/Trust",
  "/FAQ",
  "/Terms",
  "/Privacy",
  "/Contact",
];

export function cityHubPath(citySlug: string): string {
  return `/Browse?location=${encodeURIComponent(citySlug)}`;
}

export function profilePath(slug: string): string {
  return `/ViewProfile?id=${encodeURIComponent(slug)}`;
}

export function generateCityHubRoutes(records: SeoCityHubRecord[]): Array<Record<string, unknown>> {
  return records.map((record) => ({
    city: record.city,
    citySlug: record.citySlug,
    path: cityHubPath(record.citySlug),
    profileCount: record.profileCount,
    verifiedCount: record.verifiedCount,
    lastModified: record.lastUpdatedAt.toISOString(),
  }));
}

export function generateProfileRoutes(records: SeoProfileRecord[]): Array<Record<string, unknown>> {
  return records.map((record) => ({
    slug: record.slug,
    citySlug: record.citySlug,
    path: profilePath(record.slug),
    lastModified: record.updatedAt.toISOString(),
  }));
}

export function generateSitemapXml(
  cityRoutes: Array<Record<string, unknown>>,
  profileRoutes: Array<Record<string, unknown>>,
): string {
  const staticUrls = STATIC_SITEMAP_PATHS.map((path) => ({
    path,
    lastModified: new Date().toISOString(),
  }));
  const urls = [...staticUrls, ...cityRoutes, ...profileRoutes];
  const xmlRows = urls.map((entry) => {
    const path = String(entry.path ?? "/");
    const lastModified = String(entry.lastModified ?? new Date().toISOString());
    return `<url><loc>${BASE_URL}${path}</loc><lastmod>${lastModified}</lastmod></url>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...xmlRows,
    "</urlset>",
  ].join("");
}

