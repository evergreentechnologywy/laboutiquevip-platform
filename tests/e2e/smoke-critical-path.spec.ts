import { test, expect } from "@playwright/test";
import { API_BASE, dismissAgeGate, fetchJson, gotoBrowse } from "./helpers/lbv";

/**
 * Smoke matrix: Login → Listing → Payment (API) → Search visibility
 * Run: LBV_BASE_URL=https://www.laboutiquevip.net npx playwright test smoke-critical-path
 *
 * Authenticated steps require vault QA creds (CLERK_QA_* env vars).
 */

test.describe("Guest — listing & search visibility", () => {
  test("homepage loads and age gate can be dismissed", async ({ page }) => {
    await page.goto("/");
    await dismissAgeGate(page);
    await expect(page).toHaveURL(/laboutiquevip\.net/);
  });

  test("browse Miami returns provider cards", async ({ page, request }) => {
    const api = await fetchJson(request, "/api/v1/search/providers?location=Miami&limit=5");
    expect(api.status).toBe(200);
    const total = (api.body as { total?: number })?.total ?? 0;
    expect(total).toBeGreaterThan(0);

    await gotoBrowse(page, "Miami");
    const cards = page.locator("[data-testid='provider-card'], article, .provider-card");
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
  });

  test("slug profile API and page resolve", async ({ page, request }) => {
    const slug = process.env.LBV_SMOKE_SLUG ?? "rubyvega";
    const api = await fetchJson(request, `/api/v1/providers/by-slug/${slug}`);
    expect(api.status, `slug API for ${slug}`).toBe(200);

    await page.goto(`/profile/${slug}`);
    await dismissAgeGate(page);
    await expect(page.locator("h1, [data-testid='profile-name']").first()).toBeVisible();
    await expect(page.getByText(/404|not found/i)).not.toBeVisible();
  });

  test("system status exposes catalog count", async ({ request }) => {
    const api = await fetchJson(request, "/api/v1/system/status");
    expect(api.status).toBe(200);
    const count = (api.body as { catalog?: { publicCount?: number } })?.catalog?.publicCount;
    expect(count).toBeGreaterThan(100);
  });
});

test.describe("Guest — auth redirects", () => {
  test("admin dashboard redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/admindashboard");
    await dismissAgeGate(page);
    await expect(page).toHaveURL(/\/login/);
    expect(page.url()).toMatch(/next=.*admindashboard/);
  });

  test("dev dashboard redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/devdashboard");
    await dismissAgeGate(page);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Authenticated — login smoke", () => {
  test.skip(!process.env.CLERK_QA_MEMBER_EMAIL, "Set CLERK_QA_MEMBER_EMAIL + CLERK_QA_MEMBER_PASSWORD from vault");

  test("member can sign in and reach account surface", async ({ page }) => {
    const email = process.env.CLERK_QA_MEMBER_EMAIL!;
    const password = process.env.CLERK_QA_MEMBER_PASSWORD!;
    await page.goto(`/login?next=${encodeURIComponent("/browse")}`);
    await dismissAgeGate(page);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /continue|sign in/i }).click();
    await page.waitForURL(/\/browse/, { timeout: 30_000 });
  });
});

test.describe("Payment — order creation (no live charge)", () => {
  test.skip(!process.env.CLERK_QA_PROVIDER_TOKEN, "Set CLERK_QA_PROVIDER_TOKEN (Bearer) for API checkout smoke");

  test("provider package checkout returns test_mode or payment URL", async ({ request }) => {
    const token = process.env.CLERK_QA_PROVIDER_TOKEN!;
    const response = await request.post(`${API_BASE}/api/v1/orders`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        productSku: "lbv-provider-basic-weekly",
        currency: "USD",
      },
    });
    expect([201, 409]).toContain(response.status());
    const body = await response.json();
    if (response.status() === 201) {
      expect(body).toHaveProperty("orderId");
      expect(["test_mode", "live"]).toContain(body.mode);
    }
  });
});
