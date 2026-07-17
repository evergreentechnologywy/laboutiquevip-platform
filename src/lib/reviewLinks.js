/**
 * Review / board profile links — only real profile pages, never generic search stubs.
 */

const JUNK_PATH_MARKERS = [
  "/search",
  "/search.asp",
  "/reviews/search",
  "/profiles/search",
  "search?q=",
  "search.asp?",
];

export function isUsableExternalProfileUrl(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return false;
  }
  if (!/^https?:$/i.test(parsed.protocol)) return false;
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  const path = `${parsed.pathname || ""}${parsed.search || ""}`.toLowerCase();
  if (!path || path === "/" || path === "/search" || path === "/search/") return false;
  if (JUNK_PATH_MARKERS.some((m) => path === m || path.startsWith(`${m}?`) || path.endsWith(m))) {
    // Allow if there's a meaningful slug after /search/ (rare)
    if (/\/search\/[^/?#]+/i.test(path)) {
      /* ok */
    } else {
      return false;
    }
  }
  // Host-specific: PD search root
  if (host.includes("privatedelights")) {
    if (/^\/search\/?$/i.test(parsed.pathname)) return false;
    // Require a real profile path, not homepage
    if (!parsed.pathname || parsed.pathname === "/") return false;
  }
  if (host.includes("theeroticreview")) {
    if (/search\.asp$/i.test(parsed.pathname) && !/[?&](id|provider|review|member)=/i.test(parsed.search)) {
      return false;
    }
  }
  // Preferred411 bare domain without profile id
  if ((host.includes("preferred411") || host.includes("p411")) && (!parsed.pathname || parsed.pathname === "/")) {
    return false;
  }
  return true;
}

function hostKind(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    if (host.includes("privatedelights") || host === "pd.com") return "pd";
    if (host.includes("theeroticreview") || host.includes("ter.com")) return "ter";
    if (host.includes("theotherboard") || host.includes("tob.")) return "tob";
    if (host.includes("preferred411") || host.includes("p411")) return "p411";
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Resolve usable review links for UI.
 * @returns {{ ter: string|null, pd: string|null, tob: string|null, p411: string|null, any: boolean }}
 */
export function getProviderReviewLinks(provider) {
  const candidates = {
    ter: provider?.ter_url,
    pd: provider?.pd_url,
    tob: provider?.tob_url,
    p411: provider?.p411_url,
  };

  // Map generic review_url into the right slot if dedicated field empty
  const reviewUrl = String(provider?.review_url || "").trim();
  if (reviewUrl) {
    const kind = hostKind(reviewUrl);
    if (kind && !candidates[kind]) candidates[kind] = reviewUrl;
  }

  // review_urls array (if present)
  const extra = Array.isArray(provider?.review_urls) ? provider.review_urls : [];
  for (const raw of extra) {
    const u = typeof raw === "string" ? raw : raw?.url;
    if (!u) continue;
    const kind = hostKind(u);
    if (kind && !candidates[kind]) candidates[kind] = u;
  }

  const ter = isUsableExternalProfileUrl(candidates.ter) ? String(candidates.ter).trim() : null;
  const pd = isUsableExternalProfileUrl(candidates.pd) ? String(candidates.pd).trim() : null;
  const tob = isUsableExternalProfileUrl(candidates.tob) ? String(candidates.tob).trim() : null;
  const p411 = isUsableExternalProfileUrl(candidates.p411) ? String(candidates.p411).trim() : null;

  return {
    ter,
    pd,
    tob,
    p411,
    any: Boolean(ter || pd || tob || p411),
  };
}
