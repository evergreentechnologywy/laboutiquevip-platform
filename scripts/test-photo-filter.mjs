import { PrismaClient } from "../backend/generated/prisma-client/index.js";
import { buildPublicPhotoSearchFilter, publicProviderVisibilityWhere } from "../backend/dist/routes/providerVisibility.js";

const prisma = new PrismaClient();

const where = {
  AND: [
    publicProviderVisibilityWhere(),
    await buildPublicPhotoSearchFilter(prisma),
    { location_city: { contains: "Kansas City", mode: "insensitive" } },
  ],
};

console.log("kc", await prisma.provider.count({ where }));
await prisma.$disconnect();
