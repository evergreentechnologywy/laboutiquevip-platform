/**
 * Canonical public picture path for LBV listings:
 *   1) /api/r2-photo/{providerId}/{file}   (Cloudflare R2 via origin proxy)
 *   2) /api/eros-photo?url=...             (Eros CDN via origin proxy)
 *   3) /api/tryst-photo?url=...            (Tryst CDN via origin proxy)
 *
 * Clients should prefer these same-origin URLs — never hotlink scrape CDNs.
 */

function isR2PhotoUrl(url: string): boolean {
  return url.includes("/api/r2-photo/");
}

function isErosImageUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return /(?:^|\/\/)(?:[\w-]+\.)?eros\.com\/(?:i|profile)\//.test(lower);
}

function isTrystImageUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
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

function expandTrystSizeVariants(url: string): string[] {
  const match = url.match(/\/(small|medium|large)\.(avif|jpe?g|webp|png)$/i);
  if (!match) return [url];
  const ext = match[2];
  const base = url.slice(0, match.index);
  return ["large", "medium", "small"].map((size) => `${base}/${size}.${ext}`);
}

export function resolvePublicPhotoUrl(src: string, providerId?: string | null): string | null {
  const value = String(src || "").trim();
  if (!value) return null;

  if (isR2PhotoUrl(value)) {
    const idx = value.indexOf("/api/r2-photo/");
    return idx >= 0 ? value.slice(idx) : value;
  }

  if (value.includes("/api/eros-photo") || value.includes("/api/tryst-photo")) {
    // Already on the canonical same-origin path.
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
    // Prefer larger Tryst derivatives when scrape stored /small.*
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
 */
export function toPublicPhotoUrls(photos: unknown, providerId?: string | null, max = 32): string[] {
  if (!Array.isArray(photos)) return [];
  const r2: string[] = [];
  const eros: string[] = [];
  const tryst: string[] = [];
  const other: string[] = [];

  for (const raw of photos) {
    const value = String(raw || "").trim();
    if (!value) continue;
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

export function withPublicPhotos<T extends { id?: string; photos?: unknown }>(provider: T): T {
  return {
    ...provider,
    photos: toPublicPhotoUrls(provider.photos, provider.id),
  };
}
