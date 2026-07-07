/** Canonical social / contact link keys stored on Provider.social_media (JSON). */

export const SOCIAL_LINK_FIELDS = [
  { key: "instagram", label: "Instagram", placeholder: "@handle or profile URL" },
  { key: "twitter", label: "X (Twitter)", placeholder: "@handle or profile URL" },
  { key: "onlyfans", label: "OnlyFans", placeholder: "https://onlyfans.com/username" },
  { key: "fansly", label: "Fansly", placeholder: "https://fansly.com/username" },
  { key: "snapchat", label: "Snapchat", placeholder: "username" },
  { key: "telegram", label: "Telegram", placeholder: "@username or t.me link" },
  { key: "whatsapp", label: "WhatsApp", placeholder: "+1… or wa.me link" },
  { key: "website", label: "Website", placeholder: "https://yoursite.com" },
  { key: "linktree", label: "Link-in-bio (Linktree, Beacons, etc.)", placeholder: "https://linktr.ee/…" },
  { key: "tumblr", label: "Tumblr", placeholder: "https://….tumblr.com" },
  { key: "tiktok", label: "TikTok", placeholder: "@handle or profile URL" },
  { key: "youtube", label: "YouTube", placeholder: "Channel or video URL" },
];

export const DIRECTORY_LINK_FIELDS = [
  { key: "p411_url", label: "Preferred411 profile", placeholder: "https://preferred411.com/P…" },
  { key: "ter_url", label: "The Erotic Review", placeholder: "https://…" },
  { key: "pd_url", label: "PrivateDelights", placeholder: "https://…" },
  { key: "tob_url", label: "TheOtherBoard", placeholder: "https://…" },
];

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

function trimValue(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function normalizeOptionalUrl(value) {
  const trimmed = trimValue(value);
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function stripAt(value) {
  return String(value ?? "").replace(/^@+/, "").trim();
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function buildSocialHref(key, rawValue, phoneFallback) {
  const value = trimValue(rawValue);
  if (!value) return null;

  switch (key) {
    case "instagram": {
      if (/^https?:\/\//i.test(value)) return normalizeOptionalUrl(value);
      return `https://instagram.com/${stripAt(value)}`;
    }
    case "twitter": {
      if (/^https?:\/\//i.test(value)) return normalizeOptionalUrl(value);
      const handle = stripAt(value);
      return `https://x.com/${handle}`;
    }
    case "snapchat": {
      if (/^https?:\/\//i.test(value)) return normalizeOptionalUrl(value);
      return `https://www.snapchat.com/add/${stripAt(value)}`;
    }
    case "telegram": {
      if (/^https?:\/\//i.test(value)) return normalizeOptionalUrl(value);
      const handle = stripAt(value);
      return `https://t.me/${handle}`;
    }
    case "whatsapp": {
      if (/^https?:\/\//i.test(value)) return normalizeOptionalUrl(value);
      const digits = digitsOnly(value);
      if (digits.length >= 10) return `https://wa.me/${digits}`;
      return null;
    }
    case "tiktok": {
      if (/^https?:\/\//i.test(value)) return normalizeOptionalUrl(value);
      const handle = stripAt(value);
      return `https://www.tiktok.com/@${handle}`;
    }
    case "onlyfans":
    case "fansly":
    case "tumblr":
    case "youtube":
    case "website":
    case "linktree":
      return normalizeOptionalUrl(value);
    default:
      return normalizeOptionalUrl(value);
  }
}

export function buildTelHref(phone) {
  const digits = digitsOnly(phone);
  if (digits.length < 10) return null;
  return `tel:+${digits.length === 10 ? `1${digits}` : digits}`;
}

export function buildSmsHref(phone) {
  const digits = digitsOnly(phone);
  if (digits.length < 10) return null;
  return `sms:+${digits.length === 10 ? `1${digits}` : digits}`;
}

export function buildMailtoHref(email) {
  const trimmed = trimValue(email);
  if (!trimmed || !trimmed.includes("@")) return null;
  return `mailto:${trimmed}`;
}

export function emptySocialMedia() {
  return Object.fromEntries(SOCIAL_LINK_FIELDS.map(({ key }) => [key, ""]));
}

export function socialMediaFromProvider(provider) {
  const base = emptySocialMedia();
  const raw = provider?.social_media;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  for (const { key } of SOCIAL_LINK_FIELDS) {
    if (typeof raw[key] === "string") base[key] = raw[key];
  }
  return base;
}

export function mergeSocialMedia(existing, incoming, { preserveExisting = true } = {}) {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
  if (!incoming || typeof incoming !== "object") return base;

  for (const [key, value] of Object.entries(incoming)) {
    const normalized = typeof value === "string" ? trimValue(value) : value;
    if (normalized == null) continue;
    if (preserveExisting && base[key]) continue;
    base[key] = normalized;
  }
  return base;
}

export function normalizeSocialMediaInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out = {};
  for (const { key } of SOCIAL_LINK_FIELDS) {
    const raw = input[key];
    if (typeof raw !== "string") continue;
    const trimmed = trimValue(raw);
    if (!trimmed) continue;
    if (["onlyfans", "fansly", "tumblr", "youtube", "website", "linktree"].includes(key)) {
      const url = normalizeOptionalUrl(trimmed);
      if (url) out[key] = url;
      continue;
    }
    out[key] = trimmed.startsWith("@") ? stripAt(trimmed) : trimmed;
  }
  return Object.keys(out).length ? out : null;
}

export function buildSocialMediaPayload(formSocial, existingSocial) {
  const normalized = normalizeSocialMediaInput(formSocial) ?? {};
  const preserved = {};
  if (existingSocial && typeof existingSocial === "object" && !Array.isArray(existingSocial)) {
    for (const [key, value] of Object.entries(existingSocial)) {
      if (SOCIAL_LINK_FIELDS.some(({ key: fieldKey }) => fieldKey === key)) continue;
      if (value == null || value === "") continue;
      preserved[key] = value;
    }
  }
  const merged = { ...preserved, ...normalized };
  return Object.keys(merged).length ? merged : null;
}

export function getVisibleSocialLinks(provider) {
  const social = provider?.social_media;
  if (!social || typeof social !== "object") return [];
  return SOCIAL_LINK_FIELDS.map(({ key, label }) => {
    const raw = social[key];
    if (!raw || typeof raw !== "string") return null;
    const href = buildSocialHref(key, raw, provider?.phone);
    if (!href) return null;
    return { key, label, href, display: raw };
  }).filter(Boolean);
}

export function getContactActions(provider) {
  const actions = [];
  const tel = buildTelHref(provider?.phone);
  const sms = buildSmsHref(provider?.phone);
  const mailto = buildMailtoHref(provider?.email);
  const social = provider?.social_media && typeof provider.social_media === "object" ? provider.social_media : {};

  if (tel) actions.push({ key: "call", label: "Call", href: tel });
  if (sms) actions.push({ key: "text", label: "Text message", href: sms });
  if (mailto) actions.push({ key: "email", label: "Email", href: mailto });

  const whatsappHref = buildSocialHref("whatsapp", social.whatsapp, provider?.phone);
  if (whatsappHref) actions.push({ key: "whatsapp", label: "WhatsApp", href: whatsappHref });

  const telegramHref = buildSocialHref("telegram", social.telegram);
  if (telegramHref) actions.push({ key: "telegram", label: "Telegram", href: telegramHref });

  return actions;
}

export function isLinkInBioHost(hostname) {
  return LINK_IN_BIO_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}
