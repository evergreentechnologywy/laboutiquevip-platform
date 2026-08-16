import { erosFileId, normalizeProviderName } from "./providerDedupe.js";

/** Days without an Eros/Tryst scan sighting before hiding from public browse. */
export const CATALOG_STALE_GRACE_DAYS = 15;

export const IMPORTED_CATALOG_SYNC_SOURCES = ["eros", "tryst"] as const;

export type ImportedCatalogSyncSource = (typeof IMPORTED_CATALOG_SYNC_SOURCES)[number];

/** Sources accepted by POST /api/v1/catalog/ingest (includes Aura evergreen roster). */
export const CATALOG_INGEST_SOURCES = ["eros", "tryst", "evergreen"] as const;

export type CatalogIngestSource = (typeof CATALOG_INGEST_SOURCES)[number];

export const CATALOG_STALE_HIDE_NOTE = "catalog-sync: stale hide (not seen in 15d)";

/**
 * Same-city dedupe key for imported catalog rows (aligned with dedupe-imported-providers / providerDedupeKey).
 * - Eros: canonical file id from verification_url (`eros:{fileId}`)
 * - Otherwise: normalized display_name + location_city + location_state within the same metro
 */
export function catalogProviderDedupeKey(provider: {
  display_name?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  verification_url?: string | null;
}): string {
  const fileId = erosFileId(provider.verification_url);
  if (fileId) return `eros:${fileId}`;

  const name = normalizeProviderName(provider.display_name);
  const city = normalizeCatalogCity(provider.location_city);
  const state = String(provider.location_state ?? "")
    .toLowerCase()
    .trim();
  return `name:${name}|${city}|${state}`;
}

export function normalizeCatalogCity(city: string | null | undefined): string {
  return String(city ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isImportedCatalogSyncSource(
  verificationProvider: string | null | undefined,
): verificationProvider is ImportedCatalogSyncSource {
  const source = String(verificationProvider ?? "").trim().toLowerCase();
  return (IMPORTED_CATALOG_SYNC_SOURCES as readonly string[]).includes(source);
}

/** True when last_seen_at is older than the grace window (null = never scanned, not stale). */
export function isCatalogProviderStale(
  lastSeenAt: Date | string | null | undefined,
  now: Date = new Date(),
  graceDays: number = CATALOG_STALE_GRACE_DAYS,
): boolean {
  if (!lastSeenAt) return false;
  const seenMs = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(seenMs)) return false;
  const graceMs = graceDays * 24 * 60 * 60 * 1000;
  return now.getTime() - seenMs > graceMs;
}

export function catalogStaleCutoff(
  now: Date = new Date(),
  graceDays: number = CATALOG_STALE_GRACE_DAYS,
): Date {
  return new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);
}

/** Skip insert when an existing imported row matches the same dedupe key in the same city. */
export function shouldSkipCatalogInsert(
  candidate: {
    display_name?: string | null;
    location_city?: string | null;
    location_state?: string | null;
    verification_url?: string | null;
  },
  existing: {
    display_name?: string | null;
    location_city?: string | null;
    location_state?: string | null;
    verification_url?: string | null;
  } | null,
): boolean {
  if (!existing) return false;
  return catalogProviderDedupeKey(candidate) === catalogProviderDedupeKey(existing);
}
