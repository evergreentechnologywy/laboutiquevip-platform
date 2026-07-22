/**
 * Shared hardened upstream image fetch for photo proxies.
 *
 * Guards against: memory DoS (byte cap), hung upstreams (timeout),
 * SSRF-via-redirect (manual redirect handling + host re-validation),
 * and content-type confusion (forces image/*).
 */

export const MAX_PROXY_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB
const PROXY_FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export type ProxyFetchResult =
  | { ok: true; buffer: Buffer; contentType: string }
  | { ok: false; status: number; error: string };

export async function fetchProxiedImage(
  url: string,
  isAllowedUrl: (url: string) => boolean,
  headers: Record<string, string>,
): Promise<ProxyFetchResult> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await fetch(current, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(PROXY_FETCH_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, status: 502, error: "proxy_error" };
    }

    // Redirect — re-validate the target against the allowlist before following.
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, status: 502, error: "bad_redirect" };
      const next = new URL(location, current).toString();
      if (!isAllowedUrl(next)) {
        return { ok: false, status: 400, error: "redirect_not_allowed" };
      }
      current = next;
      continue;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status === 404 ? 404 : 502,
        error: "upstream_error",
      };
    }

    // Pre-check declared size, then read with a hard cap.
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_PROXY_IMAGE_BYTES) {
      return { ok: false, status: 413, error: "upstream_too_large" };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return { ok: false, status: 502, error: "upstream_not_image" };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return { ok: false, status: 502, error: "upstream_empty" };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_PROXY_IMAGE_BYTES) {
          await reader.cancel().catch(() => undefined);
          return { ok: false, status: 413, error: "upstream_too_large" };
        }
        chunks.push(value);
      }
    } catch {
      return { ok: false, status: 502, error: "proxy_error" };
    }

    return { ok: true, buffer: Buffer.concat(chunks), contentType };
  }

  return { ok: false, status: 502, error: "too_many_redirects" };
}
