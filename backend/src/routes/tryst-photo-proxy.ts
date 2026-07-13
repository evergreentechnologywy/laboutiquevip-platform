import type { ApiRequest, ApiResponse } from "../types.js";

const ALLOWED_HOST_SUFFIXES = [
  ".tryst.a4cdn.org",
  ".tryst.link",
  "tryst.link",
];

function isAllowedTrystUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "tryst.link" || host.endsWith(".tryst.link")) return true;
    if (host.endsWith(".tryst.a4cdn.org") || host === "tryst.a4cdn.org") return true;
    // media-v2.tryst.* style hosts
    if (/^media-v\d*\.tryst\./.test(host)) return true;
    return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix.replace(/^\./, "") || host.endsWith(suffix));
  } catch {
    return false;
  }
}

export async function trystPhotoProxyHandler(request: ApiRequest): Promise<ApiResponse> {
  const upstream = request.query.get("url")?.trim();
  if (!upstream || !isAllowedTrystUrl(upstream)) {
    return { statusCode: 400, body: { error: "bad_request" } };
  }

  try {
    const response = await fetch(upstream, {
      headers: {
        referer: "https://tryst.link/",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
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
    console.error("Tryst photo proxy error:", error);
    return { statusCode: 502, body: { error: "proxy_error" } };
  }
}
