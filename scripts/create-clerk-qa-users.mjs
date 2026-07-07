#!/usr/bin/env node
/** Create LBV QA Clerk users (run on VPS with CLERK_SECRET_KEY in env). */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CLERK_SECRET = process.env.CLERK_SECRET_KEY?.trim();
if (!CLERK_SECRET) {
  console.error("CLERK_SECRET_KEY required");
  process.exit(1);
}

const ACCOUNTS = [
  { email: "qa-member@evergreentech.site", role: "member", label: "LBV QA Member" },
  { email: "qa-provider@evergreentech.site", role: "provider", label: "LBV QA Provider" },
  { email: "qa-admin@evergreentech.site", role: "admin", label: "LBV QA Admin" },
  { email: "qa-external-dev@evergreentech.site", role: "member", label: "LBV QA External Dev" },
];

function genPassword() {
  return crypto.randomBytes(18).toString("base64url");
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

async function upsertUser({ email, role, label, password }) {
  const list = await clerk(`/users?email_address=${encodeURIComponent(email)}&limit=1`);
  let userId = list.body?.[0]?.id;

  if (!userId) {
    const created = await clerk("/users", {
      method: "POST",
      body: JSON.stringify({
        email_address: [email],
        password,
        first_name: label.split(" ").slice(-2)[0] || "QA",
        last_name: label.split(" ").slice(-1)[0] || role,
        skip_password_checks: true,
        public_metadata: { role },
      }),
    });
    if (!created.ok) {
      throw new Error(`create ${email}: ${created.status} ${JSON.stringify(created.body)}`);
    }
    userId = created.body.id;
  } else {
    const updated = await clerk(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ public_metadata: { role } }),
    });
    if (!updated.ok) {
      throw new Error(`update ${email}: ${updated.status}`);
    }
  }

  return { email, role, userId, password };
}

const outDir = process.argv[2] || "/srv/apps/trystlike/secrets";
const results = [];

for (const acct of ACCOUNTS) {
  const password = genPassword();
  const row = await upsertUser({ ...acct, password });
  results.push(row);
  console.log(`OK ${row.email} (${row.role}) clerk_id=${row.userId}`);
}

const md = [
  "# LBV QA Clerk Accounts",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "**Store in vault only — never commit.**",
  "",
  "| Email | Role | Clerk user ID | Password |",
  "|-------|------|---------------|----------|",
  ...results.map((r) => `| ${r.email} | ${r.role} | ${r.userId} | \`${r.password}\` |`),
  "",
  "## Notes",
  "- Clerk instance: production (`sk_live_*`) on laboutiquevip.net",
  "- Admin role: set via `publicMetadata.role`; DB sync on first `/api/auth/me`",
  "- External dev: GitHub read-only team recommended; no production DB access",
  "",
].join("\n");

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "LBV_QA_ACCOUNTS.md");
fs.writeFileSync(outPath, md, { mode: 0o600 });
console.log(`Wrote ${outPath}`);
