import type { Page, APIRequestContext } from "@playwright/test";

export const API_BASE = process.env.LBV_API_BASE ?? process.env.LBV_BASE_URL ?? "https://www.laboutiquevip.net";

/** Pre-seed sessionStorage so age gate is skipped (fast path for layout tests). */
export async function bypassAgeGateSession(page: Page): Promise<void> {
  await page.context().addInitScript(() => {
    sessionStorage.setItem("lbv_age_gate_accepted", "yes");
  });
}

/** Dismiss age gate when the checkbox + Enter site controls are visible. */
export async function dismissAgeGate(page: Page): Promise<void> {
  const checkbox = page.getByRole("checkbox").first();
  if (await checkbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await checkbox.check();
    const enter = page.getByRole("button", { name: /enter site/i });
    if (await enter.isVisible().catch(() => false)) {
      await enter.click();
    }
  }
}

/** Dismiss age gate via UI and wait for dialog to close. */
export async function dismissAgeGateAndWait(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.isVisible({ timeout: 3_000 }).catch(() => false))) return;

  await page.locator("#age-agree").check();
  await page.getByRole("button", { name: /enter site/i }).click();
  await expectDialogClosed(page);
}

async function expectDialogClosed(page: Page): Promise<void> {
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
}

export async function gotoBrowse(page: Page, location?: string): Promise<void> {
  const path = location ? `/browse?location=${encodeURIComponent(location)}` : "/browse";
  await page.goto(path);
  await dismissAgeGate(page);
}

/** Clerk QA accounts — passwords in vault `01_Infrastructure/secrets/lbv-qa/`. */
export const QA_ROLES = ["qa-admin", "qa-external-dev", "qa-provider", "qa-member"] as const;

export async function loginWithClerk(
  page: Page,
  email: string,
  password: string,
  nextPath = "/",
): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`);
  await dismissAgeGate(page);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /continue|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

export async function fetchJson(
  request: APIRequestContext,
  path: string,
  init?: Parameters<APIRequestContext["fetch"]>[1],
): Promise<{ status: number; body: unknown }> {
  const response = await request.fetch(`${API_BASE}${path}`, init);
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }
  return { status: response.status(), body };
}
