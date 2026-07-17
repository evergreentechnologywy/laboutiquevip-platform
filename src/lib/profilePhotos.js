const JUNK_SUBSTRINGS = [
  // Note: /api/r2-photo/ is intentionally NOT junk — handled as canonical display path.
  "theeroticreview.com/library/",
  "coop.theeroticreview.com/hit.php",
  "eros-logo",
  "loader.php",
  "sharks_512",
  "/packs/static/images/",
  "discovery.tryst.a4cdn.org/packs",
  "placeholder",
  "no-image",
  "default-avatar",
];

const ALLOWED_HOST_PATTERNS = [
  /ultragfe\.com\/images/i,
  /photos\.skipsweb\.com/i,
  /imagedelivery\.net/i,
  /i\.eros\.com/i,
  /media-v\d*\.tryst\./i,
  /tryst\.a4cdn\.org/i,
  /laboutiquevip\.net\/api\/(?:r2|eros|tryst)-photo/i,
  // Evergreen model sites often host first-party gallery assets
  /\.site\/assets\//i,
  /\.com\/assets\//i,
];

export function isValidProfilePhoto(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (JUNK_SUBSTRINGS.some((part) => lower.includes(part))) return false;
  if (lower.endsWith("lamp.png")) return false;
  if (lower.includes(".js")) return false;
  if (lower.includes(".html")) return false;
  // Same-origin proxies are always valid display targets
  if (
    lower.includes("/api/r2-photo/") ||
    lower.includes("/api/eros-photo") ||
    lower.includes("/api/tryst-photo")
  ) {
    return true;
  }
  return (
    /\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(lower) ||
    ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(lower))
  );
}

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function extractNameTokens(displayName) {
  return String(displayName || "")
    .toLowerCase()
    .split(/[\s,._-]+/)
    .map(normalizeToken)
    .filter((token) => token.length >= 3);
}

function extractVerificationSlugTokens(verificationUrl) {
  const match = String(verificationUrl || "").match(/\/provider\/\d+-(.+)\.html/i);
  if (!match) return [];
  return match[1]
    .split(/[-_]+/)
    .map(normalizeToken)
    .filter((token) => token.length >= 3);
}

function extractPhoneFromPhotoUrl(url) {
  const match = String(url).match(/-(\d{10})-\d+\.[a-z0-9]+$/i);
  return match ? match[1] : null;
}

