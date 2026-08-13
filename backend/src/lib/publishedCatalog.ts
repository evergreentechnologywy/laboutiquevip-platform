import {
  canonicalizePublicCity,
  isValidUsStateAbbrev,
  resolveStateAbbrev,
  slugify,
  stateDisplayName,
} from "./locationMatch.js";
import { legacyProviderSlug } from "./providerSlug.js";
import {
  buildPublicPhotoSearchFilter,
  getPublicPhotoProviderIds,
  publicProviderVisibilityWhere,
} from "../routes/providerVisibility.js";

const CATALOG_CACHE_TTL_MS = 60_000;

export interface PublishedCityRecord {
  slug: string;
  name: string;
  stateCode: string;
  stateName: string;
  providerCount: number;
  verifiedCount: number;
  lastUpdatedAt: Date;
}

export interface PublishedProfileRecord {
  slug: string;
  displayName: string;
  citySlug: string;
  cityName: string;
  stateCode: string;
  updatedAt: Date;
}

export interface PublishedCatalogStats {
  providers: number;
  cities: number;
  states: number;
  photos: number;
}

export interface PublishedCatalog {
  cities: PublishedCityRecord[];
  profiles: PublishedProfileRecord[];
  stats: PublishedCatalogStats;
  citySlugSet: Set<string>;
  profileSlugSet: Set<string>;
  loadedAt: Date;
}

interface ProviderRow {
  id: string;
  display_name: string | null;
  location_city: string | null;
  location_state: string | null;
  is_verified: boolean | null;
  updated_date: Date | string | null;
}

interface ModelProfileRow {
  slug: string;
  displayName: string;
  city: string;
  citySlug: string;
  isVerified: boolean;
  updatedAt: Date;
}

let catalogCache: { catalog: PublishedCatalog; expiresAt: number } | null = null;

/** Test helper — bust in-memory published catalog cache after data mutations. */
export function clearPublishedCatalogCache(): void {
  catalogCache = null;
}

function toDate(value: Date | string | null | undefined): Date {
  if (value instanceof Date) return value;
  if (value) return new Date(value);
  return new Date();
}

function isTestLikeProfileName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("batch") ||
    lower.includes("simulation") ||
    lower.includes("concurrency") ||
    lower.includes("approval") ||
    lower.startsWith("test ") ||
    lower.endsWith(" test") ||
    lower === "test"
  );
}

async function loadProviderRows(prisma: any): Promise<ProviderRow[]> {
  const where = {
    AND: [publicProviderVisibilityWhere(), await buildPublicPhotoSearchFilter(prisma)],
  };
  return prisma.provider.findMany({
    where,
    select: {
      id: true,
      display_name: true,
      location_city: true,
      location_state: true,
      is_verified: true,
      updated_date: true,
      verification_username: true,
      verification_url: true,
    },
  }) as Promise<ProviderRow[]>;
}

async function loadModelProfileRows(prisma: any): Promise<ModelProfileRow[]> {
  try {
    const rows = await prisma.providerProfile.findMany({
      where: {
        isPublished: true,
        NOT: {
          OR: [
            { displayName: { contains: "batch", mode: "insensitive" } },
            { displayName: { contains: "simulation", mode: "insensitive" } },
            { displayName: { contains: "test", mode: "insensitive" } },
            { bio: { contains: "simulation", mode: "insensitive" } },
            { bio: { contains: "test", mode: "insensitive" } },
          ],
        },
      },
      select: {
        slug: true,
        displayName: true,
        city: true,
        citySlug: true,
        isVerified: true,
        updatedAt: true,
      },
    });
    return rows as ModelProfileRow[];
  } catch {
    return [];
  }
}

