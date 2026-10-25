import { expect, test } from '@playwright/test';

test.use({ locale: 'zh-CN' });

for (const scenario of [
  { label: 'a missing diff payload', response: '{ id: event.data.id }' },
  { label: 'an incomplete diff result', response: '{ id: event.data.id, diffs: [] }' }
]) {
  test(`recovers from ${scenario.label} without losing document changes`, async ({ page }) => {
    const fallbacks: string[] = [];
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes('[Document diff worker fallback]')) fallbacks.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(
      '**/src/workers/diffWorker.ts*',
      (route) =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `self.onmessage = event => self.postMessage(${scenario.response});`
        }),
      { times: 1 }
    );

    await page.goto('./');
    await page.locator('input[type="file"]').nth(0).setInputFiles('e2e/fixtures/clauses-original.docx');
    await page.locator('input[type="file"]').nth(1).setInputFiles('e2e/fixtures/clauses-revised.docx');

    await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '5');
    const original = page.locator('.docx-render-content').first();
    await expect(original.locator('del').filter({ hasText: '不得' })).toHaveCount(1);
    await expect(page.locator('.app-error-banner')).toHaveCount(0);
    expect(fallbacks).toHaveLength(1);

    // A new comparison must create a working replacement for the retired worker.
    await page.locator('input[type="file"]').first().setInputFiles('e2e/fixtures/clauses-revised.docx');
    await expect(page.locator('.summary-chip.total')).toContainText('无差异');
    await expect(page.locator('.docx-render-content [data-diff-id]')).toHaveCount(0);
    expect(fallbacks).toHaveLength(1);
    expect(errors).toEqual([]);
  });
}
