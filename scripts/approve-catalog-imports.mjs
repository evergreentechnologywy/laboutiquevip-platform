/**
 * Reversible bulk-approve for imported catalog rows blocked only by is_profile_approved=false.
 * Qualifies: active + eros|tryst|evergreen + has photos + not junk name.
 * Tag: admin_notes contains lbv-auto-approve-catalog-2026-08-15
 * Usage: node scripts/approve-catalog-imports.mjs [--apply]
 */
import { PrismaClient } from "../backend/generated/prisma-client/index.js";

const APPLY = process.argv.includes("--apply");
const TAG = "lbv-auto-approve-catalog-2026-08-15";
const prisma = new PrismaClient();

function noteWithTag(existing) {
  const cur = String(existing || "").trim();
  if (!cur) return TAG;
  if (cur.includes(TAG)) return cur;
  return `${cur} | ${TAG}`;
}

async function main() {
  const candidates = await prisma.$queryRaw`
    SELECT id, display_name, verification_provider, location_city, admin_notes
    FROM "Provider"
    WHERE status = 'active'
      AND COALESCE(is_profile_approved, false) = false
      AND verification_provider = ANY(${["eros", "tryst", "evergreen"]}::text[])
      AND photos IS NOT NULL
      AND jsonb_typeof(photos) = 'array'
      AND COALESCE(jsonb_array_length(photos), 0) > 0
      AND display_name IS NOT NULL
      AND btrim(display_name) <> ''
      AND display_name !~* '(batch|simulation|^test$|^test | test$)'
      AND lower(display_name) NOT IN ('page not found', 'not found', '404', 'jarvis test listing')
    ORDER BY updated_date DESC NULLS LAST
  `;

  const byProv = {};
  for (const row of candidates) {
    byProv[row.verification_provider] = (byProv[row.verification_provider] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        count: candidates.length,
        byProv,
        sample: candidates.slice(0, 8).map((r) => ({
          id: r.id,
          display_name: r.display_name,
          verification_provider: r.verification_provider,
          location_city: r.location_city,
        })),
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  const chunk = 200;
  for (let i = 0; i < candidates.length; i += chunk) {
    const batch = candidates.slice(i, i + chunk);
    await prisma.$transaction(
      batch.map((row) =>
        prisma.provider.update({
          where: { id: row.id },
          data: {
            is_profile_approved: true,
            updated_date: new Date(),
            admin_notes: noteWithTag(row.admin_notes),
          },
        }),
      ),
    );
    updated += batch.length;
    if (updated % 1000 === 0 || updated === candidates.length) {
      console.error(`updated ${updated}/${candidates.length}`);
    }
  }

  console.log(JSON.stringify({ applied: updated, tag: TAG }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
