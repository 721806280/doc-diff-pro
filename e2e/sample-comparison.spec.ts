import { expect, test } from '@playwright/test';

test('loads the sample documents and renders a comparison', async ({ page }) => {
  await page.goto('./');
  await page.locator('.local-processing-strip button').click();

  await expect(page.locator('.floating-navigator')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.docx-render-content')).toHaveCount(2);
  await expect(page.locator('.summary-chip.similarity')).toHaveCount(1);
});

test('keeps one active document pane on mobile', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile layout only');
  await page.goto('./');
  await page.locator('.local-processing-strip button').click();
  await expect(page.locator('.mobile-pane-switch')).toBeVisible({ timeout: 30_000 });

  const revised = page.locator('.mobile-pane-switch__option.is-revised');
  await revised.click();
  await expect(revised).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.view-dock-panel.mobile-pane-active')).toHaveCount(1);
});
