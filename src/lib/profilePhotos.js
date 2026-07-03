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

export function getProfilePhotos(photos, provider) {
  if (!Array.isArray(photos)) return [];
  const valid = photos.filter(isValidProfilePhoto);
  if (!provider) return dedupeUrls(valid);
  return dedupeUrls(valid.filter((url) => photoMatchesProvider(url, provider)));
}

export function isR2PhotoUrl(url) {
  return String(url || "").includes("/api/r2-photo/");
}

export function isErosImageUrl(url) {
  const lower = String(url || "").trim().toLowerCase();
  if (!lower) return false;
  return /eros\.com\/i\//.test(lower) || /:\/\/i\.eros\.com\//.test(lower);
}

/**
 * Returns a browser-safe photo URL: r2-photo passthrough, eros.com via backend proxy.
 */
export function resolvePublicPhotoUrl(src, providerId) {
  const value = String(src || "").trim();
  if (!value) return null;

  if (isR2PhotoUrl(value)) {
    return value;
  }

  if (isErosImageUrl(value)) {
    const params = new URLSearchParams({ url: value });
    if (providerId) params.set("providerId", String(providerId));
    return `/api/eros-photo?${params.toString()}`;
  }

  return value;
}

export function getPrimaryProfilePhoto(provider) {
  const photos = Array.isArray(provider?.photos) ? provider.photos : [];
  const r2Photos = photos.filter(isR2PhotoUrl);
  const filtered = getProfilePhotos(photos, provider);
  const primary = r2Photos[0] || filtered[0] || null;
  return primary ? resolvePublicPhotoUrl(primary, provider?.id) : null;
}
