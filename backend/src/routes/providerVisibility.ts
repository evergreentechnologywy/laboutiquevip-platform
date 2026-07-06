import { Prisma } from "../../generated/prisma-client/index.js";

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

/** Scraped import stubs: no verification source and no renderable photos. */
export function buildEmptyPhotoStubExclusion(): Record<string, unknown> {
  return {
    AND: [
      { verification_url: null },
      { verification_provider: null },
      {
        OR: [
          { photos: { equals: Prisma.DbNull } },
          { photos: { equals: [] } },
        ],
      },
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
          { ad_package: "none" },
        ],
      },
      {
        OR: [
          { user_id: { not: null } },
          { verification_provider: { in: ["eros", "evergreen"] } },
        ],
      },
      { NOT: buildEmptyPhotoStubExclusion() },
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
