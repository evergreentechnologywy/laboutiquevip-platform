/**
 * Search-based verification matching — TER, TOB, PrivateDelights, P411 via web search.
 * No hosted lookup APIs; uses Jina mirror + optional residential proxy for direct fetches.
 */

import {
  extractP411FromMarkdown,
  extractReviewUrlsFromMarkdown,
  normalizePhone,
} from "./verification-match.mjs";
import { extractContactAndSocialFromMarkdown } from "./extract-social-links.mjs";

const JINA_PREFIX = "https://r.jina.ai/http://";
const JINA_HTTPS_PREFIX = "https://r.jina.ai/https://";

const TER_PROFILE_RE =
  /https?:\/\/(?:www\.)?theeroticreview\.com\/(?:reviews\/show\.asp\?id=\d+|review\/[^/\s)"']+)/gi;
const PD_PROFILE_RE =
  /https?:\/\/(?:www\.)?privatedelights\.(?:ch|com)\/[^\s)"']+/gi;
const TOB_PROFILE_RE =
  /https?:\/\/(?:www\.)?theotherboard\.(?:com|net)\/[^\s)"']+/gi;
const P411_PROFILE_RE =
  /https?:\/\/(?:www\.)?preferred411\.com\/(?:escort\/)?[Pp]\d{4,}/gi;

const DEFAULT_DELAY_MS = Number(process.env.REVIEW_SEARCH_DELAY_MS ?? "600");
const DEFAULT_TIMEOUT_MS = Number(process.env.REVIEW_SEARCH_TIMEOUT_MS ?? "25000");

let lastFetchAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimit() {
  const delay = DEFAULT_DELAY_MS;
  const elapsed = Date.now() - lastFetchAt;
  if (elapsed < delay) await sleep(delay - elapsed);
  lastFetchAt = Date.now();
}

function stripTrailingPunct(url) {
  return String(url ?? "").replace(/[),.;]+$/, "");
}

function uniqueUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    const url = stripTrailingPunct(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function firstUrlMatch(text, re) {
  re.lastIndex = 0;
  const match = re.exec(text);
  return match?.[0]?.split("?")[0] ?? null;
}

function allUrlMatches(text, re) {
  const urls = [];
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) urls.push(m[0]);
  return uniqueUrls(urls);
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

export function formatPhoneVariants(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return [];
  const a = digits.slice(0, 3);
  const b = digits.slice(3, 6);
  const c = digits.slice(6);
  return uniqueStrings([
    digits,
    `${a}${b}${c}`,
    `${a}-${b}-${c}`,
    `(${a}) ${b}-${c}`,
    `+1${digits}`,
    `1-${a}-${b}-${c}`,
  ]);
}

export function phoneAppearsInText(phone, text) {
  const digits = normalizePhone(phone);
  if (!digits || !text) return false;
  const hay = String(text).replace(/\D/g, "");
  return hay.includes(digits);
}

function toMirrorUrl(url) {
  const stripped = String(url).replace(/^https?:\/\//i, "");
  const prefix = url.startsWith("https://") ? JINA_HTTPS_PREFIX : JINA_PREFIX;
  return `${prefix}${stripped}`;
}

async function fetchText(url, { mirror = true, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  await rateLimit();
  const target = mirror ? toMirrorUrl(url) : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      "user-agent": "Mozilla/5.0 (compatible; lbv-review-search/1.0)",
    };
    const response = await fetch(target, { method: "GET", signal: controller.signal, headers });
    if (response.status === 429) {
      await sleep(9000);
      return null;
    }
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildDuckDuckGoUrl(query) {
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

function buildGoogleUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
}

async function searchWeb(query) {
  const engines = [
    buildDuckDuckGoUrl(query),
    buildGoogleUrl(query),
  ];
  for (const url of engines) {
    const text = await fetchText(url, { mirror: true });
    if (text && text.length > 200) return text;
  }
  return null;
}

export function extractReviewMatchesFromSearchText(text) {
  if (!text) return {};
  const review = extractReviewUrlsFromMarkdown(text);
  const p411 = extractP411FromMarkdown(text);
  return {
    ter_url: review.ter_url ?? firstUrlMatch(text, TER_PROFILE_RE),
    pd_url: review.pd_url ?? firstUrlMatch(text, PD_PROFILE_RE),
    tob_url: review.tob_url ?? firstUrlMatch(text, TOB_PROFILE_RE),
    p411_url: p411.p411_url ?? firstUrlMatch(text, P411_PROFILE_RE),
    p411_id: p411.p411_id ?? null,
  };
}

function siteQuery(domain, terms) {
  const quoted = terms.filter(Boolean).map((t) => (/\s/.test(t) ? `"${t}"` : t));
  return `site:${domain} ${quoted.join(" ")}`.trim();
}

async function searchSite(domain, terms) {
  const query = siteQuery(domain, terms);
  const text = await searchWeb(query);
  return extractReviewMatchesFromSearchText(text ?? "");
}

function terDirectSearchUrl(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  return `https://www.theeroticreview.com/reviews/search.asp?searchtype=phone&searchstring=${encodeURIComponent(digits)}`;
}

function tobDirectSearchUrl(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  return `https://www.theotherboard.com/search?phone=${encodeURIComponent(digits)}`;
}

function pdDirectSearchUrl(phone, displayName) {
  const digits = normalizePhone(phone);
  const q = digits ?? String(displayName ?? "").trim();
  if (!q) return null;
  return `https://privatedelights.ch/search?q=${encodeURIComponent(q)}`;
}

export async function fetchMatchedProfileMarkdown(url) {
  if (!url) return null;
  let text = await fetchText(url, { mirror: true });
  if (!text) text = await fetchText(url, { mirror: false });
  return text;
}

export async function enrichFromProfilePage(url, { phone } = {}) {
  const markdown = await fetchMatchedProfileMarkdown(url);
  if (!markdown) return null;

  if (phone && !phoneAppearsInText(phone, markdown)) {
    const nameOnly = /profile|listing|review|escort/i.test(url);
    if (!nameOnly) return null;
  }

  const review = extractReviewUrlsFromMarkdown(markdown);
  const p411 = extractP411FromMarkdown(markdown);
  const contact = extractContactAndSocialFromMarkdown(markdown);

  return {
    ...review,
    p411_url: p411.p411_url,
    p411_id: p411.p411_id,
    social_media: contact.social_media,
    review_url: url,
  };
}

/**
 * @returns {Promise<{ ter?: object, tob?: object, pd?: object, p411?: object, review_url?: string, social_media?: object }>}
 */
export async function searchReviewSitesBySignals({ phone, email, displayName, city, state }) {
  const phoneVariants = formatPhoneVariants(phone);
  const primaryPhone = phoneVariants[0] ?? null;
  const name = String(displayName ?? "").trim();
  const cityTerm = String(city ?? "").trim();
  const stateTerm = String(state ?? "").trim();
  const location = [cityTerm, stateTerm].filter(Boolean).join(" ");

  const nameTerms = [primaryPhone, name, location, email].filter(Boolean);
  const out = {};

  const [terSite, tobSite, pdSite, p411Site, p411NameSite] = await Promise.all([
    searchSite("theeroticreview.com", nameTerms),
    searchSite("theotherboard.com", nameTerms),
    searchSite("privatedelights.ch", nameTerms),
    primaryPhone ? searchSite("preferred411.com", [primaryPhone]) : Promise.resolve({}),
    name && location ? searchSite("preferred411.com", [name, location]) : Promise.resolve({}),
  ]);

  const merged = {
    ter_url: terSite.ter_url,
    tob_url: tobSite.tob_url,
    pd_url: pdSite.pd_url,
    p411_url: p411Site.p411_url ?? p411NameSite.p411_url,
    p411_id: p411Site.p411_id ?? p411NameSite.p411_id,
  };

  if (primaryPhone && !merged.ter_url) {
    const terDirect = await fetchText(terDirectSearchUrl(primaryPhone));
    const terFromDirect = extractReviewMatchesFromSearchText(terDirect ?? "");
    if (terFromDirect.ter_url) merged.ter_url = terFromDirect.ter_url;
  }

  if (primaryPhone && !merged.tob_url) {
    const tobDirect = await fetchText(tobDirectSearchUrl(primaryPhone));
    const tobFromDirect = extractReviewMatchesFromSearchText(tobDirect ?? "");
    if (tobFromDirect.tob_url) merged.tob_url = tobFromDirect.tob_url;
  }

  if ((primaryPhone || name) && !merged.pd_url) {
    const pdDirect = await fetchText(pdDirectSearchUrl(primaryPhone, name));
    const pdFromDirect = extractReviewMatchesFromSearchText(pdDirect ?? "");
    if (pdFromDirect.pd_url) merged.pd_url = pdFromDirect.pd_url;
  }

  if (merged.ter_url) {
    out.ter = { provider: "ter", url: merged.ter_url, rating: null, count: null };
  }
  if (merged.tob_url) out.tob = { provider: "tob", url: merged.tob_url };
  if (merged.pd_url) out.pd = { provider: "pd", url: merged.pd_url };
  if (merged.p411_url) {
    out.p411 = { p411_url: merged.p411_url, p411_id: merged.p411_id ?? null };
  }

  const primaryReviewUrl = merged.ter_url ?? merged.pd_url ?? merged.tob_url ?? null;
  if (primaryReviewUrl) {
    const enriched = await enrichFromProfilePage(primaryReviewUrl, { phone: primaryPhone });
    if (enriched) {
      if (enriched.p411_url && !out.p411) {
        out.p411 = { p411_url: enriched.p411_url, p411_id: enriched.p411_id ?? null };
      }
      if (enriched.ter_url && !out.ter) out.ter = { provider: "ter", url: enriched.ter_url, rating: null, count: null };
      if (enriched.pd_url && !out.pd) out.pd = { provider: "pd", url: enriched.pd_url };
      if (enriched.tob_url && !out.tob) out.tob = { provider: "tob", url: enriched.tob_url };
      if (enriched.social_media && Object.keys(enriched.social_media).length) {
        out.social_media = enriched.social_media;
      }
      out.review_url = enriched.review_url ?? primaryReviewUrl;
    } else {
      out.review_url = primaryReviewUrl;
    }
  }

  return out;
}

export function applySearchResultsToVerification(verification, searchResults) {
  if (!searchResults) return verification;
  const now = new Date();
  let next = { ...verification };

  if (searchResults.p411?.p411_url && !next.p411_url) {
    next = {
      ...next,
      p411_url: searchResults.p411.p411_url,
      p411_id: searchResults.p411.p411_id ?? next.p411_id,
      p411_verified_at: now,
    };
  }

  const review_urls = [...(next.review_urls ?? [])];

  if (searchResults.ter?.url && !next.ter_url) {
    next.ter_url = searchResults.ter.url;
    review_urls.push({
      provider: "ter",
      url: searchResults.ter.url,
      rating: searchResults.ter.rating ?? null,
      count: searchResults.ter.count ?? null,
      matched_at: now.toISOString(),
      source: "search",
    });
  }
  if (searchResults.pd?.url && !next.pd_url) {
    next.pd_url = searchResults.pd.url;
    review_urls.push({
      provider: "pd",
      url: searchResults.pd.url,
      rating: null,
      count: null,
      matched_at: now.toISOString(),
      source: "search",
    });
  }
  if (searchResults.tob?.url && !next.tob_url) {
    next.tob_url = searchResults.tob.url;
    review_urls.push({
      provider: "tob",
      url: searchResults.tob.url,
      rating: null,
      count: null,
      matched_at: now.toISOString(),
      source: "search",
    });
  }

  const hasReview = Boolean(next.ter_url || next.pd_url || next.tob_url);
  if (hasReview) {
    next.review_verified_at = next.review_verified_at ?? now;
    next.review_matched_at = now;
  }

  next.review_urls = review_urls.length ? review_urls : next.review_urls;
  if (searchResults.review_url) next.review_url = searchResults.review_url;
  if (searchResults.social_media) next.social_media = searchResults.social_media;

  next.importAllowed = Boolean(next.p411_url || hasReview);
  return next;
}