export function buildCatalogFromRows(
  providerRows: ProviderRow[],
  modelRows: ModelProfileRow[],
  photos: number,
): PublishedCatalog {
  const cityMap = new Map<string, PublishedCityRecord>();
  const profiles: PublishedProfileRecord[] = [];
  const profileSlugSet = new Set<string>();
  const citySlugSet = new Set<string>();
  const stateCodes = new Set<string>();

  for (const row of providerRows) {
    if (isTestLikeProfileName(String(row.display_name || ""))) continue;

    const slug = legacyProviderSlug(row as Parameters<typeof legacyProviderSlug>[0]);
    const stateCode = resolveStateAbbrev(String(row.location_state || "").trim());
    const canonical = stateCode
      ? canonicalizePublicCity(String(row.location_city || "").trim(), stateCode)
      : null;
    const updatedAt = toDate(row.updated_date);

    profiles.push({
      slug,
      displayName: String(row.display_name || slug),
      citySlug: canonical?.slug ?? slugify(String(row.location_city || "")),
      cityName: canonical?.name ?? String(row.location_city || "").trim(),
      stateCode: stateCode ?? "",
      updatedAt,
    });
    profileSlugSet.add(slug);

    if (!stateCode || !isValidUsStateAbbrev(stateCode) || !canonical) continue;

    stateCodes.add(stateCode);
    citySlugSet.add(canonical.slug);

    const key = `${stateCode}:${canonical.slug}`;
    const existing = cityMap.get(key);
    if (existing) {
      existing.providerCount += 1;
      if (row.is_verified) existing.verifiedCount += 1;
      if (updatedAt > existing.lastUpdatedAt) existing.lastUpdatedAt = updatedAt;
      if (canonical.name.length < existing.name.length) existing.name = canonical.name;
    } else {
      cityMap.set(key, {
        slug: canonical.slug,
        name: canonical.name,
        stateCode,
        stateName: stateDisplayName(stateCode),
        providerCount: 1,
        verifiedCount: row.is_verified ? 1 : 0,
        lastUpdatedAt: updatedAt,
      });
    }
  }

  for (const row of modelRows) {
    if (isTestLikeProfileName(row.displayName)) continue;

    const slug = String(row.slug || "").trim().toLowerCase();
    if (!slug) continue;

    const stateCode = resolveStateAbbrev(row.city) ?? "";
    const canonical = canonicalizePublicCity(row.city, stateCode || undefined);
    const updatedAt = toDate(row.updatedAt);

    if (!profileSlugSet.has(slug)) {
      profiles.push({
        slug,
        displayName: row.displayName,
        citySlug: canonical?.slug ?? row.citySlug,
        cityName: canonical?.name ?? row.city,
        stateCode,
        updatedAt,
      });
      profileSlugSet.add(slug);
    }

    if (canonical && stateCode && isValidUsStateAbbrev(stateCode)) {
      stateCodes.add(stateCode);
      citySlugSet.add(canonical.slug);
      const key = `${stateCode}:${canonical.slug}`;
      const existing = cityMap.get(key);
      if (existing) {
        existing.providerCount += 1;
        if (row.isVerified) existing.verifiedCount += 1;
        if (updatedAt > existing.lastUpdatedAt) existing.lastUpdatedAt = updatedAt;
      } else {
        cityMap.set(key, {
          slug: canonical.slug,
          name: canonical.name,
          stateCode,
          stateName: stateDisplayName(stateCode),
          providerCount: 1,
          verifiedCount: row.isVerified ? 1 : 0,
          lastUpdatedAt: updatedAt,
        });
      }
    }
  }

  const cities = Array.from(cityMap.values()).sort(
    (a, b) => a.name.localeCompare(b.name) || a.stateCode.localeCompare(b.stateCode),
  );

  profiles.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const stats: PublishedCatalogStats = {
    providers: profiles.length,
    cities: cities.length,
    states: stateCodes.size,
    photos,
  };

  return {
    cities,
    profiles,
    stats,
    citySlugSet,
    profileSlugSet,
    loadedAt: new Date(),
  };
}

async function computePhotoTotal(prisma: any, providerRows: ProviderRow[]): Promise<number> {
  const photoIds = await getPublicPhotoProviderIds(prisma);
  const photoIdSet = photoIds ? new Set(photoIds) : null;
  const eligibleIds = photoIdSet
    ? providerRows.filter((row) => photoIdSet.has(row.id)).map((row) => row.id)
    : providerRows.map((row) => row.id);

  if (eligibleIds.length === 0) return 0;

  const sumRows = (await prisma.$queryRaw`
    SELECT COALESCE(SUM(jsonb_array_length(
      CASE WHEN jsonb_typeof(photos) = 'array' THEN photos ELSE '[]'::jsonb END
    )), 0)::bigint AS total
    FROM "Provider"
    WHERE id = ANY(${eligibleIds}::uuid[])
  `) as Array<{ total: bigint | number | string }>;

  return Number(sumRows[0]?.total ?? 0);
}

/** Load the published public catalog (cached ~60s). Single source for stats, sitemap, and SSR. */
export async function loadPublishedCatalog(prisma: any): Promise<PublishedCatalog> {
  const now = Date.now();
  if (catalogCache && catalogCache.expiresAt > now) {
    return catalogCache.catalog;
  }

  const providerRows = await loadProviderRows(prisma);
  const modelRows = await loadModelProfileRows(prisma);
  const photos = await computePhotoTotal(prisma, providerRows);
  const catalog = buildCatalogFromRows(providerRows, modelRows, photos);

  catalogCache = { catalog, expiresAt: now + CATALOG_CACHE_TTL_MS };
  return catalog;
}

/** Resolve redirect target when a slug was published under /city/ but is a profile slug. */
export function resolveLegacyCityListingRedirect(
  slug: string,
  catalog: PublishedCatalog,
): string | null {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized) return null;
  if (catalog.citySlugSet.has(normalized)) return null;
  if (catalog.profileSlugSet.has(normalized)) return `/profile/${encodeURIComponent(normalized)}`;
  return null;
}

export function findPublishedCity(slug: string, catalog: PublishedCatalog): PublishedCityRecord | null {
  const normalized = String(slug || "").trim().toLowerCase();
  return catalog.cities.find((city) => city.slug === normalized) ?? null;
}

export function findPublishedProfile(slug: string, catalog: PublishedCatalog): PublishedProfileRecord | null {
  const normalized = String(slug || "").trim().toLowerCase();
  return catalog.profiles.find((profile) => profile.slug === normalized) ?? null;
}

export function profilesForCity(
  citySlug: string,
  catalog: PublishedCatalog,
  limit = 50,
): PublishedProfileRecord[] {
  const normalized = String(citySlug || "").trim().toLowerCase();
  return catalog.profiles.filter((profile) => profile.citySlug === normalized).slice(0, limit);
}
