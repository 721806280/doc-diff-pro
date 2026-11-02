import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { DocDiffProState } from '../src/services/externalDocumentApi';

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

test('loads same-origin runtime configuration before the entry module under the production CSP', async ({ page }) => {
  const failures = observeFailures(page);
  const [original, revised] = await Promise.all([
    readFile('e2e/fixtures/clauses-original.docx'),
    readFile('e2e/fixtures/clauses-revised.docx')
  ]);
  await page.route('**/doc-diff-pro/runtime-config.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "window.__DOC_DIFF_CONFIG__ = { documentInput: 'external', showHeader: false, showSampleDocuments: false, locale: 'zh-CN' };"
    })
  );
  await page.route('**/doc-diff-pro/', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /(?=<script\b[^>]*type="module")/,
      '<script src="./runtime-config.js"></script>'
    );
    await route.fulfill({ response, body });
  });
  await page.goto('./');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /script-src 'self';/
  );
  await page.waitForFunction(() => window.DocDiffPro?.ready);
  await expect(page.locator('input[type="file"], .app-header')).toHaveCount(0);
  await expect(page.getByText('等待接入系统提供基准文档', { exact: true })).toBeVisible();
  const loaded = await page.evaluate(
    async ({ baseline, revision }) => {
      const api = window.DocDiffPro!;
      const states: DocDiffProState[] = [];
      Reflect.set(window, '__productionResultStates', states);
      api.on('result', () => states.push(api.getState()));
      return api.loadDocuments({
        baseline: new File([new Uint8Array(baseline)], 'baseline.docx'),
        revised: new File([new Uint8Array(revision)], 'revised.docx'),
        meta: { bizId: 'production-config' }
      });
    },
    { baseline: Array.from(original), revision: Array.from(revised) }
  );
  expect(loaded.sequence).toBe(1);
  await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '5');
  await page.waitForFunction(
    () => (Reflect.get(window, '__productionResultStates') as DocDiffProState[])?.length === 1
  );
  expect(await page.evaluate(() => Reflect.get(window, '__productionResultStates') as DocDiffProState[])).toEqual([
    { ready: true, comparing: false, hasDocuments: true, hasResult: true, error: '' }
  ]);
  expect(failures).toEqual([]);
});

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
