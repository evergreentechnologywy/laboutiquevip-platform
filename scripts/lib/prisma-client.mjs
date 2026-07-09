/**
 * Resolve PrismaClient from backend/generated/prisma-client (custom output path).
 * Avoid @prisma/client default — it is not initialized when output is customized.
 */

const dynamicImport = new Function("modulePath", "return import(modulePath)");

function repoRootFromMeta() {
  return new URL("../..", import.meta.url).pathname;
}

export function prismaClientCandidates() {
  const root = process.env.REPO_DIR || repoRootFromMeta();
  return [
    `${root}/backend/generated/prisma-client/index.js`,
    new URL("../../backend/generated/prisma-client/index.js", import.meta.url).href,
    "/srv/apps/trystlike/repo/backend/generated/prisma-client/index.js",
  ];
}

export async function createPrismaClient() {
  for (const candidate of prismaClientCandidates()) {
    try {
      const mod = await dynamicImport(candidate);
      if (mod?.PrismaClient) return new mod.PrismaClient();
    } catch {
      // try next path
    }
  }
  throw new Error(
    "PrismaClient not available. Run `npm run db:generate` in repo root (backend/generated/prisma-client).",
  );
}
