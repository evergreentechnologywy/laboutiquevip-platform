import type { ApiRequest, ApiResponse } from "../types.js";
import { fetchProxiedImage } from "../lib/proxyFetch.js";

const ALLOWED_EROS_HOSTS = new Set([
  "www.eros.com",
  "i.eros.com",
  "trans.eros.com",
  "massage.eros.com",
]);

function isAllowedErosUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_EROS_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function erosPhotoProxyHandler(request: ApiRequest): Promise<ApiResponse> {
  const upstream = request.query.get("url")?.trim();
  if (!upstream || !isAllowedErosUrl(upstream)) {
    return { statusCode: 400, body: { error: "bad_request" } };
  }

  const result = await fetchProxiedImage(upstream, isAllowedErosUrl, {
    referer: "https://www.eros.com/",
    "user-agent": "Mozilla/5.0 (compatible; laboutiquevip-photo-proxy/1.0)",
  });

  if (!result.ok) {
    return { statusCode: result.status, body: { error: result.error } };
  }

  return {
    statusCode: 200,
    headers: {
      "content-type": result.contentType,
      "cache-control": "public, max-age=86400",
      "content-length": String(result.buffer.length),
    },
    rawBuffer: result.buffer,
  };
}
