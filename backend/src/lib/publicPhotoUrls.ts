/**
 * Canonical public picture path for LBV listings:
 *   1) /api/r2-photo/{providerId}/{file}   (Cloudflare R2 via origin proxy)
 *   2) /api/eros-photo?url=...             (Eros CDN via origin proxy)
 *   3) /api/tryst-photo?url=...            (Tryst CDN via origin proxy)
 *
 * Clients should prefer these same-origin URLs — never hotlink scrape CDNs.
 */

const JUNK_SUBSTRINGS = [
  "sharks_512",
  "/packs/static/images/",
  "discovery.tryst.a4cdn.org/packs",
  "theeroticreview.com/library/",
  "coop.theeroticreview.com/hit.php",
  "eros-logo",
  "loader.php",
  "placeholder",
  "default-avatar",
  "no-image",
  "lamp.png",
];

function isJunkUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return JUNK_SUBSTRINGS.some((part) => lower.includes(part));
}

function coercePhotoUrl(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return String(o.url || o.src || o.href || o.photo || o.storage_key || "").trim();
  }
  return "";
}

function isR2PhotoUrl(url: string): boolean {
  return url.includes("/api/r2-photo/");
}

function isErosImageUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return /(?:^|\/\/)(?:[\w-]+\.)?eros\.com\/(?:i|profile)\//.test(lower);
}

function isTrystImageUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  if (!lower || isJunkUrl(lower)) return false;
  if (lower.includes("discovery.tryst") && lower.includes("/packs/")) return false;
  return (
    /media-v\d*\.tryst\./i.test(lower) ||
    /tryst\.a4cdn\.org/i.test(lower) ||
    /(?:^|\/\/)(?:[\w-]+\.)?tryst\.link\//i.test(lower)
  );
}

function isAlreadyProxied(url: string): boolean {
  return (
    url.includes("/api/r2-photo/") ||
    url.includes("/api/eros-photo") ||
    url.includes("/api/tryst-photo")
  );
}

function extractTrystProfileId(url: string): string | null {
  const m = url.match(
    /\/profiles\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i,
  );
  return m ? m[1].toLowerCase() : null;
}

/** Keep dominant Tryst profile UUID cluster; drop cross-contaminated scrapes. */
export function filterDominantTrystCluster(urls: string[]): string[] {
  const tryst = urls.filter(isTrystImageUrl);
  if (tryst.length <= 1) return urls;

  const counts = new Map<string, number>();
  for (const u of tryst) {
    const id = extractTrystProfileId(u);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  if (counts.size <= 1) return urls;

  let bestId: string | null = null;
  let bestN = 0;
  for (const [id, n] of counts.entries()) {
    if (n > bestN) {
      bestId = id;
      bestN = n;
    }
  }
  const majority = bestN >= 2 && bestN >= Math.ceil(tryst.length * 0.4);
  if (!majority || !bestId) {
    return urls.filter((u) => !isTrystImageUrl(u));
  }
  return urls.filter((u) => {
    if (!isTrystImageUrl(u)) return true;
    const id = extractTrystProfileId(u);
    return !id || id === bestId;
  });
}

function expandTrystSizeVariants(url: string): string[] {
  const match = url.match(/\/(small|medium|large|thumb)\.(avif|jpe?g|webp|png)$/i);
  if (!match || match.index === undefined) return [url];
  const ext = match[2];
  const base = url.slice(0, match.index);
  return ["large", "medium", "small", "thumb"].map((size) => `${base}/${size}.${ext}`);
}

/** Prefer full R2 originals over -md derivatives when both appear. */
function preferBetterR2Variant(urls: string[]): string[] {
  const r2 = urls.filter(isR2PhotoUrl);
  if (r2.length <= 1) return urls;
  const full = new Set(
    r2
      .map((u) => u.replace(/-md\.(webp|jpe?g|png|avif)$/i, ".$1"))
      .filter((u) => !/-md\./i.test(u)),
  );
  // If we have both 000-md.webp and 000.jpg prefer non-md when available for same ordinal
  return urls.filter((u) => {
    if (!isR2PhotoUrl(u) || !/-md\./i.test(u)) return true;
    const upgraded = u.replace(/-md\.(webp|jpe?g|png|avif)$/i, ".$1");
    // Drop md if a non-md sibling exists in the set
    return !urls.some((other) => other !== u && other.replace(/-md\.(webp|jpe?g|png|avif)$/i, ".$1") === upgraded && !/-md\./i.test(other));
  });
}

export function resolvePublicPhotoUrl(src: string, providerId?: string | null): string | null {
  const value = String(src || "").trim();
  if (!value || isJunkUrl(value)) return null;

  if (isR2PhotoUrl(value)) {
    const idx = value.indexOf("/api/r2-photo/");
    return idx >= 0 ? value.slice(idx) : value;
  }

  if (value.includes("/api/eros-photo") || value.includes("/api/tryst-photo")) {
    try {
      if (value.startsWith("/")) return value;
      const u = new URL(value);
      return `${u.pathname}${u.search}`;
    } catch {
      return value;
    }
  }

  if (isErosImageUrl(value)) {
    const params = new URLSearchParams({ url: value });
    if (providerId) params.set("providerId", String(providerId));
    return `/api/eros-photo?${params.toString()}`;
  }

  if (isTrystImageUrl(value)) {
    const preferred = expandTrystSizeVariants(value)[0] || value;
    const params = new URLSearchParams({ url: preferred });
    if (providerId) params.set("providerId", String(providerId));
    return `/api/tryst-photo?${params.toString()}`;
  }

  // Unknown absolute http(s) — leave as-is (rare evergreen/ultragfe cases).
  return value;
}

/**
 * Order: R2 → Eros proxy → Tryst proxy → other. Deduped.
 * Filters junk + Tryst multi-profile contamination.
 */
export function toPublicPhotoUrls(photos: unknown, providerId?: string | null, max = 32): string[] {
  if (!Array.isArray(photos)) return [];

  const coerced = photos.map(coercePhotoUrl).filter(Boolean);
  const cleaned = preferBetterR2Variant(filterDominantTrystCluster(coerced)).filter((u) => !isJunkUrl(u));

  const r2: string[] = [];
  const eros: string[] = [];
  const tryst: string[] = [];
  const other: string[] = [];

  for (const value of cleaned) {
    if (isR2PhotoUrl(value) || value.includes("/api/r2-photo/")) {
      const resolved = resolvePublicPhotoUrl(value, providerId);
      if (resolved) r2.push(resolved);
      continue;
    }
    if (isErosImageUrl(value) || value.includes("/api/eros-photo")) {
      const resolved = resolvePublicPhotoUrl(value, providerId);
      if (resolved) eros.push(resolved);
      continue;
    }
    if (isTrystImageUrl(value) || value.includes("/api/tryst-photo")) {
      const resolved = resolvePublicPhotoUrl(value, providerId);
      if (resolved) tryst.push(resolved);
      continue;
    }
    if (isAlreadyProxied(value)) {
      const resolved = resolvePublicPhotoUrl(value, providerId);
      if (resolved) other.push(resolved);
      continue;
    }
    const resolved = resolvePublicPhotoUrl(value, providerId);
    if (resolved) other.push(resolved);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [...r2, ...eros, ...tryst, ...other]) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

export function withPublicPhotos<T extends { id?: string; photos?: unknown }>(
  provider: T,
  max = 12,
): T {
  return {
    ...provider,
    photos: toPublicPhotoUrls(provider.photos, provider.id, max),
  };
}
