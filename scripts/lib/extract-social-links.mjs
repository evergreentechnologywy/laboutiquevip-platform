/**
 * Extract phone, email, social links, and directory URLs from scraped markdown/HTML text.
 * Aggregates ALL social/contact/review links into social_media field for unified storage.
 */

import { extractP411FromMarkdown, extractReviewUrlsFromMarkdown } from "./verification-match.mjs";

/** Review-site hostnames that should be captured in social_media.review_links */
const REVIEW_SITE_HOSTS = [
  "theeroticreview.com",
  "ter.com",
  "privatedelights.ch",
  "privatedelights.com",
  "theotherboard.com",
  "theotherboard.net",
  "preferred411.com",
  "tryst.link",
  "eros.com",
];

function isReviewSiteUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return REVIEW_SITE_HOSTS.some((entry) => host === entry || host.endsWith(`.${entry}`));
  } catch {
    return false;
  }
}

const LINK_IN_BIO_HOSTS = [
  "linktr.ee",
  "beacons.ai",
  "allmylinks.com",
  "hoo.be",
  "bio.site",
  "taplink.cc",
  "campsite.bio",
  "link.me",
  "solo.to",
  "snipfeed.co",
  "msha.ke",
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function trimValue(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function collectUrls(markdown) {
  const urls = [];
  for (const m of markdown.matchAll(/\((https?:\/\/[^)\s]+)\)/gi)) urls.push(m[1]);
  for (const m of markdown.matchAll(/\bhttps?:\/\/[^\s)<>"']+/gi)) urls.push(m[0]);
  for (const m of markdown.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)) urls.push(m[1]);
  return unique(urls.map((u) => normalizeUrl(u.replace(/[),.;]+$/, ""))).filter(Boolean));
}

function stripAt(value) {
  return String(value ?? "").replace(/^@+/, "").trim();
}

function pathUsername(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  return parts[0] ? stripAt(parts[0]) : null;
}

function isLinkInBioHost(hostname) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return LINK_IN_BIO_HOSTS.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

function classifyUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname;

  if (host.includes("instagram.com")) {
    const user = pathUsername(path);
    return user ? { key: "instagram", value: user } : null;
  }
  if (host === "x.com" || host === "twitter.com") {
    const user = pathUsername(path);
    return user && !["home", "share", "intent"].includes(user.toLowerCase())
      ? { key: "twitter", value: user }
      : null;
  }
  if (host.includes("onlyfans.com")) return { key: "onlyfans", value: url };
  if (host.includes("fansly.com") || host === "fans.ly") return { key: "fansly", value: url };
  if (host.includes("tumblr.com")) return { key: "tumblr", value: url };
  if (host.includes("snapchat.com")) {
    const addMatch = path.match(/\/add\/([^/]+)/i);
    if (addMatch) return { key: "snapchat", value: stripAt(addMatch[1]) };
  }
  if (host === "t.me" || host === "telegram.me") {
    const user = pathUsername(path);
    return user ? { key: "telegram", value: user } : null;
  }
  if (host === "wa.me" || host === "api.whatsapp.com") {
    const digits = (path.match(/(\d{10,15})/) ?? [])[1];
    return digits ? { key: "whatsapp", value: digits } : { key: "whatsapp", value: url };
  }
  if (host.includes("tiktok.com")) {
    const atMatch = path.match(/@([^/]+)/);
    if (atMatch) return { key: "tiktok", value: stripAt(atMatch[1]) };
  }
  if (host.includes("youtube.com") || host === "youtu.be") return { key: "youtube", value: url };
  if (isLinkInBioHost(host)) return { key: "linktree", value: url };

  return null;
}

function normalizePhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function extractPhoneEmail(markdown) {
  let phone =
    markdown.match(/href=["']tel:([^"']+)["']/i)?.[1] ??
    markdown.match(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/)?.[0] ??
    null;
  phone = normalizePhone(phone);

  let email =
    markdown.match(/href=["']mailto:([^"'?]+)["']/i)?.[1] ??
    markdown.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] ??
    null;
  email = email ? email.toLowerCase() : null;

  return { phone, email };
}

/**
 * @returns {{ phone: string|null, email: string|null, social_media: Record<string,string>, directory: Record<string,string>, extra_links: string[] }}
 */
export function extractContactAndSocialFromMarkdown(markdown) {
  const social_media = {};
  const directory = { ...extractP411FromMarkdown(markdown), ...extractReviewUrlsFromMarkdown(markdown) };
  const extra_links = [];
  const review_links = [];

  const { phone, email } = extractPhoneEmail(markdown);

  // Aggregate review site URLs from directory extraction into social_media
  if (directory.p411_url) {
    social_media.p411_url = directory.p411_url;
    social_media.p411_id = directory.p411_id;
  }
  if (directory.ter_url) social_media.ter_url = directory.ter_url;
  if (directory.pd_url) social_media.pd_url = directory.pd_url;
  if (directory.tob_url) social_media.tob_url = directory.tob_url;

  for (const url of collectUrls(markdown)) {
    const lower = url.toLowerCase();

    // Capture review site URLs in social_media.review_links
    if (isReviewSiteUrl(url)) {
      review_links.push(url);
      continue;
    }

    // Skip image/CDN URLs — those are stored as photos, not social links
    if (
      /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)(\?|$)/i.test(lower) ||
      /a4cdn\.(?:ch|org)\/profiles\//i.test(lower) ||
      /media.*\.tryst/i.test(lower) ||
      /tryst\.link\/media/i.test(lower) ||
      /cdn\.(?:tryst|imgbox|image)/i.test(lower)
    ) continue;

    // Skip site-internal URLs (eros.com, tryst.link, lboutiquevip) unless already captured
    if (/lboutiquevip\./i.test(lower)) continue;

    const classified = classifyUrl(url);
    if (classified && !social_media[classified.key]) {
      social_media[classified.key] = classified.value;
      continue;
    }

    if (!classified && /^https?:\/\//i.test(url)) {
      extra_links.push(url);
    }
  }

  if (review_links.length) {
    social_media.review_links = unique(review_links).slice(0, 12);
  }

  if (extra_links.length) {
    // Separate personal website URLs from generic links
    const websiteUrls = extra_links.filter(
      (url) => !/eros\.com|tryst\.link|preferred411\.com|theeroticreview\.|ter\.com|privatedelights\.|theotherboard\.com|laboutiquevip\./i.test(url)
    );
    if (websiteUrls.length > 0) {
      social_media.website = websiteUrls[0]; // Primary website URL
    }
    social_media.extra_links = unique(extra_links).slice(0, 12);
  }

  return { phone, email, social_media, directory };
}

export function mergeImportedSocial(existingSocial, extractedSocial, meta = {}) {
  const base =
    existingSocial && typeof existingSocial === "object" && !Array.isArray(existingSocial)
      ? { ...existingSocial }
      : {};

  if (extractedSocial && typeof extractedSocial === "object") {
    for (const [key, value] of Object.entries(extractedSocial)) {
      if (value == null || value === "") continue;
      if (!base[key]) base[key] = value;
    }
  }

  return { ...base, ...meta };
}
