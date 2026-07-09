/**
 * Catalog sync policy for Eros + Tryst imports (mirrors backend/src/lib/catalogSyncPolicy.ts).
 *
 * Same-city dedupe before insert:
 * - Same Eros file id from verification_url, OR
 * - Same normalized display_name + location_city + location_state
 *
 * Public hide: status=inactive after CATALOG_STALE_GRACE_DAYS without a scan sighting (last_seen_at).
 * Never hard-delete Provider rows from catalog sync.
 */

import { canonicalErosProfileUrl, erosFileId, normalizeProviderName, providerDedupeKey } from "./eros-url.mjs";

export const CATALOG_STALE_GRACE_DAYS = 15;
export const IMPORTED_CATALOG_SYNC_SOURCES = ["eros", "tryst"];
export const CATALOG_STALE_HIDE_NOTE = "catalog-sync: stale hide (not seen in 15d)";

export function catalogProviderDedupeKey(provider) {
  return providerDedupeKey(provider);
}

export function normalizeCatalogCity(city) {
  return String(city ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isCatalogProviderStale(lastSeenAt, now = new Date(), graceDays = CATALOG_STALE_GRACE_DAYS) {
  if (!lastSeenAt) return false;
  const seenMs = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(seenMs)) return false;
  const graceMs = graceDays * 24 * 60 * 60 * 1000;
  return now.getTime() - seenMs > graceMs;
}

export function catalogStaleCutoff(now = new Date(), graceDays = CATALOG_STALE_GRACE_DAYS) {
  return new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);
}

export function shouldSkipCatalogInsert(candidate, existing) {
  if (!existing) return false;
  return catalogProviderDedupeKey(candidate) === catalogProviderDedupeKey(existing);
}

export function catalogSeenTouchFields(existing = null, now = new Date()) {
  const fields = { last_seen_at: now };
  const wasStaleHide =
    existing?.status === "inactive" &&
    String(existing?.admin_notes ?? "").includes("catalog-sync: stale hide");
  if (wasStaleHide) {
    fields.status = "active";
    fields.admin_notes = null;
  }
  return fields;
}

function canonicalVerificationUrl(url, verificationProvider) {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  if (String(verificationProvider ?? "").toLowerCase() === "eros") {
    return canonicalErosProfileUrl(raw);
  }
  return raw.toLowerCase().replace(/\?.*$/, "");
}

/**
 * Find an existing imported catalog row that would block a same-city insert.
 */
export async function findCatalogDuplicateInCity(prisma, candidate) {
  if (!prisma || !candidate) return null;

  const provider = String(candidate.verification_provider ?? "").toLowerCase();
  if (!IMPORTED_CATALOG_SYNC_SOURCES.includes(provider)) return null;

  const city = candidate.location_city;
  const state = candidate.location_state;

  if (candidate.verification_url) {
    if (provider === "eros") {
      const fileId = erosFileId(candidate.verification_url);
      if (fileId) {
        const byFile = await prisma.provider.findFirst({
          where: {
            verification_provider: "eros",
            verification_url: { contains: `/files/${fileId}.htm`, mode: "insensitive" },
          },
        });
        if (byFile) return byFile;
      }
      const canonical = canonicalErosProfileUrl(candidate.verification_url);
      if (canonical) {
        const rows = await prisma.$queryRaw`
          SELECT id
          FROM "Provider"
          WHERE verification_provider = 'eros'
            AND verification_url IS NOT NULL
            AND lower(regexp_replace(trim(verification_url), '\\?.*$', '')) = ${canonical}
          LIMIT 1
        `;
        const id = rows?.[0]?.id;
        if (id) {
          const row = await prisma.provider.findUnique({ where: { id } });
          if (row) return row;
        }
      }
    } else {
      const canonical = canonicalVerificationUrl(candidate.verification_url, provider);
      const byUrl = await prisma.provider.findFirst({
        where: {
          verification_provider: provider,
          verification_url: { equals: candidate.verification_url, mode: "insensitive" },
        },
      });
      if (byUrl) return byUrl;
      if (canonical) {
        const byCanonical = await prisma.provider.findFirst({
          where: {
            verification_provider: provider,
            verification_url: { contains: canonical.split("tryst.link")[1] ?? canonical, mode: "insensitive" },
          },
        });
        if (byCanonical) return byCanonical;
      }
    }
  }

  const nameKey = normalizeProviderName(candidate.display_name);
  const cityKey = normalizeCatalogCity(city);
  if (!nameKey || !cityKey) return null;

  const peers = await prisma.provider.findMany({
    where: {
      verification_provider: { in: IMPORTED_CATALOG_SYNC_SOURCES },
      location_city: { equals: city, mode: "insensitive" },
      ...(state ? { location_state: { equals: state, mode: "insensitive" } } : {}),
    },
    select: {
      id: true,
      display_name: true,
      location_city: true,
      location_state: true,
      verification_url: true,
      verification_provider: true,
      status: true,
      admin_notes: true,
      last_seen_at: true,
    },
    take: 200,
  });

  for (const row of peers) {
    if (normalizeProviderName(row.display_name) === nameKey) return row;
  }

  return null;
}

export async function touchCatalogProviderSeen(prisma, providerId, existing = null) {
  if (!prisma || !providerId) return;
  await prisma.provider.update({
    where: { id: providerId },
    data: catalogSeenTouchFields(existing, new Date()),
  });
}