function dedupeUrls(urls) {
  const seen = new Set();
  return urls.filter((url) => {
    const key = String(url).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Coerce API photo entries (string | {url}|{src}) → string URLs. */
export function coercePhotoUrls(photos) {
  if (!Array.isArray(photos)) return [];
  const out = [];
  for (const p of photos) {
    if (typeof p === "string") {
      const s = p.trim();
      if (s) out.push(s);
      continue;
    }
    if (p && typeof p === "object") {
      const s = String(p.url || p.src || p.href || p.photo || p.storage_key || "").trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * Ensures a photo URL belongs to the provider (phone + source slug + display name).
 */
export function photoMatchesProvider(url, provider) {
  if (!isValidProfilePhoto(url)) return false;

  const lower = String(url).toLowerCase();
  const filename = lower.split("/").pop() || lower;
  // Keep the hostname in the identity surface. Evergreen model sites often use
  // generic asset filenames, while the model identity is carried by the host
  // itself (for example, rubyvega.site/assets/photo_123.jpg).
  const identityBlob = lower.replace(/^https?:\/\//, "").replace(/[^a-z0-9]/g, " ");

  const providerPhone = String(provider?.phone || "").replace(/\D/g, "");
  const urlPhone = extractPhoneFromPhotoUrl(url);
  const slugTokens = extractVerificationSlugTokens(provider?.verification_url);
  const slugHits = slugTokens.filter((token) => identityBlob.includes(token)).length;

  // Phone alone is not enough: URL path must also match verification slug when present.
  if (providerPhone && urlPhone) {
    if (urlPhone !== providerPhone) return false;
    if (slugTokens.length > 0) {
      return slugHits >= Math.min(2, slugTokens.length);
    }
    return true;
  }

  if (providerPhone && urlPhone && urlPhone !== providerPhone) {
    return false;
  }

  const nameTokens = extractNameTokens(provider?.display_name);
  const identityTokens = [...new Set([...slugTokens, ...nameTokens])];

  if (identityTokens.length === 0) {
    return !/^[a-f0-9]{16,}\.[a-z0-9]+$/i.test(filename);
  }

  if (slugTokens.length > 0 && slugHits >= Math.min(2, slugTokens.length)) {
    return true;
  }

  const nameHits = nameTokens.filter((token) => identityBlob.includes(token)).length;
  if (nameTokens.length >= 2 && nameHits >= 2) return true;
  if (nameTokens.length === 1 && nameHits >= 1) return true;

  // First-party evergreen sites: host carries model identity
  if (/\.(site|com)\/assets\//i.test(lower) && nameHits >= 1) return true;

  if (/^[a-f0-9]{16,}\.[a-z0-9]+$/i.test(filename)) {
    return false;
  }

  return false;
}

export function isR2PhotoUrl(url) {
  return String(url || "").includes("/api/r2-photo/");
}

export function isErosProxyUrl(url) {
  return String(url || "").includes("/api/eros-photo");
}

export function isTrystProxyUrl(url) {
  return String(url || "").includes("/api/tryst-photo");
}

/** Same-origin picture path (R2 or CDN proxy). */
export function isCanonicalPhotoUrl(url) {
  return isR2PhotoUrl(url) || isErosProxyUrl(url) || isTrystProxyUrl(url);
}

export function isErosImageUrl(url) {
  const lower = String(url || "").trim().toLowerCase();
  if (!lower) return false;
  // www.eros.com/i/..., i.eros.com/..., *.eros.com/profile/...
  return /(?:^|\/\/)(?:[\w-]+\.)?eros\.com\/(?:i|profile)\//.test(lower);
}

/** Tryst CDN assets from the provider's own scraped gallery. */
export function isTrystImageUrl(url) {
  const lower = String(url || "").trim().toLowerCase();
  if (!lower) return false;
  if (lower.includes("discovery.tryst") && lower.includes("/packs/")) return false;
  return (
    /media-v\d*\.tryst\./i.test(lower) ||
    /tryst\.a4cdn\.org/i.test(lower) ||
    /(?:^|\/\/)(?:[\w-]+\.)?tryst\.link\//i.test(lower)
  );
}

/** Extract Tryst profile UUID from media URL (when present). */
export function extractTrystProfileId(url) {
  const m = String(url || "").match(/\/profiles\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Drop cross-contaminated Tryst scrapes (photos from many profile UUIDs).
 * Keep the dominant cluster only.
 */
export function filterDominantTrystCluster(urls) {
  const list = Array.isArray(urls) ? urls : [];
  const tryst = list.filter(isTrystImageUrl);
  if (tryst.length <= 1) return list;

  const counts = new Map();
  for (const u of tryst) {
    const id = extractTrystProfileId(u);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  if (counts.size <= 1) return list;

  let bestId = null;
  let bestN = 0;
  for (const [id, n] of counts.entries()) {
    if (n > bestN) {
      bestId = id;
      bestN = n;
    }
  }
  // Require a real majority / cluster — otherwise drop all multi-id tryst noise.
  const majority = bestN >= 2 && bestN >= Math.ceil(tryst.length * 0.4);
  if (!majority || !bestId) {
    return list.filter((u) => !isTrystImageUrl(u));
  }
  return list.filter((u) => {
    if (!isTrystImageUrl(u)) return true;
    const id = extractTrystProfileId(u);
    return !id || id === bestId;
  });
}

/**
 * Prefer larger Tryst derivatives when the scrape stored /small|thumb|medium.
 * Returns [preferred, ...fallbacks] for a single source URL.
 */
export function expandTrystSizeVariants(url) {
  const value = String(url || "").trim();
  if (!value || !isTrystImageUrl(value)) return [value].filter(Boolean);

  const match = value.match(/\/(small|medium|large|thumb)\.(avif|jpe?g|webp|png)$/i);
  if (!match) return [value];

  const ext = match[2];
  const base = value.slice(0, match.index);
  // Prefer large for cards/profiles; keep medium/small as load fallbacks.
  const order = ["large", "medium", "small", "thumb"];
  return dedupeUrls(order.map((size) => `${base}/${size}.${ext}`));
}

/**
 * Gallery URLs for display. Prefers R2, keeps first-party scrape CDNs (Eros/Tryst),
 * then other provider-matched photos (identity gate for ultragfe cross-contamination).
 */
export function getProfilePhotos(photos, provider) {
  const coerced = filterDominantTrystCluster(coercePhotoUrls(photos));
  if (!coerced.length) return [];

  // Canonical same-origin paths are preferred display URLs (R2 + CDN proxies).
  const r2 = coerced.filter(isR2PhotoUrl);
  const erosProxy = coerced.filter(isErosProxyUrl);
  const trystProxy = coerced.filter(isTrystProxyUrl);
  const valid = coerced.filter(isValidProfilePhoto);
  if (!provider) return dedupeUrls([...r2, ...erosProxy, ...trystProxy, ...valid]);

  // Eros/Tryst CDN URLs are scraped from the provider's own listing — trust after cluster filter.
  const eros = valid.filter(isErosImageUrl);
  const tryst = valid.filter(isTrystImageUrl);
  const other = valid.filter(
    (url) => !isErosImageUrl(url) && !isTrystImageUrl(url) && !isCanonicalPhotoUrl(url) && photoMatchesProvider(url, provider),
  );
  return dedupeUrls([...r2, ...erosProxy, ...eros, ...trystProxy, ...tryst, ...other]);
}

/**
 * Returns a browser-safe photo URL: r2-photo passthrough; Eros/Tryst CDNs via backend proxy.
 */
export function resolvePublicPhotoUrl(src, providerId) {
  const value = String(src || "").trim();
  if (!value) return null;

  if (isR2PhotoUrl(value)) {
    // Prefer site-relative path so the active origin serves the proxy.
    const idx = value.indexOf("/api/r2-photo/");
    return idx >= 0 ? value.slice(idx) : value;
  }

  if (isErosProxyUrl(value) || isTrystProxyUrl(value)) {
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

  return value;
}

export function getDisplayProfilePhotos(provider, max = 32) {
  const photos = getProfilePhotos(Array.isArray(provider?.photos) ? provider.photos : [], provider);
  const expanded = [];
  for (const url of photos) {
    if (isTrystImageUrl(url)) {
      // One preferred size first to avoid 3x filmstrip spam; ProfileImage fallbacks handle the rest.
      const variants = expandTrystSizeVariants(url);
      expanded.push(variants[0] || url);
    } else {
      expanded.push(url);
    }
  }
  return dedupeUrls(expanded)
    .slice(0, max)
    .map((url) => resolvePublicPhotoUrl(url, provider?.id))
    .filter(Boolean);
}

export function getPrimaryProfilePhoto(provider) {
  const photos = getDisplayProfilePhotos(provider, 1);
  return photos[0] || null;
}

/** Ordered candidate URLs for UI display (R2 first, then best Tryst sizes). */
export function getProfilePhotoCandidates(provider, max = 8) {
  const primary = getDisplayProfilePhotos(provider, max);
  // Build richer fallback chain for the primary card image
  const raw = getProfilePhotos(Array.isArray(provider?.photos) ? provider.photos : [], provider);
  const extras = [];
  for (const url of raw) {
    if (isTrystImageUrl(url)) extras.push(...expandTrystSizeVariants(url));
    else extras.push(url);
  }
  return dedupeUrls([
    ...primary,
    ...extras.map((url) => resolvePublicPhotoUrl(url, provider?.id)).filter(Boolean),
  ]).slice(0, Math.max(max, 8));
}
