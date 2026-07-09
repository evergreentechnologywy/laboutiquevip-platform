import fs from "node:fs";
import path from "node:path";
import type { BrowserContext } from "@playwright/test";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".txt": "text/plain",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * Serve the locally built `dist/` bundle on the production origin.
 *
 * The prod Clerk instance is domain-locked, so a plain localhost preview never
 * finishes auth loading. Instead, tests keep the production baseURL and this
 * route intercepts document/asset requests to fulfill them from LBV_LOCAL_DIST,
 * while /api/* and third-party requests (Clerk, CDN) hit the real network.
 *
 * Enable with: LBV_LOCAL_DIST=../dist (path relative to tests/ or absolute).
 */
export async function installLocalDistRoutes(context: BrowserContext): Promise<void> {
  const distEnv = process.env.LBV_LOCAL_DIST;
  if (!distEnv) return;
  const distDir = path.resolve(distEnv);
  const baseHost = new URL(process.env.LBV_BASE_URL ?? "https://www.laboutiquevip.net").host;

  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.host !== baseHost) return route.fallback();
    if (url.pathname.startsWith("/api/")) return route.fallback();

    let filePath = path.join(distDir, decodeURIComponent(url.pathname));
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, "index.html");
    }
    const contentType = CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream";
    return route.fulfill({ path: filePath, contentType });
  });
}
