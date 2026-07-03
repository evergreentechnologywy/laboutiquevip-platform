import type { ApiRequest, ApiResponse } from "../types.js";

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

  try {
    const response = await fetch(upstream, {
      headers: {
        referer: "https://www.eros.com/",
        "user-agent": "Mozilla/5.0 (compatible; laboutiquevip-photo-proxy/1.0)",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return { statusCode: response.status === 404 ? 404 : 502, body: { error: "upstream_error" } };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return {
      statusCode: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400",
        "content-length": String(buffer.length),
      },
      rawBuffer: buffer,
    };
  } catch (error) {
    console.error("Eros photo proxy error:", error);
    return { statusCode: 502, body: { error: "proxy_error" } };
  }
}
