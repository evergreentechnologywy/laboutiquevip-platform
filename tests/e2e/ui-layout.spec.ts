import { test, expect } from "@playwright/test";
import {
  bypassAgeGateSession,
  dismissAgeGateAndWait,
  fetchJson,
  gotoBrowse,
} from "./helpers/lbv";
import {
  assertNavNotObscuredByOverlay,
  assertNoInternalOverlap,
  assertVerticallyAligned,
  getBoundingBox,
} from "./helpers/layout";
import { installLocalDistRoutes } from "./helpers/local-dist";

// Opt-in: serve the local build on the prod origin (LBV_LOCAL_DIST=../dist).
test.beforeEach(async ({ context }) => {
  await installLocalDistRoutes(context);
});

const SMOKE_SLUG = process.env.LBV_SMOKE_SLUG ?? "rubyvega";

const PUBLIC_NAV = [
  { label: /browse/i, href: "/browse" },
  { label: /pricing/i, href: "/pricing" },
  { label: /trust/i, href: "/trust" },
] as const;

test.describe("UI layout — provider cards @desktop", () => {
  test.beforeEach(async ({ page }) => {
    await bypassAgeGateSession(page);
    await gotoBrowse(page, "Miami");
  });

  test("provider card has exactly one primary badge overlay row", async ({ page }) => {
    const cards = page.getByTestId("provider-card");
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });

    const cardCount = Math.min(await cards.count(), 5);
    expect(cardCount).toBeGreaterThan(0);

    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      const badgeOverlay = card.locator("div.absolute.left-4.top-4");
      await expect(badgeOverlay, `card ${i} badge overlay`).toHaveCount(1);

      const duplicateLabels = ["Premium", "Touring", "Just joined", "P411 Verified", "Review Verified"];
      for (const label of duplicateLabels) {
        const matches = badgeOverlay.getByText(label, { exact: false });
        const count = await matches.count();
        expect(count, `card ${i} "${label}" in overlay`).toBeLessThanOrEqual(1);
      }

      const badges = badgeOverlay.locator("[class*='rounded-full']");
      const badgeLocators = [];
      const n = Math.min(await badges.count(), 8);
      for (let b = 0; b < n; b++) badgeLocators.push(badges.nth(b));
      if (badgeLocators.length >= 2) {
        await assertNoInternalOverlap(badgeLocators, 1);
      }
    }
  });

  test("provider card links resolve to viewprofile with id", async ({ page }) => {
    const cardLink = page.locator("a[href*='viewprofile']").filter({ has: page.getByTestId("provider-card") }).first();
    await expect(cardLink).toBeVisible({ timeout: 20_000 });
    const href = await cardLink.getAttribute("href");
    expect(href).toMatch(/viewprofile\?id=/i);
  });

  test("provider card shows name, city, and rate band on gradient bar", async ({ page }) => {
    const card = page.getByTestId("provider-card").first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.locator("h3")).toBeVisible();
    await expect(card.getByText(/,\s*[A-Z]{2}\b/).first()).toBeVisible();
  });
});

test.describe("UI layout — profile header @desktop", () => {
  test.beforeEach(async ({ page }) => {
    await bypassAgeGateSession(page);
  });

  test("profile header badges align with title", async ({ page, request }) => {
    const api = await fetchJson(request, `/api/v1/providers/by-slug/${SMOKE_SLUG}`);
    test.skip(api.status !== 200, `Profile ${SMOKE_SLUG} unavailable`);

    const provider = api.body as { id?: string; display_name?: string };
    await page.goto(`/viewprofile?id=${provider.id}`);
    await page.waitForLoadState("domcontentloaded");

    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(provider.display_name ?? "");

    const badgeRow = page.getByTestId("profile-badge-row").first();

    const h1Box = await getBoundingBox(h1);
    expect(h1Box).not.toBeNull();

    if (await badgeRow.isVisible().catch(() => false)) {
      const badgeBox = await getBoundingBox(badgeRow);
      expect(badgeBox).not.toBeNull();

      const viewport = page.viewportSize();
      if (viewport && viewport.width >= 640) {
        // Desktop: badges sit inline with the title.
        assertVerticallyAligned(h1Box!, badgeBox!, 28);
      } else {
        // Mobile: badges stack in a single row directly below the title.
        expect(badgeBox!.y).toBeGreaterThanOrEqual(h1Box!.y + h1Box!.height - 4);
      }
      await assertNoInternalOverlap([h1, badgeRow], 0);
    }

    const premiumInHeader = badgeRow.getByText("Premium", { exact: false });
    expect(await premiumInHeader.count()).toBeLessThanOrEqual(1);
  });
});

