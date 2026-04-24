const DEFAULT_PUBLIC_PROVIDER_NAME_BLOCKLIST = ["Jarvis Test Listing"];

function parseConfiguredBlockedNames(): string[] {
  const configured = process.env.PUBLIC_PROVIDER_NAME_BLOCKLIST
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set([...(configured ?? []), ...DEFAULT_PUBLIC_PROVIDER_NAME_BLOCKLIST]));
}

function buildTestDataExclusion(): Record<string, unknown> {
  return {
    OR: [
      { display_name: { contains: "batch", mode: "insensitive" } },
      { display_name: { contains: "user", mode: "insensitive" } },
      { display_name: { contains: "simulation", mode: "insensitive" } },
      { display_name: { contains: "test", mode: "insensitive" } },
      { tagline: { contains: "simulation", mode: "insensitive" } },
      { tagline: { contains: "test", mode: "insensitive" } },
      { tagline: { contains: "mixed", mode: "insensitive" } },
      { tagline: { contains: "concurrency", mode: "insensitive" } },
      { bio: { contains: "simulation", mode: "insensitive" } },
      { bio: { contains: "test", mode: "insensitive" } },
      { bio: { contains: "mixed live-site", mode: "insensitive" } },
      { bio: { contains: "simultaneous approval", mode: "insensitive" } },
      { bio: { contains: "concurrency", mode: "insensitive" } },
      { bio: { contains: "created during", mode: "insensitive" } },
    ],
  };
}

export function publicProviderVisibilityWhere(): Record<string, unknown> {
  const blockedNames = parseConfiguredBlockedNames();
  const testDataExclusion = buildTestDataExclusion();

  const notConditions: any[] = [];
  if (blockedNames.length > 0) {
    notConditions.push(
      ...blockedNames.map((name) => ({
        display_name: { equals: name, mode: "insensitive" },
      }))
    );
  }
  notConditions.push(testDataExclusion);

  return {
    status: "active",
    is_profile_approved: true,
    NOT: notConditions,
  };
}

export function publicSearchCacheHeaders(): Record<string, string> {
  return {
    "cache-control": "public, max-age=30, s-maxage=30, stale-while-revalidate=120",
  };
}
