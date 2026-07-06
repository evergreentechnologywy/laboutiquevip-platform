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

/** Prisma Json filters conflict with the user_id source guard — resolve photo IDs via SQL. */
export async function buildPublicPhotoSearchFilter(prisma: {
  $queryRaw: (query: TemplateStringsArray) => Promise<Array<{ id: string }>>;
}): Promise<Record<string, unknown>> {
  const rows = await prisma.$queryRaw`
    SELECT id FROM "Provider"
    WHERE verification_provider IN ('eros', 'evergreen')
      AND photos IS NOT NULL
      AND jsonb_typeof(photos::jsonb) = 'array'
      AND CASE
        WHEN jsonb_typeof(photos::jsonb) = 'array' THEN jsonb_array_length(photos::jsonb) > 0
        ELSE false
      END
  `;

  return {
    OR: [
      { verification_url: { not: null } },
      { id: { in: rows.map((row) => row.id) } },
    ],
  };
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
          // Free tier stays public after cleanup even if a stale expiry date remains.
          { ad_package: "none" },
        ],
      },
      // Public catalog: current eros.com + evergreen imports only.
      // Advertiser-owned profiles (null verification_provider) stay in DB but are hidden from browse/search.
      { verification_provider: { in: ["eros", "evergreen"] } },
    ],
    NOT: {
      OR: exclusionBranches,
    },
  };
}

export function publicSearchCacheHeaders(): Record<string, string> {
  return {
    "cache-control": "public, max-age=30, s-maxage=30, stale-while-revalidate=120",
  };
}
