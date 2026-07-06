import { PrismaClient } from "../backend/generated/prisma-client/index.js";
import { publicProviderVisibilityWhere } from "../backend/dist/routes/providerVisibility.js";

const prisma = new PrismaClient();

const where = publicProviderVisibilityWhere();
console.log(JSON.stringify(where, null, 2));

try {
  console.log("full", await prisma.provider.count({ where }));
} catch (e) {
  console.log("full ERR", e.message);
}

// strip NOT
const { NOT, ...withoutNot } = where;
try {
  console.log("no NOT", await prisma.provider.count({ where: withoutNot }));
} catch (e) {
  console.log("no NOT ERR", e.message.split("\n")[0]);
}

await prisma.$disconnect();
