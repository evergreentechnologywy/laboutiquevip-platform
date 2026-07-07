#!/usr/bin/env node
/** Grant admin role to LBV owner account via Clerk API (run on VPS with CLERK_SECRET_KEY). */
import crypto from "node:crypto";

const CLERK_SECRET = process.env.CLERK_SECRET_KEY?.trim();
const OWNER_EMAIL = (process.env.OWNER_EMAIL || "evergreentechnology.wy@gmail.com").trim().toLowerCase();
const OWNER_ROLE = process.env.OWNER_ROLE || "admin";

if (!CLERK_SECRET) {
  console.error("CLERK_SECRET_KEY required");
  process.exit(1);
}

async function clerk(pathname, init = {}) {
  const res = await fetch(`https://api.clerk.com/v1${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CLERK_SECRET}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

function genPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

const list = await clerk(`/users?email_address=${encodeURIComponent(OWNER_EMAIL)}&limit=5`);
const existing = Array.isArray(list.body) ? list.body[0] : null;

if (existing?.id) {
  const updated = await clerk(`/users/${existing.id}`, {
    method: "PATCH",
    body: JSON.stringify({ public_metadata: { role: OWNER_ROLE } }),
  });
  if (!updated.ok) {
    console.error(`update failed: ${updated.status}`, updated.body);
    process.exit(1);
  }
  console.log(`OK linked ${OWNER_EMAIL} → admin (clerk_id=${existing.id})`);
  process.exit(0);
}

const password = genPassword();
const created = await clerk("/users", {
  method: "POST",
  body: JSON.stringify({
    email_address: [OWNER_EMAIL],
    password,
    first_name: "Evergreen",
    last_name: "Owner",
    skip_password_checks: true,
    public_metadata: { role: OWNER_ROLE },
  }),
});
if (!created.ok) {
  console.error(`create failed: ${created.status}`, created.body);
  process.exit(1);
}
console.log(`OK invited ${OWNER_EMAIL} → admin (clerk_id=${created.body.id})`);
console.log(`Temporary password (store in vault): ${password}`);
