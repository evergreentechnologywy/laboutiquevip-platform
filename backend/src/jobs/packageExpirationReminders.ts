import { sendPackageExpirationReminderEmail } from "../services/email.js";

interface ReminderInput {
  to: string;
  displayName?: string | null;
  packageName: string;
  expiresOn: string;
}

interface ReminderContext {
  prisma: any;
  now?: Date;
  daysAhead?: number;
  sendReminder?: (input: ReminderInput) => Promise<{ sent: boolean; skipped?: string }>;
}

interface ReminderResult {
  checked: number;
  sent: number;
  skipped: number;
}

interface CleanupContext {
  prisma: any;
  now?: Date;
}

interface CleanupResult {
  expired: number;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export async function runPackageExpirationReminders(context: ReminderContext): Promise<ReminderResult> {
  const now = context.now ?? new Date();
  const daysAhead = context.daysAhead ?? 2;
  const today = toDateOnly(now);
  const windowEnd = toDateOnly(addDays(now, daysAhead));
  const sendReminder = context.sendReminder ?? sendPackageExpirationReminderEmail;

  const providers = await context.prisma.provider.findMany({
    where: {
      ad_package: { not: "none" },
      ad_package_expiry: {
        gte: today,
        lte: windowEnd,
      },
      ad_package_expiration_reminder_sent_at: null,
    },
    select: {
      id: true,
      display_name: true,
      email: true,
      ad_package: true,
      ad_package_expiry: true,
    },
  });

  let sent = 0;
  let skipped = 0;
  for (const provider of providers) {
    if (!provider.email || !provider.ad_package_expiry) {
      skipped += 1;
      continue;
    }

    const result = await sendReminder({
      to: provider.email,
      displayName: provider.display_name,
      packageName: provider.ad_package ?? "paid",
      expiresOn: provider.ad_package_expiry,
    });

    if (result.sent) {
      await context.prisma.provider.update({
        where: { id: provider.id },
        data: { ad_package_expiration_reminder_sent_at: now.toISOString() },
      });
      sent += 1;
    } else {
      skipped += 1;
    }
  }

  return { checked: providers.length, sent, skipped };
}

export async function runPackageExpirationCleanup(context: CleanupContext): Promise<CleanupResult> {
  const now = context.now ?? new Date();
  const today = toDateOnly(now);

  const result = await context.prisma.provider.updateMany({
    where: {
      ad_package: { not: "none" },
      ad_package_expiry: { lt: today },
    },
    data: {
      ad_package: "none",
      ad_package_expiry: null,
      ad_package_expiration_reminder_sent_at: null,
      is_premium: false,
    },
  });

  return { expired: result.count ?? 0 };
}
