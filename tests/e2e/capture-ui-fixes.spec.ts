import { test } from "@playwright/test";
import { bypassAgeGateSession } from "./helpers/lbv";
import { installLocalDistRoutes } from "./helpers/local-dist";

const OUT = process.env.LBV_SHOT_DIR ?? "../qa-screenshots/ui-fixes-20260709";

// Manual screenshot capture pack — opt in via LBV_SHOT_DIR or LBV_LOCAL_DIST.
test.skip(!process.env.LBV_SHOT_DIR && !process.env.LBV_LOCAL_DIST, "capture pack is opt-in");

test.beforeEach(async ({ context, page }) => {
  await installLocalDistRoutes(context);
  await bypassAgeGateSession(page);
});

test("capture browse miami @desktop", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop-chrome");
  await page.goto("/browse?location=Miami");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/after-desktop-browse-miami.png`, fullPage: false });
  await page.getByTestId("provider-card").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/after-desktop-browse-cards.png` });
});

test("capture browse miami mobile", async ({ page }) => {
  test.skip(test.info().project.name !== "mobile-safari");
  await page.goto("/browse?location=Miami");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/after-mobile-browse-miami.png` });
  await page.getByRole("button", { name: /filters/i }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/after-mobile-filters-sheet.png` });
});

test("capture profile", async ({ page }) => {
  await page.goto("/profile/rubyvega");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  const name = test.info().project.name === "mobile-safari" ? "mobile" : "desktop";
  await page.screenshot({ path: `${OUT}/after-${name}-profile-rubyvega.png` });
});

test("capture login", async ({ page }) => {
  await page.goto("/login");
  await page.waitForTimeout(4000);
  const name = test.info().project.name === "mobile-safari" ? "mobile" : "desktop";
  await page.screenshot({ path: `${OUT}/after-${name}-login.png` });
});
