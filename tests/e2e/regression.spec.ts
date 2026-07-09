import { test, expect } from "@playwright/test";
import { API_BASE, dismissAgeGate, fetchJson, gotoBrowse } from "./helpers/lbv";

/**
 * Regression pack aligned with Evergreen vault QA scope (2026-07-08).
 * Areas: search/filters, session/auth, billing/credits, media CDN, admin moderation.
 */

test.describe("1 — Search & filtration integrity", () => {
  test("city filter returns subset of national search", async ({ request }) => {
    const all = await fetchJson(request, "/api/v1/search/providers?limit=1");
    const miami = await fetchJson(request, "/api/v1/search/providers?location=Miami&limit=1");
    const nyc = await fetchJson(request, "/api/v1/search/providers?location=New%20York&limit=1");

    expect(all.status).toBe(200);
    expect(miami.status).toBe(200);
    expect(nyc.status).toBe(200);

    const allTotal = (all.body as { total?: number }).total ?? 0;
    const miamiTotal = (miami.body as { total?: number }).total ?? 0;
    const nycTotal = (nyc.body as { total?: number }).total ?? 0;

    expect(miamiTotal).toBeGreaterThan(0);
    expect(miamiTotal).toBeLessThanOrEqual(allTotal);
    expect(nycTotal).toBeGreaterThan(0);
  });

  test("premium and verified filters are accepted", async ({ request }) => {
    const res = await fetchJson(request, "/api/v1/search/providers?premium=true&verified=true&limit=3");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
  });

  test("location picker API returns valid states", async ({ request }) => {
    const res = await fetchJson(request, "/api/v1/search/locations");
    expect(res.status).toBe(200);
    const body = res.body as { states?: { code?: string; cities?: unknown[] }[] };
    expect(Array.isArray(body.states)).toBe(true);
    expect(body.states!.length).toBeGreaterThan(0);
    expect(body.states![0]).toHaveProperty("code");
  });

  test("invalid injection payloads do not 500", async ({ request }) => {
    const payloads = ["%27%20OR%201%3D1--", "<script>alert(1)</script>", "a%25%25b"];
    for (const q of payloads) {
      const res = await fetchJson(request, `/api/v1/search/providers?q=${q}&limit=5`);
      expect(res.status, `q=${q}`).not.toBe(500);
    }
  });
});

test.describe("2 — Session & auth stability", () => {
  test("health endpoint is healthy", async ({ request }) => {
    const res = await fetchJson(request, "/api/health");
    expect(res.status).toBe(200);
  });

  test("admin reports denied for guests", async ({ request }) => {
    const res = await fetchJson(request, "/api/admin/reports");
    expect([401, 403, 404]).toContain(res.status);
  });

  test("auth/me without token returns guest or 401", async ({ request }) => {
    const res = await fetchJson(request, "/api/auth/me");
    expect([200, 401]).toContain(res.status);
  });

  test.skip(!process.env.CLERK_QA_ADMIN_TOKEN, "Set CLERK_QA_ADMIN_TOKEN for admin API smoke");

  test("admin reports allowed with admin token", async ({ request }) => {
    const res = await request.fetch(`${API_BASE}/api/admin/reports`, {
      headers: { Authorization: `Bearer ${process.env.CLERK_QA_ADMIN_TOKEN}` },
    });
    expect(res.status()).toBe(200);
  });
});

test.describe("3 — Billing & credit allocations (read-only)", () => {
  test.skip(!process.env.CLERK_QA_ADMIN_TOKEN, "Admin token required");

  test("billing reconciliation endpoint returns invoice rows", async ({ request }) => {
    const res = await request.fetch(`${API_BASE}/api/admin/billing/reconciliation?limit=5`, {
      headers: { Authorization: `Bearer ${process.env.CLERK_QA_ADMIN_TOKEN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("items");
  });
});

test.describe("4 — Media pipeline (CDN proxies)", () => {
  test("r2-photo proxy returns image for known provider", async ({ request }) => {
    const slug = process.env.LBV_SMOKE_SLUG ?? "rubyvega";
    const profile = await fetchJson(request, `/api/v1/providers/by-slug/${slug}`);
    test.skip(profile.status !== 200, `Profile ${slug} unavailable`);

    const photos = (profile.body as { photos?: string[] }).photos ?? [];
    const r2 = photos.find((p) => p.includes("/api/r2-photo/"));
    test.skip(!r2, "No r2-photo URL on profile");

    const res = await request.get(`${API_BASE}${r2}`);
    expect(res.status()).toBe(200);
    const ct = res.headers()["content-type"] ?? "";
    expect(ct).toMatch(/image\//);
  });

  test("browse page loads without uncaught 500 on static assets", async ({ page }) => {
    const failures: string[] = [];
    page.on("response", (r) => {
      if (r.status() >= 500) failures.push(`${r.status()} ${r.url()}`);
    });
    await gotoBrowse(page, "Miami");
    const hard500 = failures.filter((f) => !f.includes("/api/"));
    expect(hard500).toEqual([]);
  });
});

test.describe("5 — Admin moderation surfaces", () => {
  test("guest cannot access admin dashboard UI", async ({ page }) => {
    await page.goto("/admindashboard");
    await dismissAgeGate(page);
    await expect(page).toHaveURL(/login/);
  });

  test.skip(!process.env.CLERK_QA_ADMIN_EMAIL, "Admin Clerk creds required");

  test("admin can open reports queue UI", async ({ page }) => {
    await page.goto(`/login?next=${encodeURIComponent("/admindashboard")}`);
    await dismissAgeGate(page);
    await page.getByLabel(/email/i).fill(process.env.CLERK_QA_ADMIN_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.CLERK_QA_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: /continue|sign in/i }).click();
    await page.waitForURL(/admindashboard/, { timeout: 30_000 });
    await expect(page.getByText(/report|moderation|dashboard/i).first()).toBeVisible();
  });
});
