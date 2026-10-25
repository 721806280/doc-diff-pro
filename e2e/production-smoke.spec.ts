import { expect, test, type Page } from '@playwright/test';

test.use({ locale: 'zh-CN' });

function observeFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' ||
      /\[(Document diff worker fallback|Image difference overlay)\]/.test(message.text())
    ) {
      failures.push(message.text());
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  return failures;
}

test('imports documents and uses the bundled worker and image overlay under the production CSP', async ({ page }) => {
  const failures = observeFailures(page);
  await page.goto('./');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /script-src 'self'/
  );
  const workerStarted = page.waitForEvent('worker');
  await page.locator('input[type="file"]').nth(0).setInputFiles('e2e/fixtures/structure-images-original.docx');
  await page.locator('input[type="file"]').nth(1).setInputFiles('e2e/fixtures/structure-images-revised.docx');
  const worker = await workerStarted;
  expect(new URL(worker.url()).pathname).toMatch(/^\/doc-diff-pro\/assets\/diffWorker-[^/]+\.js$/);
  await expect(page.locator('.floating-navigator')).toBeVisible();
  const original = page.locator('.docx-render-content').first();
  await expect(original.locator('img').first()).toHaveAttribute('data-ddv-image-change', 'unchanged');
  await expect(original.locator('img').nth(2)).toHaveAttribute('data-ddv-image-change', 'revised');
  await original.locator('img').nth(2).click();
  await page.getByRole('button', { name: '放大', exact: true }).click();
  const sources = page.locator('img.image-preview-image');
  const before = await sources.evaluateAll((images) => images.map((image) => image.getAttribute('style')));
  await page.getByRole('button', { name: '差异叠加', exact: true }).click();
  const canvas = page.locator('.image-preview-difference-canvas');
  await expect(canvas).toBeVisible();
  const red = await canvas.evaluate((element: HTMLCanvasElement) => {
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index]! > pixels[index + 1]! + 20 && pixels[index]! > pixels[index + 2]! + 20) count++;
    }
    return count;
  });
  expect(red).toBeGreaterThan(100);
  await expect(page.locator('.image-preview-filename')).toHaveText('structure-images-revised.docx');
  await page.getByRole('button', { name: '差异叠加', exact: true }).click();
  await expect(sources).toHaveCount(2);
  await expect(sources.nth(0)).toHaveAttribute('style', before[0]!);
  await expect(sources.nth(1)).toHaveAttribute('style', before[1]!);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(failures).toEqual([]);
});

test('loads the bundled samples from the deployed base path', async ({ page }) => {
  const failures = observeFailures(page);
  await page.goto('./');
  await page.locator('.local-processing-strip button').click();
  await expect(page.locator('.floating-navigator')).toBeVisible({ timeout: 30_000 });
  const panes = page.locator('.docx-render-content');
  await expect(panes).toHaveCount(2);
  await expect(panes.first().locator('[data-diff-id]').first()).toBeVisible();
  expect(failures).toEqual([]);
});

test('loads the SHA-256 fallback under the production CSP without missing image changes', async ({ page }) => {
  const failures = observeFailures(page);
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: undefined });
  });
  await page.goto('./');
  await page.locator('input[type="file"]').nth(0).setInputFiles('e2e/fixtures/hash-collision-original.docx');
  await page.locator('input[type="file"]').nth(1).setInputFiles('e2e/fixtures/hash-collision-revised.docx');
  await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '1');
  const images = page.locator('.docx-render-content img');
  await expect(images).toHaveCount(2);
  for (const image of await images.all()) await expect(image).toHaveAttribute('data-ddv-image-change', 'revised');
  expect(failures).toEqual([]);
});
