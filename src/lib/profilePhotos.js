const JUNK_SUBSTRINGS = [
  "/api/r2-photo/",
  "theeroticreview.com/library/",
  "coop.theeroticreview.com/hit.php",
  "eros-logo",
  "loader.php",
];

const ALLOWED_HOST_PATTERNS = [
  /ultragfe\.com\/images/i,
  /photos\.skipsweb\.com/i,
  /imagedelivery\.net/i,
  /i\.eros\.com/i,
  /media-v\d*\.tryst\./i,
  /tryst\.a4cdn\.org/i,
];

export function isValidProfilePhoto(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (JUNK_SUBSTRINGS.some((part) => lower.includes(part))) return false;
  if (lower.endsWith("lamp.png")) return false;
  if (lower.includes(".js")) return false;
  if (lower.includes(".html")) return false;
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

/**
 * Ensures a photo URL belongs to the provider (phone + source slug + display name).
 */
export function photoMatchesProvider(url, provider) {
  if (!isValidProfilePhoto(url)) return false;

  const lower = String(url).toLowerCase();
  const filename = lower.split("/").pop() || lower;
  const pathBlob = lower.replace(/^https?:\/\/[^/]+\//, "").replace(/[^a-z0-9]/g, " ");

  const providerPhone = String(provider?.phone || "").replace(/\D/g, "");
  const urlPhone = extractPhoneFromPhotoUrl(url);
  const slugTokens = extractVerificationSlugTokens(provider?.verification_url);
  const slugHits = slugTokens.filter((token) => pathBlob.includes(token)).length;

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

  const nameHits = nameTokens.filter((token) => pathBlob.includes(token)).length;
  if (nameTokens.length >= 2 && nameHits >= 2) return true;
  if (nameTokens.length === 1 && nameHits >= 1) return true;

  if (/^[a-f0-9]{16,}\.[a-z0-9]+$/i.test(filename)) {
    return false;
  }

  return false;
}

export function isR2PhotoUrl(url) {
  return String(url || "").includes("/api/r2-photo/");
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
  return (
    /media-v\d*\.tryst\./i.test(lower) ||
    /tryst\.a4cdn\.org/i.test(lower) ||
    /(?:^|\/\/)(?:[\w-]+\.)?tryst\.link\//i.test(lower)
  );
}

/**
 * Prefer larger Tryst derivatives when the scrape stored /small.*.
 * Returns [preferred, ...fallbacks] for a single source URL.
 */
export function expandTrystSizeVariants(url) {
  const value = String(url || "").trim();
  if (!value || !isTrystImageUrl(value)) return [value].filter(Boolean);

  const match = value.match(/\/(small|medium|large)\.(avif|jpe?g|webp|png)$/i);
  if (!match) return [value];

  const ext = match[2];
  const base = value.slice(0, match.index);
  // Prefer large for cards/profiles; keep medium/small as load fallbacks.
  const order = ["large", "medium", "small"];
  return dedupeUrls(order.map((size) => `${base}/${size}.${ext}`));
}

/**
 * Gallery URLs for display. Prefers R2, keeps first-party scrape CDNs (Eros/Tryst),
 * then other provider-matched photos (identity gate for ultragfe cross-contamination).
 */
export function getProfilePhotos(photos, provider) {
  if (!Array.isArray(photos)) return [];

  // R2 paths are listed in JUNK_SUBSTRINGS for scrape cleanup, but are valid for display.
  const r2 = photos.filter(isR2PhotoUrl);
  const valid = photos.filter(isValidProfilePhoto);
  if (!provider) return dedupeUrls([...r2, ...valid]);

  // Eros/Tryst CDN URLs are scraped from the provider's own listing — trust them.
  // photoMatchesProvider rejects UUID CDN filenames and was hiding most Tryst cards.
  const eros = valid.filter(isErosImageUrl);
  const tryst = valid.filter(isTrystImageUrl);
  const other = valid.filter(
    (url) => !isErosImageUrl(url) && !isTrystImageUrl(url) && photoMatchesProvider(url, provider),
  );
  return dedupeUrls([...r2, ...eros, ...tryst, ...other]);
}

/**
 * Returns a browser-safe photo URL: r2-photo passthrough, eros.com via backend proxy.
 */
export function resolvePublicPhotoUrl(src, providerId) {
  const value = String(src || "").trim();
  if (!value) return null;

  if (isR2PhotoUrl(value)) {
    // Prefer site-relative path so the active origin serves the proxy.
    const idx = value.indexOf("/api/r2-photo/");
    return idx >= 0 ? value.slice(idx) : value;
  }

  if (isErosImageUrl(value)) {
    const params = new URLSearchParams({ url: value });
    if (providerId) params.set("providerId", String(providerId));
    return `/api/eros-photo?${params.toString()}`;
  }

  return value;
}

export function getDisplayProfilePhotos(provider, max = 32) {
  const photos = getProfilePhotos(Array.isArray(provider?.photos) ? provider.photos : [], provider);
  const expanded = [];
  for (const url of photos) {
    if (isTrystImageUrl(url)) {
      expanded.push(...expandTrystSizeVariants(url));
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
  return getDisplayProfilePhotos(provider, max);
}
