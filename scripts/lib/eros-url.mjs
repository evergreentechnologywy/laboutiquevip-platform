/** Canonical helpers for Eros profile URLs and provider identity keys. */

export function canonicalErosProfileUrl(url) {
  return String(url ?? "")
    .trim()
    .toLowerCase()
    .replace(/\?.*$/, "");
}

export function erosFileId(url) {
  const match = String(url ?? "").match(/\/files\/(\d+)\.htm/i);
  return match ? match[1] : null;
}

export function normalizeProviderName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function providerDedupeKey(provider) {
  const fileId = erosFileId(provider.verification_url ?? provider.sourceUrl);
  if (fileId) return `eros:${fileId}`;

  const name = normalizeProviderName(provider.display_name ?? "");
  const city = String(provider.location_city ?? "").toLowerCase().trim();
  const state = String(provider.location_state ?? "").toLowerCase().trim();
  return `name:${name}|${city}|${state}`;
}

export function providerKeepScore(provider) {
  const photos = Array.isArray(provider.photos) ? provider.photos.length : 0;
  let score = photos * 10;
  if (provider.status === "active") score += 1000;
  if (provider.is_verified) score += 500;
  if (provider.is_premium) score += 200;
  if (provider.is_profile_approved) score += 100;
  if (provider.verification_provider === "eros") score += 50;
  const updated = provider.updated_date ? new Date(provider.updated_date).getTime() : 0;
  return score + updated / 1e12;
}
