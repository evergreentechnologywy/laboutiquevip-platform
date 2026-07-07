/**
 * Pre-import verification gate: P411 OR review-site match (TER / PD / TOB).
 * Badges are earned from external signals — not from paid placement.
 */

const P411_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?preferred411\.com\/(?:escort\/)?([Pp]\d{4,})/gi;
const P411_ID_RE = /\bP411\s*#?\s*([Pp]\d{4,})\b/gi;
const TER_URL_RE =
  /https?:\/\/(?:www\.)?theeroticreview\.com\/[^\s)"']+/gi;
const PD_URL_RE =
  /https?:\/\/(?:www\.)?privatedelights\.(?:ch|com)\/[^\s)"']+/gi;
const TOB_URL_RE =
  /https?:\/\/(?:www\.)?theotherboard\.(?:com|net)\/[^\s)"']+/gi;

export function normalizePhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export function normalizeEmail(raw) {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email;
}

function canonicalP411Url(id) {
  const normalized = String(id ?? "").trim();
  if (!normalized) return null;
  const withP = normalized.toUpperCase().startsWith("P") ? normalized.toUpperCase() : `P${normalized}`;
  return `https://www.preferred411.com/${withP}`;
}

export function extractP411FromMarkdown(markdown) {
  const text = String(markdown ?? "");
  for (const re of [P411_URL_RE, P411_ID_RE]) {
    re.lastIndex = 0;
    const match = re.exec(text);
    if (match?.[1]) {
      const id = match[1].toUpperCase().startsWith("P") ? match[1].toUpperCase() : `P${match[1]}`;
      return { p411_id: id, p411_url: canonicalP411Url(id) };
    }
  }
  return { p411_id: null, p411_url: null };
}

function firstUrlMatch(text, re) {
  re.lastIndex = 0;
  const match = re.exec(text);
  return match?.[0]?.split("?")[0] ?? null;
}

export function extractReviewUrlsFromMarkdown(markdown) {
  const text = String(markdown ?? "");
  return {
    ter_url: firstUrlMatch(text, TER_URL_RE),
    pd_url: firstUrlMatch(text, PD_URL_RE),
    tob_url: firstUrlMatch(text, TOB_URL_RE),
  };
}

