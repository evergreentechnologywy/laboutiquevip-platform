let prismaClient: any;

const dynamicImport = new Function(
  "modulePath",
  "return import(modulePath)",
) as (modulePath: string) => Promise<any>;

async function loadPrismaModule(): Promise<any> {
  try {
    return await dynamicImport("../generated/prisma-client/index.js");
  } catch {
    return await dynamicImport("@prisma/client");
  }
}

export async function getPrismaClient(): Promise<any> {
  if (prismaClient) {
    return prismaClient;
  }

  const prismaModule = await loadPrismaModule();
  if (!prismaModule?.PrismaClient) {
    throw new Error("PrismaClient is not available. Run prisma generate first.");
  }

  prismaClient = new prismaModule.PrismaClient();
  return prismaClient;
}
