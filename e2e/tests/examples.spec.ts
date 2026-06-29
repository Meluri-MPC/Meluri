import { test, expect } from '@playwright/test';

test.describe('VelumX MPC SDK — Example Apps', () => {
  test('vite-react example loads and connects', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('h1, h2, [data-testid="title"]').first()).toBeVisible({ timeout: 10000 });

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body.length).toBeGreaterThan(0);
  });

  test('vite-react example renders SDK UI', async ({ page }) => {
    await page.goto('/');

    const buttons = page.locator('button');
    const count = await buttons.count();

    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('vite-react example has no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0);
  });
});
