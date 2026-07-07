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
}): Promise<string[]> {
  const now = Date.now();
  if (photoProviderIdsCache && photoProviderIdsCache.expiresAt > now) {
    return photoProviderIdsCache.ids;
  }

  const rows = await prisma.$queryRaw`
    SELECT id FROM "Provider"
    WHERE verification_provider IN ('eros', 'evergreen', 'tryst')
      AND photos IS NOT NULL
      AND jsonb_typeof(photos::jsonb) = 'array'
      AND jsonb_array_length(photos::jsonb) > 0
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(photos::jsonb) AS url
        WHERE url LIKE '%/api/r2-photo/%'
           OR url ~* '(i\\.eros\\.com|eros\\.com/i/)'
           OR url ~* '(tryst\\.link|discovery\\.tryst|a4cdn\\.ch|a4cdn\\.org)'
           OR url ~* '\\.(jpg|jpeg|png|webp|avif|gif)(\\?|$)'
      )
  `;

  const ids = rows.map((row) => row.id);
  photoProviderIdsCache = { ids, expiresAt: now + PHOTO_ID_CACHE_TTL_MS };
  return ids;
}

/** Public browse requires displayable photos — no verification_url-only stubs. */
export async function buildPublicPhotoSearchFilter(prisma: {
  $queryRaw: (query: TemplateStringsArray) => Promise<Array<{ id: string }>>;
}): Promise<Record<string, unknown>> {
  const ids = await loadPublicPhotoProviderIds(prisma);
  if (ids.length === 0) {
    return { id: { in: ["00000000-0000-0000-0000-000000000000"] } };
  }
  return { id: { in: ids } };
}

/** Test helper — bust in-memory photo ID cache after data mutations. */
export function clearPublicPhotoProviderIdsCache(): void {
  photoProviderIdsCache = null;
}

export function publicProviderVisibilityWhere(): Record<string, unknown> {
  const blockedNames = parseConfiguredBlockedNames();
  const exclusionBranches: Record<string, unknown>[] = [
    ...blockedNames.map((name) => ({
      display_name: { equals: name, mode: "insensitive" },
    })),
    ...((buildTestDataExclusion().OR as Record<string, unknown>[]) ?? []),
  ];

  return {
    status: "active",
    is_profile_approved: true,
    AND: [
      {
        OR: [
          { ad_package_expiry: null },
          { ad_package_expiry: { gte: new Date().toISOString() } },
          { ad_package: "none" },
        ],
      },
      { verification_provider: { in: [...PUBLIC_VERIFICATION_PROVIDERS] } },
    ],
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
