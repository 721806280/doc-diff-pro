import { expect, test } from '@playwright/test';

test('loads the sample documents and renders a comparison', async ({ page }) => {
  await page.goto('./');
  await page.locator('.local-processing-strip button').click();

  await expect(page.locator('.floating-navigator')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.docx-render-content')).toHaveCount(2);
  await expect(page.locator('.summary-chip.similarity')).toHaveCount(1);
});

/**
 * The samples carry four figures between them precisely so that a preview shows
 * every outcome the image pass can report. If this drifts, the samples have
 * stopped demonstrating the feature — which is the only reason they carry
 * figures at all.
 */
test('shows every kind of figure difference in the sample comparison', async ({ page }) => {
  await page.goto('./');
  await page.locator('.local-processing-strip button').click();
  await expect(page.locator('.floating-navigator')).toBeVisible({ timeout: 30_000 });

  const baseline = page.locator('.view-dock-panel').first();
  const revised = page.locator('.view-dock-panel').last();

  // The revised chart and the removed flow diagram, on the baseline side.
  await expect(baseline.locator('del[data-diff-image] img')).toHaveCount(2);
  // The revised chart and the added donut, on the revision side.
  await expect(revised.locator('ins[data-diff-image] img')).toHaveCount(2);

  // The chart appears on both sides under one difference id: the same figure,
  // revised, rather than one removed beside one added.
  const revisedChartId = await baseline.locator('del[data-diff-image]').first().getAttribute('data-diff-id');
  await expect(revised.locator(`ins[data-diff-image][data-diff-id="${revisedChartId}"]`)).toHaveCount(1);

  // The logo is byte-identical in both samples and must be reported as nothing
  // at all — six figures rendered, four of them marked.
  await expect(page.locator('.docx-render-content img')).toHaveCount(6);

  // Every marked figure carries the label the review list previews it by. The
  // word in front of the dimensions is localized, so only the shape is asserted.
  await expect(baseline.locator('del[data-diff-image]').first()).toHaveAttribute('data-diff-image', /\S+ \d+×\d+/);
});

test('opens a full-size preview without losing image-difference focus', async ({ page }) => {
  await page.goto('./');
  await page.locator('.local-processing-strip button').click();
  await expect(page.locator('.floating-navigator')).toBeVisible({ timeout: 30_000 });

  const image = page.locator('del[data-diff-image] img').first();
  const source = await image.getAttribute('src');
  await image.click();

  const preview = page.locator('.image-preview-overlay');
  await expect(preview).toBeVisible();
  await expect(preview.locator('.image-preview-image')).toHaveAttribute('src', source ?? '');
  await expect(page.locator('del[data-diff-image].focus-diff')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
});

/**
 * The samples also carry a Word-drawn text box and a formula, which the converter
 * emits nothing at all for — not even a warning. Both sides say so, which is the
 * only trace either leaves.
 */
test('admits which parts of the sample documents were not compared', async ({ page }) => {
  await page.goto('./');
  await page.locator('.local-processing-strip button').click();
  await expect(page.locator('.floating-navigator')).toBeVisible({ timeout: 30_000 });

  const notices = page.locator('.warning-chip.uncomparable');
  await expect(notices).toHaveCount(2);
  // One drawing Word rendered itself, plus one formula, on each side.
  await expect(notices.first()).toContainText('2');
  await expect(notices.first()).toHaveAttribute('tabindex', '0');
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
