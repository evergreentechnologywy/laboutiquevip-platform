/**
 * Shared Tryst listing crawl helpers (city discovery, pagination, profile link extraction).
 */

import { TRYST_PILOT_CITIES, TRYST_STATE_SLUGS, TRYST_MAJOR_CITIES } from "./tryst-location.mjs";
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
  const maxListingPages = limits.maxListingPagesPerCity || 50;
  const profileLinks = new Set();
  const visitedPages = new Set();
  const base = cityUrl.replace(/\/$/, "");
  const queue = [base];
  
  // Force minimum pages — Jina often fails on page 1 but works on page 2+
  const MIN_PAGES = 5;
  const MAX_EMPTY_PAGES = 3;
  let emptyPages = 0;
  let manualPageGen = 2; // synthetic page counter if pagination links not found

  while (queue.length > 0 && visitedPages.size < maxListingPages) {
    const pageUrl = queue.shift();
    if (!pageUrl || visitedPages.has(pageUrl)) continue;
    visitedPages.add(pageUrl);

    // Retry once on failure — Jina mirror is flaky
    let listingText = await fetchPageText(pageUrl);
    if (!listingText) {
      await new Promise(r => setTimeout(r, 2000));
      listingText = await fetchPageText(pageUrl);
    }
    if (!listingText) continue;

    let newOnThisPage = 0;
    for (const profileUrl of extractProfileLinksFromMarkdown(listingText, 0)) {
      if (profileLimit > 0 && profileLinks.size >= profileLimit) break;
      if (!profileLinks.has(profileUrl)) {
        profileLinks.add(profileUrl);
        newOnThisPage++;
      }
    }

    if (profileLimit > 0 && profileLinks.size >= profileLimit) break;

    // Auto-stop: only after MIN_PAGES minimum
    if (newOnThisPage === 0) {
      emptyPages++;
      if (visitedPages.size >= MIN_PAGES && emptyPages >= MAX_EMPTY_PAGES) break;
    } else {
      emptyPages = 0;
    }

    const paginationLinks = extractListingPaginationLinks(listingText, pageUrl);
    if (paginationLinks.length === 0 && visitedPages.size < maxListingPages && emptyPages < MAX_EMPTY_PAGES) {
      // Synthetic pagination: Tryst uses ?page=N
      const nextPage = `${base}?page=${manualPageGen}`;
      if (!visitedPages.has(nextPage) && !queue.includes(nextPage)) {
        queue.push(nextPage);
        manualPageGen++;
      }
    } else {
      for (const nextPage of paginationLinks) {
        if (!visitedPages.has(nextPage) && !queue.includes(nextPage)) queue.push(nextPage);
      }
    }
  }

  console.log(`  [city-crawl] ${cityUrl.split("/").slice(-2).join("/")}: ${profileLinks.size} profiles / ${visitedPages.size} pages`);
  return sliceToLimit([...profileLinks], profileLimit);
}

export async function resolveTrystTargetCities({ fullUs, stateFilter, fetchPageText, delayMs, limits, onState }) {
  if (!fullUs && !stateFilter) return TRYST_PILOT_CITIES;

  // Fast path: use hardcoded major cities — skip slow state page crawling
  if (stateFilter && stateFilter.length > 0) {
    const targets = [];
    for (const stateSlug of stateFilter) {
      const cities = TRYST_MAJOR_CITIES[stateSlug];
      if (!cities) continue;
      if (typeof onState === "function") onState(stateSlug);
      for (const citySlug of cities) {
        targets.push({ state: stateSlug, city: citySlug });
      }
    }
    console.log(`[tryst-crawl] Fast path: ${targets.length} cities from ${stateFilter.length} states (no discovery crawl)`);
    return targets;
  }

  // Slow path: crawl state pages for city links
  const allStateSlugs = Object.keys(TRYST_STATE_SLUGS);
  const stateSlugs = allStateSlugs;
  const targets = [];
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
