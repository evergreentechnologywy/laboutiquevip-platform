import { getPrismaClient } from "../db/prisma.js";
import { runPackageExpirationCleanup, runPackageExpirationReminders } from "./packageExpirationReminders.js";

async function main(): Promise<void> {
  const prisma = await getPrismaClient();
  try {
    const cleanup = await runPackageExpirationCleanup({ prisma });
    const result = await runPackageExpirationReminders({ prisma });
    process.stdout.write(`[package-expiration-reminders] ${JSON.stringify({ cleanup, reminders: result })}\n`);
  } finally {
    await prisma.$disconnect?.();
  }
}

main().catch((error) => {
  console.error("[package-expiration-reminders] failed", error);
  process.exit(1);
});