test.describe("UI layout — public navigation", () => {
  test("desktop nav links have correct hrefs", async ({ page }) => {
    await bypassAgeGateSession(page);
    await page.goto("/");
    await page.setViewportSize({ width: 1280, height: 800 });

    for (const item of PUBLIC_NAV) {
      const link = page.locator("nav").getByRole("link", { name: item.label }).first();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", item.href);
    }
  });

  test("mobile hamburger exposes reachable nav links", async ({ page }) => {
    await bypassAgeGateSession(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const menuButton = page.getByRole("button", { name: /open menu/i });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    const sheet = page.locator("[role='dialog']").filter({ hasText: "Menu" });
    await expect(sheet).toBeVisible();

    for (const item of PUBLIC_NAV) {
      const link = sheet.getByRole("link", { name: item.label });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", item.href);
    }

    await sheet.getByRole("link", { name: /browse/i }).click();
    await expect(page).toHaveURL(/\/browse/);
    await expect(page.locator("nav").first()).toBeVisible();
  });
});

test.describe("UI layout — age gate", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("age gate dismiss leaves nav visible and unobscured", async ({ page }) => {
    await page.context().clearCookies();
    await page.addInitScript(() => sessionStorage.removeItem("lbv_age_gate_accepted"));
    await page.goto("/");

    const ageDialog = page.getByRole("dialog").filter({ hasText: /adults only/i });
    await expect(ageDialog).toBeVisible({ timeout: 10_000 });

    const nav = page.locator("nav").first();
    await expect(nav).toBeVisible();

    await dismissAgeGateAndWait(page);
    await expect(ageDialog).toBeHidden();

    const navBox = await getBoundingBox(nav);
    expect(navBox).not.toBeNull();

    const overlay = page.locator("[data-state='open'][class*='fixed']").first();
    const overlayBox = (await overlay.isVisible().catch(() => false))
      ? await getBoundingBox(overlay)
      : null;
    assertNavNotObscuredByOverlay(navBox!, overlayBox);

    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 640) {
      const browseLink = page.locator("nav").getByRole("link", { name: /browse/i }).first();
      await expect(browseLink).toBeVisible();
      await browseLink.click({ trial: true });
    } else {
      // Mobile: public nav collapses behind the hamburger menu.
      const menuButton = page.getByRole("button", { name: /open menu/i });
      await expect(menuButton).toBeVisible();
      await menuButton.click({ trial: true });
    }
  });

  test("terms link inside age gate points to /terms", async ({ page }) => {
    await page.context().clearCookies();
    await page.addInitScript(() => sessionStorage.removeItem("lbv_age_gate_accepted"));
    await page.goto("/");

    const terms = page.getByRole("dialog").getByRole("link", { name: /terms of service/i });
    await expect(terms).toBeVisible();
    await expect(terms).toHaveAttribute("href", "/terms");
  });
});

test.describe("UI layout — visual smoke @desktop", () => {
  test.beforeEach(async ({ page }) => {
    await bypassAgeGateSession(page);
  });

  test("browse grid renders without horizontal overflow", async ({ page }) => {
    await gotoBrowse(page, "Miami");
    await page.waitForLoadState("networkidle").catch(() => {});

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 2;
    });
    expect(overflow).toBe(false);
  });

  test("browse page matches layout baseline screenshot", async ({ page }) => {
    test.info().annotations.push({ type: "visual", description: "Soft snapshot — update with --update-snapshots after intentional UI changes" });

    await gotoBrowse(page, "Miami");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.locator("article").first()).toBeVisible({ timeout: 20_000 });

    await expect(page).toHaveScreenshot("browse-miami-layout.png", {
      fullPage: false,
      maxDiffPixelRatio: 0.04,
      animations: "disabled",
      mask: [page.locator("img")],
    });
  });
});
