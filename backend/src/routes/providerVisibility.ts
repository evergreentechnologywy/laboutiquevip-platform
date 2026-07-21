import { publicVerificationBadgeWhere } from "../lib/verificationBadges.js";

/** Sources shown on public browse (import pipelines set verification_provider). */
export const PUBLIC_VERIFICATION_PROVIDERS = ["eros", "evergreen", "tryst"] as const;

const DEFAULT_PUBLIC_PROVIDER_NAME_BLOCKLIST = ["Jarvis Test Listing"];

function parseConfiguredBlockedNames(): string[] {
  const configured = process.env.PUBLIC_PROVIDER_NAME_BLOCKLIST
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set([...(configured ?? []), ...DEFAULT_PUBLIC_PROVIDER_NAME_BLOCKLIST]));
}

function nullableContains(field: string, value: string): Record<string, unknown> {
  return {
    AND: [{ [field]: { not: null } }, { [field]: { contains: value, mode: "insensitive" } }],
  };
}

function buildTestDataExclusion(): Record<string, unknown> {
  return {
    OR: [
      { display_name: { contains: "batch", mode: "insensitive" } },
      { display_name: { contains: "simulation", mode: "insensitive" } },
      { display_name: { startsWith: "test ", mode: "insensitive" } },
      { display_name: { endsWith: " test", mode: "insensitive" } },
      { display_name: { equals: "test", mode: "insensitive" } },
      nullableContains("tagline", "simulation"),
      nullableContains("tagline", "concurrency"),
      nullableContains("tagline", "mixed"),
      nullableContains("bio", "simulation"),
      nullableContains("bio", "mixed live-site"),
      nullableContains("bio", "simultaneous approval"),
      nullableContains("bio", "concurrency"),
      nullableContains("bio", "created during"),
    ],
  };
}

const PHOTO_ID_CACHE_TTL_MS = 60_000;
let photoProviderIdsCache: { ids: string[]; expiresAt: number } | null = null;

async function loadPublicPhotoProviderIds(prisma: {
  $queryRaw: (query: TemplateStringsArray) => Promise<Array<{ id: string }>>;
}): Promise<string[] | null> {
  const now = Date.now();
  if (photoProviderIdsCache && photoProviderIdsCache.expiresAt > now) {
    return photoProviderIdsCache.ids;
  }

  try {
    const rows = await prisma.$queryRaw`
            SELECT id FROM "Provider"
            WHERE verification_provider IN ('eros', 'evergreen', 'tryst')
              AND photos IS NOT NULL
              AND jsonb_typeof(photos) = 'array'
              AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(photos) = 'array' THEN photos ELSE '[]'::jsonb END), 0) > 0
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(
                  CASE WHEN jsonb_typeof(photos) = 'array' THEN photos ELSE '[]'::jsonb END
                ) AS url
                WHERE (
                  url LIKE '%/api/r2-photo/%'
                  OR url ~* '(i\\.eros\\.com|eros\\.com/i/)'
                  OR url ~* 'media-v[0-9]*\\.tryst\\.'
                  OR url ~* 'tryst\\.a4cdn\\.org'
                  OR url ~* 'tryst\\.link/'
                  OR url ~* '\\.(jpg|jpeg|png|webp|avif|gif)(\\?|$)'
                )
                AND url NOT ILIKE '%sharks_512%'
                AND url NOT ILIKE '%/packs/static/%'
                AND url NOT ILIKE '%placeholder%'
                AND url NOT ILIKE '%default-avatar%'
                AND url NOT ILIKE '%eros-logo%'
              )
          `;

    const ids = rows.map((row) => row.id);
    photoProviderIdsCache = { ids, expiresAt: now + PHOTO_ID_CACHE_TTL_MS };
    return ids;
  } catch (err) {
    // Transient DB error — caller may fail-open so browse stays available.
    console.warn("[providerVisibility] Photo filter query failed, showing all:", (err as Error).message);
    return null;
  }
}

/** Public browse requires displayable photos — no verification_url-only stubs. */
export async function buildPublicPhotoSearchFilter(prisma: {
  $queryRaw: (query: TemplateStringsArray) => Promise<Array<{ id: string }>>;
}): Promise<Record<string, unknown>> {
  const ids = await loadPublicPhotoProviderIds(prisma);
  if (ids === null) {
    return {}; // Fail open on query errors only
  }
  if (ids.length === 0) {
    // Successful empty set — do not show the whole catalog without photos
    return { id: { in: ["__no_public_photos__"] } };
  }
  return { id: { in: ids } };
}

/** Test helper — bust in-memory photo ID cache after data mutations. */
export function clearPublicPhotoProviderIdsCache(): void {
  photoProviderIdsCache = null;
}

/**
 * Cached (60s) list of provider IDs with displayable public photos.
 * Returns null on transient DB error so callers can fail open.
 */
export function getPublicPhotoProviderIds(prisma: {
  $queryRaw: (query: TemplateStringsArray) => Promise<Array<{ id: string }>>;
}): Promise<string[] | null> {
  return loadPublicPhotoProviderIds(prisma);
}

export function publicProviderVisibilityWhere(): Record<string, unknown> {
  const blockedNames = parseConfiguredBlockedNames();
  const exclusionBranches: Record<string, unknown>[] = [
    ...blockedNames.map((name) => ({
      display_name: { equals: name, mode: "insensitive" },
    })),
    ...((buildTestDataExclusion().OR as Record<string, unknown>[]) ?? []),
  ];

  const andFilters: Record<string, unknown>[] = [
    {
      OR: [
        { ad_package_expiry: null },
        { ad_package_expiry: { gte: new Date().toISOString() } },
        { ad_package: "none" },
      ],
    },
    { verification_provider: { in: [...PUBLIC_VERIFICATION_PROVIDERS] } },
  ];

  const badgeFilter = publicVerificationBadgeWhere();
  if (badgeFilter) andFilters.push(badgeFilter);

  return {
    status: "active",
    is_profile_approved: true,
    AND: andFilters,
    NOT: {
      OR: exclusionBranches,
    },
  };
}

export function publicSearchCacheHeaders(): Record<string, string> {
  return {
    "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
  };
}

/** Public profile/search fields — excludes nullable owner columns (e.g. user_id) that break Prisma hydration on imports. */
export const publicProviderProfileSelect = {
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
  p411_url: true,
  p411_id: true,
  p411_verified_at: true,
  ter_url: true,
  tob_url: true,
  pd_url: true,
  review_verified_at: true,
  photos: true,
  tour_plan: true,
  video_url: true,
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
} as const;
