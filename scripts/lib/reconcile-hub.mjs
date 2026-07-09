/**
 * Per-hub listing success tracking for Eros weekly reconcile deactivation.
 */

/** Normalize hub key (state/city) from a listing page URL. */
export function listingHubKeyFromUrl(url) {
  const listingMatch = String(url ?? "").match(
    /https?:\/\/(?:www|trans|massage)\.eros\.com\/([a-z0-9_-]+)(?:\/([a-z0-9_-]+))?\/[a-z0-9_-]*_escorts\.htm/i,
  );
  if (listingMatch) {
    const state = listingMatch[1].toLowerCase();
    const city = (listingMatch[2] ?? listingMatch[1]).toLowerCase();
    return `${state}/${city}`;
  }

  const fallback = String(url ?? "").match(
    /https?:\/\/(?:www|trans|massage)\.eros\.com\/([a-z0-9_-]+)\/([a-z0-9_-]+)/i,
  );
  if (!fallback) return null;
  return `${fallback[1].toLowerCase()}/${fallback[2].toLowerCase()}`;
}

/** Record one listing fetch attempt for a hub. */
export function recordHubListingAttempt(statsByHub, url, succeeded) {
  const hubKey = listingHubKeyFromUrl(url);
  if (!hubKey) return null;

  const stats = statsByHub.get(hubKey) ?? { success: 0, attempted: 0 };
  stats.attempted += 1;
  if (succeeded) stats.success += 1;
  statsByHub.set(hubKey, stats);
  return hubKey;
}

/** Deactivate only when hub listing fetches are reliable enough. */
export function hubEligibleForDeactivation(statsByHub, hubKey) {
  const stats = statsByHub.get(hubKey);
  if (!stats || stats.success <= 0 || stats.attempted <= 0) return false;
  const ratio = stats.success / stats.attempted;
  // Need multiple successes and majority of listing pages for this hub.
  return stats.success >= 2 && ratio >= 0.6;
}

/** Global gate: skip all deactivation when overall listing scrape was too flaky. */
export function globalDeactivationAllowed(statsByHub, minRatio = 0.65) {
  let success = 0;
  let attempted = 0;
  for (const stats of statsByHub.values()) {
    success += stats.success;
    attempted += stats.attempted;
  }
  if (attempted === 0) return false;
  return success / attempted >= minRatio;
}

/**
 * Skip deactivation when the hub scrape hit its profile cap — the catalog snapshot
 * is incomplete and missing URLs are expected, not delistings.
 */
export function hubScrapeCompleteForDeactivation(hubProfileCounts, hubLimits, hubKey) {
  const limit = hubLimits.get(hubKey);
  if (!limit || limit <= 0) return true;
  const scraped = hubProfileCounts.get(hubKey) ?? 0;
  return scraped < limit;
}