export async function searchTerByPhone(phone) {
  const lookupUrl = process.env.TER_LOOKUP_URL;
  if (!lookupUrl || !phone) return null;

  const response = await fetch(`${lookupUrl}?phone=${encodeURIComponent(phone)}`, {
    headers: { authorization: `Bearer ${process.env.TER_LOOKUP_TOKEN ?? ""}` },
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data?.profileUrl) return null;
  return {
    provider: "ter",
    url: data.profileUrl,
    rating: data.rating ?? null,
    count: data.reviewCount ?? null,
  };
}

export async function searchP411ByPhone(phone) {
  const lookupUrl = process.env.P411_LOOKUP_URL;
  if (!lookupUrl || !phone) return null;

  const response = await fetch(`${lookupUrl}?phone=${encodeURIComponent(phone)}`, {
    headers: { authorization: `Bearer ${process.env.P411_LOOKUP_TOKEN ?? ""}` },
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data?.profileUrl && !data?.p411Id) return null;
  const id = data.p411Id ?? data.profileId ?? null;
  return {
    p411_id: id ? String(id).toUpperCase() : null,
    p411_url: data.profileUrl ?? (id ? canonicalP411Url(id) : null),
  };
}

function hasReviewMatch(fields) {
  return Boolean(fields.ter_url || fields.pd_url || fields.tob_url);
}

function buildReviewUrlsEntry(match) {
  return {
    provider: match.provider,
    url: match.url,
    rating: match.rating ?? null,
    count: match.count ?? null,
    matched_at: new Date().toISOString(),
  };
}

export function importGateEnabled() {
  return process.env.STRICT_IMPORT_VERIFICATION_GATE !== "0";
}

export function providerHasVerificationBadge(existing) {
  if (!existing) return false;
  return Boolean(
    existing.p411_url ||
      existing.ter_url ||
      existing.pd_url ||
      existing.tob_url ||
      existing.p411_verified_at ||
      existing.review_verified_at,
  );
}

export function passesImportGate(existing, verification) {
  if (!importGateEnabled()) return true;
  if (verification?.importAllowed) return true;
  return providerHasVerificationBadge(existing);
}

/**
 * Resolve P411 + review signals from page markdown and optional phone lookup APIs.
 */
export async function resolveProviderVerification({ phone, email, markdown, includeApiLookup = true }) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();

  const p411FromPage = extractP411FromMarkdown(markdown);
  const reviewFromPage = extractReviewUrlsFromMarkdown(markdown);

  let p411_id = p411FromPage.p411_id;
  let p411_url = p411FromPage.p411_url;
  let ter_url = reviewFromPage.ter_url;
  let pd_url = reviewFromPage.pd_url;
  let tob_url = reviewFromPage.tob_url;
  let review_site_rating = null;
  let review_site_count = null;
  const review_urls = [];

  if (includeApiLookup && normalizedPhone) {
    if (!p411_url) {
      const p411Lookup = await searchP411ByPhone(normalizedPhone);
      if (p411Lookup?.p411_url) {
        p411_id = p411Lookup.p411_id ?? p411_id;
        p411_url = p411Lookup.p411_url;
      }
    }
    if (!ter_url) {
      const terMatch = await searchTerByPhone(normalizedPhone);
      if (terMatch) {
        ter_url = terMatch.url;
        review_site_rating = terMatch.rating;
        review_site_count = terMatch.count;
        review_urls.push(buildReviewUrlsEntry(terMatch));
      }
    }
  }

  if (ter_url && !review_urls.some((row) => row.provider === "ter")) {
    review_urls.push({
      provider: "ter",
      url: ter_url,
      rating: review_site_rating,
      count: review_site_count,
      matched_at: now.toISOString(),
    });
  }
  if (pd_url) {
    review_urls.push({ provider: "pd", url: pd_url, rating: null, count: null, matched_at: now.toISOString() });
  }
  if (tob_url) {
    review_urls.push({ provider: "tob", url: tob_url, rating: null, count: null, matched_at: now.toISOString() });
  }

  const importAllowed = Boolean(p411_url || hasReviewMatch({ ter_url, pd_url, tob_url }));

  return {
    importAllowed,
    p411_id,
    p411_url,
    p411_verified_at: p411_url ? now : null,
    ter_url,
    pd_url,
    tob_url,
    review_verified_at: hasReviewMatch({ ter_url, pd_url, tob_url }) ? now : null,
    review_urls: review_urls.length ? review_urls : null,
    review_site_rating,
    review_site_count,
    review_matched_at: hasReviewMatch({ ter_url, pd_url, tob_url }) ? now : null,
    normalizedPhone,
    normalizedEmail,
  };
}

/** Merge verification fields without wiping prior badges on partial re-scrapes. */
export function mergeVerificationFields(existing, verification) {
  if (!verification) return {};

  const out = {};
  const now = new Date();

  if (verification.p411_url) {
    out.p411_url = verification.p411_url;
    out.p411_id = verification.p411_id ?? null;
    out.p411_verified_at = verification.p411_verified_at ?? now;
  } else if (existing?.p411_url) {
    out.p411_url = existing.p411_url;
    out.p411_id = existing.p411_id ?? null;
    out.p411_verified_at = existing.p411_verified_at ?? null;
  }

  if (verification.ter_url) out.ter_url = verification.ter_url;
  else if (existing?.ter_url) out.ter_url = existing.ter_url;

  if (verification.pd_url) out.pd_url = verification.pd_url;
  else if (existing?.pd_url) out.pd_url = existing.pd_url;

  if (verification.tob_url) out.tob_url = verification.tob_url;
  else if (existing?.tob_url) out.tob_url = existing.tob_url;

  const reviewNow = hasReviewMatch({
    ter_url: out.ter_url ?? verification.ter_url,
    pd_url: out.pd_url ?? verification.pd_url,
    tob_url: out.tob_url ?? verification.tob_url,
  });

  if (reviewNow) {
    out.review_verified_at = verification.review_verified_at ?? existing?.review_verified_at ?? now;
    out.review_matched_at = verification.review_matched_at ?? existing?.review_matched_at ?? now;
  } else if (existing?.review_verified_at) {
    out.review_verified_at = existing.review_verified_at;
    out.review_matched_at = existing.review_matched_at ?? null;
  }

  if (verification.review_urls?.length) {
    const prior = Array.isArray(existing?.review_urls) ? existing.review_urls : [];
    const merged = [...prior];
    for (const entry of verification.review_urls) {
      const idx = merged.findIndex((row) => row?.provider === entry.provider);
      if (idx >= 0) merged[idx] = entry;
      else merged.push(entry);
    }
    out.review_urls = merged;
  }

  if (verification.review_site_rating != null) out.review_site_rating = verification.review_site_rating;
  else if (existing?.review_site_rating != null) out.review_site_rating = existing.review_site_rating;

  if (verification.review_site_count != null) out.review_site_count = verification.review_site_count;
  else if (existing?.review_site_count != null) out.review_site_count = existing.review_site_count;

  return out;
}
