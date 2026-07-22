/**
 * Derive the public SEO slug for a provider.
 * Mirrors backend/src/lib/providerSlug.ts (legacyProviderSlug) so client-side
 * links match the sitemap's canonical /profile/:slug URLs.
 */
export function getProviderSlug(provider) {
  if (!provider) return "";
  const username = String(provider.verification_username || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  if (username) return username;

  const match = String(provider.verification_url || "").match(/\/provider\/\d+-(.+)\.html/i);
  if (match?.[1]) return match[1].toLowerCase();

  const displaySlug = String(provider.display_name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (displaySlug.length >= 3) return displaySlug;

  return provider.id || "";
}

/** Canonical public profile path for internal links. */
export function providerProfilePath(provider) {
  const slug = getProviderSlug(provider);
  return slug ? `/profile/${encodeURIComponent(slug)}` : "/browse";
}
