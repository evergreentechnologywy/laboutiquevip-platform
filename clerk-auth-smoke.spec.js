import { test, expect } from '@playwright/test';

const BASE = 'https://laboutiquevip.net';

test('Clerk auth components render on login page', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  await expect(page).toHaveTitle(/Sign In/);
  const iframeCount = await page.locator('iframe').count();
  expect(iframeCount).toBeGreaterThan(0);
  expect(errors.filter(e => e.toLowerCase().includes('clerk')).length).toBe(0);
});

test('Clerk SignUp component renders on register page', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(BASE + '/register', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  await expect(page).toHaveTitle(/Create Account/);
  const iframeCount = await page.locator('iframe').count();
  expect(iframeCount).toBeGreaterThan(0);
  expect(errors.filter(e => e.toLowerCase().includes('clerk')).length).toBe(0);
});
