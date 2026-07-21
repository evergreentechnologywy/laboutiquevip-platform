/**
 * Browse-directory API client.
 *
 * These endpoints are being rolled out in parallel with the UI. Every helper
 * resolves to `null` on 404 / network failure so pages can gracefully degrade
 * to static fallback data instead of crashing the public experience.
 *
 * Contracts:
 *   GET /api/v1/stats
 *     -> { providers, cities, states, photos }
 *   GET /api/v1/browse/states
 *     -> { states: [{ name, slug, region, providerCount, cityCount }],
 *          regions: { Northeast: [...slugs], ... }, totalProviders, totalCities }
 *   GET /api/v1/browse/states/{slug}
 *     -> { state, providerCount, cities: [{ city, slug, providerCount, verifiedCount }] }
 */

async function getJsonOrNull(path) {
  try {
    const res = await fetch(path, { credentials: "same-origin" });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export function fetchSiteStats() {
  return getJsonOrNull("/api/v1/stats");
}

export function fetchBrowseStates() {
  return getJsonOrNull("/api/v1/browse/states");
}

export function fetchBrowseState(slug) {
  if (!slug) return Promise.resolve(null);
  return getJsonOrNull(`/api/v1/browse/states/${encodeURIComponent(slug)}`);
}
