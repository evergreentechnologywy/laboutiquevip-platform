/**
 * Template for new catalog scrape/import sources.
 *
 * Copy to scripts/sources/<name>.mjs, implement run(), then register in
 * scripts/import-orchestrator.config.json under futureSources.
 *
 * Each source MUST set verification_provider on upserted Provider rows so
 * public browse visibility works without platform code changes (add value to
 * PUBLIC_VERIFICATION_PROVIDERS in providerVisibility.ts when launching).
 */
export const SOURCE_ID = "template";
export const VERIFICATION_PROVIDER = "template";

/** @typedef {{ created: number, updated: number, skipped: number, errors: number }} ImportStats */

/**
 * @param {{ dryRun?: boolean, limit?: number }} options
 * @returns {Promise<ImportStats>}
 */
export async function run(options = {}) {
  const stats = { created: 0, updated: 0, skipped: 0, errors: 0 };
  const dynamicImport = new Function("modulePath", "return import(modulePath)");
  const prismaModule = await dynamicImport("@prisma/client");
  const PrismaClient = prismaModule.PrismaClient;
  const prisma = new PrismaClient();

  try {
    // 1. Crawl external listings (jina mirror, API, etc.)
    // 2. Upsert Provider rows with verification_provider = VERIFICATION_PROVIDER
    // 3. Return stats for orchestrator report logs
    void options;
    console.log(`[${SOURCE_ID}] created: ${stats.created} updated: ${stats.updated} skipped: ${stats.skipped} errors: ${stats.errors}`);
    return stats;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Optional reconcile: deactivate profiles missing from latest scrape.
 * @returns {Promise<{ deactivated: number }>}
 */
export async function reconcile() {
  return { deactivated: 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
