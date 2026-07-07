/**
 * Shared Tryst listing crawl helpers (city discovery, pagination, profile link extraction).
 */

import { TRYST_PILOT_CITIES, TRYST_STATE_SLUGS } from "./tryst-location.mjs";
import { parseImportLimit, sliceToLimit } from "./import-limits.mjs";

export function getTrystCrawlLimits(env = process.env) {
  return {
    maxProfilesPerCity: parseImportLimit(env.TRYST_MAX_PROFILES_PER_CITY, 250),
    maxCitiesPerState: parseImportLimit(env.TRYST_MAX_CITIES_PER_STATE, 5),
    maxListingPagesPerCity: parseImportLimit(env.TRYST_MAX_LISTING_PAGES_PER_CITY, 25),
    delayMs: Number(env.TRYST_DELAY_MS ?? "800"),
  };
}

export function extractProfileLinksFromMarkdown(markdown, limit = 0) {
  const links = new Set();
  const re = /https?:\/\/tryst\.link\/escort\/[a-z0-9-]+/gi;
  for (const match of String(markdown ?? "").matchAll(re)) {
    links.add(match[0].split("?")[0].replace(/\/$/, ""));
  }
  const relRe = /\]\((\/escort\/[a-z0-9-]+)\)/gi;
  for (const match of String(markdown ?? "").matchAll(relRe)) {
    links.add(`https://tryst.link${match[1]}`);
  }
  return sliceToLimit([...links], limit);
}

export function extractCityLinksFromStatePage(markdown, stateSlug, limit = 0) {
  const cities = new Map();
  const re = new RegExp(`tryst\\.link/us/escorts/${stateSlug}/([a-z0-9-]+)`, "gi");
  for (const match of String(markdown ?? "").matchAll(re)) {
    const citySlug = match[1].toLowerCase();
    if (citySlug === stateSlug) continue;
    cities.set(citySlug, (cities.get(citySlug) ?? 0) + 1);
  }
  const sorted = [...cities.entries()].sort((a, b) => b[1] - a[1]).map(([slug]) => slug);
  return sliceToLimit(sorted, limit);
}

export function extractListingPaginationLinks(markdown, currentUrl) {
  const pages = new Set();
  const base = String(currentUrl ?? "").replace(/\?.*$/, "").replace(/\/$/, "");
  const text = String(markdown ?? "");

  for (const match of text.matchAll(/https?:\/\/tryst\.link\/[^\s)"']+(?:\?[^)"'\s]*)?/gi)) {
    const url = match[0].split(")")[0];
    if (!url.includes(base.replace(/^https?:\/\//, "")) && !url.startsWith(base)) continue;
    if (/[?&](?:page|p)=?\d+/i.test(url) || /\/page\/\d+/i.test(url)) {
      pages.add(url.split("#")[0].replace(/\/$/, ""));
    }
  }

  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const href = match[1].trim();
    if (!href || href.startsWith("#")) continue;
    let absolute = href;
    if (href.startsWith("/")) absolute = `https://tryst.link${href}`;
    if (!absolute.startsWith("http")) continue;
    if (!absolute.replace(/\/$/, "").startsWith(base)) continue;
    if (/[?&](?:page|p)=?\d+/i.test(absolute) || /\/page\/\d+/i.test(absolute)) {
      pages.add(absolute.split("#")[0].replace(/\/$/, ""));
    }
  }

  pages.delete(base);
  pages.delete(`${base}/`);
  return [...pages];
}

export async function collectProfileLinksForCity(cityUrl, fetchPageText, limits) {
  const profileLimit = limits.maxProfilesPerCity;
  const maxListingPages = limits.maxListingPagesPerCity;
  const profileLinks = new Set();
  const visitedPages = new Set();
  const queue = [cityUrl.replace(/\/$/, "")];

  while (queue.length > 0 && visitedPages.size < maxListingPages) {
    const pageUrl = queue.shift();
    if (!pageUrl || visitedPages.has(pageUrl)) continue;
    visitedPages.add(pageUrl);

    const listingText = await fetchPageText(pageUrl);
    if (!listingText) continue;

    for (const profileUrl of extractProfileLinksFromMarkdown(listingText, 0)) {
      if (profileLimit > 0 && profileLinks.size >= profileLimit) break;
      profileLinks.add(profileUrl);
    }

    if (profileLimit > 0 && profileLinks.size >= profileLimit) break;

    for (const nextPage of extractListingPaginationLinks(listingText, pageUrl)) {
      if (!visitedPages.has(nextPage) && !queue.includes(nextPage)) {
        queue.push(nextPage);
      }
    }
  }

  return sliceToLimit([...profileLinks], profileLimit);
}

export async function resolveTrystTargetCities({ fullUs, fetchPageText, delayMs, limits, onState }) {
  if (!fullUs) return TRYST_PILOT_CITIES;

  const targets = [];
  const stateSlugs = Object.keys(TRYST_STATE_SLUGS);
  for (const stateSlug of stateSlugs) {
    const stateUrl = `https://tryst.link/us/escorts/${stateSlug}`;
    if (typeof onState === "function") onState(stateSlug);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const text = await fetchPageText(stateUrl);
    if (!text) continue;
    const citySlugs = extractCityLinksFromStatePage(text, stateSlug, limits.maxCitiesPerState);
    for (const citySlug of citySlugs) {
      targets.push({ state: stateSlug, city: citySlug });
    }
  }
  return targets;
}
