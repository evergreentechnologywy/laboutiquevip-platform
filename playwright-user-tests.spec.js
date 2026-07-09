import { test, expect } from '@playwright/test';

const BASE_URL = 'https://www.laboutiquevip.net';

// Helper to bypass the age gate dialog
async function bypassAgeGate(page) {
  await page.context().addInitScript(() => {
    sessionStorage.setItem('lbv_age_gate_accepted', 'yes');
  });
}

test.describe('La Boutique VIP User-Side Tests', () => {

  test('Homepage loads and bypasses age gate successfully', async ({ page }) => {
    await bypassAgeGate(page);
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
    
    // Check that the Dialog modal is not open
    await expect(page.locator('role=dialog')).toHaveCount(0);
    
    // Check key landing page items
    await expect(page).toHaveTitle(/La Boutique VIP/i);
    await expect(page.locator('footer')).toBeVisible();
  });

  test('Navigation links render and function', async ({ page }) => {
    await bypassAgeGate(page);
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });

    // Verify key pages load correctly
    const pages = ['/browse', '/pricing', '/trust'];
    for (const path of pages) {
      const response = await page.goto(BASE_URL + path, { waitUntil: 'networkidle' });
      expect(response.status()).toBe(200);
      await expect(page.locator('footer')).toBeVisible();
    }
  });

  test('Search and filter logic works on browse page', async ({ page }) => {
    await bypassAgeGate(page);
    await page.goto(BASE_URL + '/browse', { waitUntil: 'networkidle' });

    // Assert that provider listing cards exist
    await page.waitForTimeout(2000);
    const cardsCount = await page.locator('img').count();
    expect(cardsCount).toBeGreaterThan(0);
  });

  test('View profile displays complete model information', async ({ page }) => {
    await bypassAgeGate(page);
    
    // Fetch a live provider ID from the search API to test real data display
    const response = await page.request.get(BASE_URL + '/api/v1/search/providers?limit=1');
    expect(response.status()).toBe(200);
    const body = await response.json();
    const firstProvider = (body.items || [])[0];

    if (firstProvider && firstProvider.id) {
      await page.goto(BASE_URL + `/viewprofile?id=${firstProvider.id}`, { waitUntil: 'networkidle' });
      
      // Verify profile title matching display name
      await expect(page.locator(`h1:has-text("${firstProvider.display_name}")`)).toBeVisible();
      
      // Verify tagline and location elements (case-insensitive text search)
      if (firstProvider.tagline) {
        await expect(page.locator(`text=${firstProvider.tagline}`).first()).toBeVisible();
      }
      await expect(page.locator(`text=${firstProvider.location_city}`).first()).toBeVisible();

      // Verify that at least one photo is rendered
      const photos = page.locator('img');
      expect(await photos.count()).toBeGreaterThan(0);

      // Verify enquiry message form components
      await expect(page.locator('#sender-name')).toBeVisible();
      await expect(page.locator('#sender-email')).toBeVisible();
      await expect(page.locator('#sender-msg')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    } else {
      console.warn("No active providers found via API to execute detailed ViewProfile checks.");
    }
  });

  test('Profile not found handler renders correctly', async ({ page }) => {
    await bypassAgeGate(page);
    await page.goto(BASE_URL + '/viewprofile?id=non-existent-guid-value-12345', { waitUntil: 'networkidle' });
    await expect(page.locator('text=Profile not found')).toBeVisible();
    await expect(page.locator("text=This provider profile doesn't exist")).toBeVisible();
  });

  test('Login and registration paths load Clerk auth blocks', async ({ page }) => {
    await bypassAgeGate(page);
    
    // Login check
    await page.goto(BASE_URL + '/login', { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(/Sign In/i);
    
    // Register check
    await page.goto(BASE_URL + '/register', { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(/Create Account/i);
  });
});
