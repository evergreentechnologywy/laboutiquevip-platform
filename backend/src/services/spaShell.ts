import fs from "node:fs";
import path from "node:path";

interface SpaBootstrap {
  headTags: string;
  bodyTags: string;
}

let cachedBootstrap: SpaBootstrap | null | undefined;

function findIndexHtmlPath(): string | null {
  const envRoot = process.env.FRONTEND_DIST?.trim();
  const candidates = [
    envRoot ? path.join(envRoot, "index.html") : null,
    path.resolve(process.cwd(), "dist", "index.html"),
    path.resolve(process.cwd(), "..", "dist", "index.html"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function extractSpaBootstrap(indexHtml: string): SpaBootstrap {
  const headTags: string[] = [];
  const bodyTags: string[] = [];

  for (const match of indexHtml.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (/rel=["'](?:stylesheet|modulepreload)["']/i.test(tag)) {
      headTags.push(tag);
    }
  }

  for (const match of indexHtml.matchAll(/<script\b[^>]*type=["']module["'][^>]*>\s*<\/script>/gi)) {
    bodyTags.push(match[0]);
  }

  return {
    headTags: headTags.join("\n  "),
    bodyTags: bodyTags.join("\n  "),
  };
}

/** Vite entry assets from dist/index.html for hydrating SSR public pages. */
export function getSpaBootstrap(): SpaBootstrap {
  if (cachedBootstrap !== undefined) {
    return cachedBootstrap ?? { headTags: "", bodyTags: "" };
  }

  const indexPath = findIndexHtmlPath();
  if (!indexPath) {
    cachedBootstrap = null;
    return { headTags: "", bodyTags: "" };
  }

  try {
    const indexHtml = fs.readFileSync(indexPath, "utf8");
    cachedBootstrap = extractSpaBootstrap(indexHtml);
    return cachedBootstrap;
  } catch {
    cachedBootstrap = null;
    return { headTags: "", bodyTags: "" };
  }
}

/** Test helper — bust cached dist/index.html reads. */
export function clearSpaBootstrapCache(): void {
  cachedBootstrap = undefined;
}
