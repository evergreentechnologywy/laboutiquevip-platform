#!/usr/bin/env node
/**
 * Soft-hide active providers with no displayable public photos.
 * Mirrors backend providerVisibility photo rules.
 * Soft-hide only: status=inactive + admin_notes tag (rows kept).
 *
 * Usage:
 *   node scripts/hide-no-public-photo-providers.mjs --dry-run
 *   node scripts/hide-no-public-photo-providers.mjs --apply
 */
const dryRun = !process.argv.includes("--apply");
const HIDE_NOTE = "catalog-sync: no-public-photo hide";

const dynamicImport = new Function("modulePath", "return import(modulePath)");

async function createPrismaClient() {
  try {
    const generated = await dynamicImport("../backend/generated/prisma-client/index.js");
    if (generated?.PrismaClient) return new generated.PrismaClient();
  } catch {
    // fallback
  }
  const runtime = await dynamicImport("@prisma/client");
  if (!runtime?.PrismaClient) throw new Error("PrismaClient not available");
  return new runtime.PrismaClient();
}

const prisma = await createPrismaClient();

try {
  const rows = await prisma.$queryRaw`
    SELECT id, display_name, verification_provider, verification_url, location_city, location_state
    FROM "Provider" p
    WHERE p.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(p.photos) = 'array' THEN p.photos ELSE '[]'::jsonb END
        ) AS url
        WHERE (
          url LIKE '%/api/r2-photo/%'
          OR url ~* '(i\\.eros\\.com|eros\\.com/i/)'
          OR url ~* 'media-v[0-9]*\\.tryst\\.'
          OR url ~* 'tryst\\.a4cdn\\.org'
          OR url ~* 'tryst\\.link/'
          OR url ~* '\\.(jpg|jpeg|png|webp|avif|gif)(\\?|$)'
        )
        AND url NOT ILIKE '%sharks_512%'
        AND url NOT ILIKE '%/packs/static/%'
        AND url NOT ILIKE '%placeholder%'
        AND url NOT ILIKE '%default-avatar%'
        AND url NOT ILIKE '%eros-logo%'
      )
    ORDER BY verification_provider NULLS LAST, display_name
  `;

  let hidden = 0;
  const samples = [];
  for (const row of rows) {
    samples.push({
      id: row.id,
      name: row.display_name,
      src: row.verification_provider,
      city: row.location_city,
      state: row.location_state,
    });
    if (!dryRun) {
      await prisma.provider.update({
        where: { id: row.id },
        data: {
          status: "inactive",
          admin_notes: HIDE_NOTE,
          updated_date: new Date(),
        },
      });
    }
    hidden += 1;
  }

  // Also hide known junk names still active (even if they have photos)
  const junk = await prisma.provider.findMany({
    where: {
      status: "active",
      OR: [
        { display_name: { equals: "Page Not Found", mode: "insensitive" } },
        { display_name: { equals: "Not Found", mode: "insensitive" } },
        { display_name: { equals: "404", mode: "insensitive" } },
      ],
    },
    select: { id: true, display_name: true },
  });
  let junkHidden = 0;
  for (const row of junk) {
    if (!dryRun) {
      await prisma.provider.update({
        where: { id: row.id },
        data: {
          status: "inactive",
          admin_notes: "catalog-sync: junk name hide",
          updated_date: new Date(),
        },
      });
    }
    junkHidden += 1;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        noPublicPhotoHidden: hidden,
        junkNameHidden: junkHidden,
        samples: samples.slice(0, 15),
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
