#!/usr/bin/env node
/** Read-only badge + public catalog counts for verification gate planning. */

import { createPrismaClient } from "./lib/prisma-client.mjs";

const prisma = await createPrismaClient();

const importedWhere = { status: "active", verification_provider: { in: ["eros", "tryst"] } };
const badgeWhere = {
  ...importedWhere,
  OR: [
    { p411_url: { not: null } },
    { ter_url: { not: null } },
    { pd_url: { not: null } },
    { tob_url: { not: null } },
  ],
};

const [activeImported, badged, p411, review, evergreen, publicNow, publicGated] = await Promise.all([
  prisma.provider.count({ where: importedWhere }),
  prisma.provider.count({ where: badgeWhere }),
  prisma.provider.count({ where: { ...importedWhere, p411_url: { not: null } } }),
  prisma.provider.count({
    where: {
      ...importedWhere,
      OR: [{ ter_url: { not: null } }, { pd_url: { not: null } }, { tob_url: { not: null } }],
    },
  }),
  prisma.provider.count({ where: { status: "active", verification_provider: "evergreen" } }),
  prisma.provider.count({
    where: { status: "active", is_profile_approved: true, verification_provider: { in: ["eros", "tryst", "evergreen"] } },
  }),
  prisma.provider.count({
    where: {
      status: "active",
      is_profile_approved: true,
      OR: [
        { verification_provider: "evergreen" },
        {
          verification_provider: { in: ["eros", "tryst"] },
          OR: [
            { p411_url: { not: null } },
            { ter_url: { not: null } },
            { pd_url: { not: null } },
            { tob_url: { not: null } },
          ],
        },
      ],
    },
  }),
]);

console.log(
  JSON.stringify({
    activeImported,
    badged,
    p411,
    review,
    evergreen,
    publicNow,
    publicGated,
    gateWouldHide: publicNow - publicGated,
  }),
);

await prisma.$disconnect();
