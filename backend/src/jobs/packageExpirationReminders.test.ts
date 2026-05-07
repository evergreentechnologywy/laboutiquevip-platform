import test from "node:test";
import assert from "node:assert/strict";
import { runPackageExpirationCleanup, runPackageExpirationReminders } from "./packageExpirationReminders.js";

test("runPackageExpirationReminders emails providers expiring soon and marks reminder time", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];

  const prisma = {
    provider: {
      findMany: async () => [
        {
          id: "provider-expiring",
          display_name: "Ava",
          email: "ava@example.com",
          ad_package: "featured",
          ad_package_expiry: "2026-05-08",
          ad_package_expiration_reminder_sent_at: null,
        },
      ],
      update: async ({ where, data }: any) => {
        updates.push({ where, data });
        return { id: where.id, ...data };
      },
    },
  };

  const result = await runPackageExpirationReminders({
    prisma,
    now: new Date("2026-05-07T12:00:00Z"),
    sendReminder: async (input: { to: string; packageName: string; expiresOn: string }) => {
      sent.push(input);
      return { sent: true };
    },
  });

  assert.deepEqual(result, { checked: 1, sent: 1, skipped: 0 });
  assert.equal(sent[0]?.to, "ava@example.com");
  assert.equal(sent[0]?.packageName, "featured");
  assert.equal(sent[0]?.expiresOn, "2026-05-08");
  const update = updates[0] as { where: { id: string }; data: Record<string, unknown> };
  assert.equal(update.where.id, "provider-expiring");
  const updateData = update.data;
  assert.match(String(updateData.ad_package_expiration_reminder_sent_at), /^2026-05-07T12:00:00/);
});

test("runPackageExpirationCleanup downgrades expired paid packages", async () => {
  const updates: Array<Record<string, unknown>> = [];

  const prisma = {
    provider: {
      updateMany: async ({ where, data }: any) => {
        updates.push({ where, data });
        return { count: 2 };
      },
    },
  };

  const result = await runPackageExpirationCleanup({
    prisma,
    now: new Date("2026-05-07T12:00:00Z"),
  });

  assert.deepEqual(result, { expired: 2 });
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0]?.where, {
    ad_package: { not: "none" },
    ad_package_expiry: { lt: "2026-05-07" },
  });
  assert.deepEqual(updates[0]?.data, {
    ad_package: "none",
    is_premium: false,
  });
});
