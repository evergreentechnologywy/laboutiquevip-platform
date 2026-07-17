/**
 * Important, working profile links only — contact + real destinations.
 * Rejects search stubs, bare domains, CDN/image junk, and empty handles.
 */
import {
  buildSocialHref,
  buildTelHref,
  buildSmsHref,
  buildMailtoHref,
  normalizeOptionalUrl,
  SOCIAL_LINK_FIELDS,
} from "@/lib/socialLinks";
import { getProviderReviewLinks, isUsableExternalProfileUrl } from "@/lib/reviewLinks";

const IMAGE_OR_CDN =
  /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)(\?|$)/i;
const JUNK_HOST_OR_PATH =
  /a4cdn\.(?:ch|org)|media-v\d*\.tryst|imagedelivery\.net|\/api\/r2-photo\/|eros-logo|placeholder|packs\/static/i;

export function isWorkingHttpUrl(url) {
  if (!isUsableExternalProfileUrl(url)) return false;
  const value = String(url).trim();
  const lower = value.toLowerCase();
  if (IMAGE_OR_CDN.test(lower)) return false;
  if (JUNK_HOST_OR_PATH.test(lower)) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!u.hostname || !u.hostname.includes(".")) return false;
    // Require some path OR known profile-style host with handle in path
    const path = u.pathname.replace(/\/+$/, "");
    if (!path || path === "") {
      // bare homepage of a personal domain can be OK (model site)
      const host = u.hostname.replace(/^www\./, "");
      if (host.endsWith(".site") || host.endsWith(".com") || host.endsWith(".net") || host.endsWith(".vip")) {
        // allow bare model sites
        return true;
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}

function formatPhoneDisplay(phone) {
  const d = digitsOnly(phone);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith("1")) {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  return String(phone || "").trim();
}

function websiteFromProvider(provider) {
  const candidates = [
    provider?.social_media?.website,
    provider?.website,
    provider?.social_media?.linktree,
  ];
  for (const raw of candidates) {
    const href = normalizeOptionalUrl(raw);
    if (href && isWorkingHttpUrl(href)) return href;
  }
  return null;
}

function verificationListing(provider) {
  const src = String(provider?.verification_provider || "").toLowerCase();
  const url = String(provider?.verification_url || "").trim();
  if (!url || !isWorkingHttpUrl(url)) return null;
  // Eros profile pages, Tryst profiles, evergreen model sites
  if (src === "eros" || /eros\.com\//i.test(url)) {
    return { key: "eros", label: "Eros listing", href: url };
  }
  if (src === "tryst" || /tryst\.link/i.test(url)) {
    return { key: "tryst", label: "Tryst profile", href: url };
  }
  if (src === "evergreen") {
    return { key: "evergreen", label: "Official site", href: url };
  }
  // Generic usable verification URL
  return { key: "listing", label: "Source listing", href: url };
}

/**
 * @returns {{
 *  contact: Array<{key,label,href,display?}>,
 *  social: Array<{key,label,href,display?}>,
 *  boards: Array<{key,label,href}>,
 *  listing: {key,label,href}|null,
 *  website: string|null,
 *  hasAny: boolean
 * }}
 */
export function getProviderImportantLinks(provider) {
  if (!provider) {
    return { contact: [], social: [], boards: [], listing: null, website: null, hasAny: false };
  }

  const contact = [];
  const tel = buildTelHref(provider.phone);
  const sms = buildSmsHref(provider.phone);
  const mail = buildMailtoHref(provider.email);
  const socialRaw =
    provider.social_media && typeof provider.social_media === "object" ? provider.social_media : {};

  if (sms) {
    contact.push({
      key: "text",
      label: "Text",
      href: sms,
      display: formatPhoneDisplay(provider.phone),
    });
  } else if (tel) {
    contact.push({
      key: "call",
      label: "Call",
      href: tel,
      display: formatPhoneDisplay(provider.phone),
    });
  }

  if (mail) {
    contact.push({
      key: "email",
      label: "Email",
      href: mail,
      display: String(provider.email).trim(),
    });
  }

  const wa = buildSocialHref("whatsapp", socialRaw.whatsapp, provider.phone);
  if (wa) contact.push({ key: "whatsapp", label: "WhatsApp", href: wa });

  const tg = buildSocialHref("telegram", socialRaw.telegram);
  if (tg) contact.push({ key: "telegram", label: "Telegram", href: tg });

  // Social — only major ones with valid hrefs
  const socialPriority = ["instagram", "twitter", "onlyfans", "fansly", "tiktok", "snapchat", "youtube"];
  const social = [];
  for (const key of socialPriority) {
    const field = SOCIAL_LINK_FIELDS.find((f) => f.key === key);
    const raw = socialRaw[key];
    if (!raw || typeof raw !== "string") continue;
    const href = buildSocialHref(key, raw, provider.phone);
    if (!href) continue;
    // social hrefs built from handles are fine; absolute ones must pass working check if http
    if (/^https?:\/\//i.test(href) && key !== "instagram" && key !== "twitter" && key !== "tiktok" && key !== "snapchat") {
      if (!isWorkingHttpUrl(href)) continue;
    }
    social.push({ key, label: field?.label || key, href, display: raw });
  }

  const website = websiteFromProvider(provider);
  const listing = verificationListing(provider);
  // Don't duplicate website if same as listing
  const listingHref = listing?.href || null;
  const websiteOut =
    website && listingHref && website.replace(/\/$/, "") === listingHref.replace(/\/$/, "")
      ? null
      : website;

  const review = getProviderReviewLinks(provider);
  const boards = [];
  if (review.p411) boards.push({ key: "p411", label: "Preferred411", href: review.p411 });
  if (review.ter) boards.push({ key: "ter", label: "The Erotic Review", href: review.ter });
  if (review.pd) boards.push({ key: "pd", label: "PrivateDelights", href: review.pd });
  if (review.tob) boards.push({ key: "tob", label: "TheOtherBoard", href: review.tob });

  const hasAny =
    contact.length > 0 ||
    social.length > 0 ||
    boards.length > 0 ||
    Boolean(websiteOut) ||
    Boolean(listing);

  return {
    contact,
    social,
    boards,
    listing,
    website: websiteOut,
    hasAny,
  };
}
