import { expect, test, type Page } from '@playwright/test';

test.use({ locale: 'zh-CN' });

async function loadComparison(page: Page): Promise<void> {
  await page.goto('./');
  await page.locator('.local-processing-strip button').click();
  await expect(page.locator('.floating-navigator')).toBeVisible({ timeout: 30_000 });
}

async function showDocument(page: Page, side: 'A' | 'B', mobile: boolean): Promise<void> {
  if (mobile) {
    await page.locator('.mobile-pane-switch__option.' + (side === 'A' ? 'is-original' : 'is-revised')).click();
  }
}

function previewImage(page: Page, side: 'A' | 'B') {
  return page.locator('.image-preview-pane[data-side="' + side + '"] img');
}

function previewOrientation(page: Page, side: 'A' | 'B') {
  return previewImage(page, side).evaluate((image) => {
    const matrix = new DOMMatrix(getComputedStyle(image).transform);
    const scale = Math.hypot(matrix.a, matrix.b);
    return [matrix.a, matrix.b, matrix.c, matrix.d].map((value) => Math.round(value / scale) || 0);
  });
}

test('opens the paired images from either side and returns to the clicked figure', async ({
  page,
  isMobile
}, testInfo) => {
  await loadComparison(page);
  const original = page.locator('del[data-diff-image] img[data-ddv-image-change="revised"]').first();
  const revision = page.locator('ins[data-diff-image] img[data-ddv-image-change="revised"]').first();
  const sources = [await original.getAttribute('src'), await revision.getAttribute('src')];

  for (const side of ['A', 'B'] as const) {
    await showDocument(page, side, isMobile);
    const figure = side === 'A' ? original : revision;
    await figure.scrollIntoViewIfNeeded();
    await figure.click();
    const dialog = page.getByRole('dialog', { name: '图片对比' });
    await expect(dialog).toBeVisible();
    await expect(previewImage(page, 'A')).toHaveAttribute('src', sources[0] ?? '');
    await expect(previewImage(page, 'B')).toHaveAttribute('src', sources[1] ?? '');
    await expect(previewImage(page, side)).toBeVisible();
    await expect(page.locator('.image-preview-source-label')).toHaveText(['基准', '修订']);
    const left = await previewImage(page, 'A').boundingBox();
    const right = await previewImage(page, 'B').boundingBox();
    if (isMobile) expect(left!.y).toBeLessThan(right!.y);
    else expect(left!.x).toBeLessThan(right!.x);
    await expect(page.locator('.image-preview-source button')).toHaveCount(1);
    await expect(page.locator('.image-preview-similarity')).toContainText(/\d+(\.\d+)?%/);
    if (side === 'A')
      await page.screenshot({ path: testInfo.outputPath('image-comparison.png'), animations: 'disabled' });
    const positions = await page
      .locator('.render-viewport')
      .evaluateAll((panes) => panes.map((pane) => pane.scrollTop));
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(figure).toBeFocused();
    const restored = await page.locator('.render-viewport').evaluateAll((panes) => panes.map((pane) => pane.scrollTop));
    // Firefox can restore a scroll offset one CSS pixel away after focusing.
    for (const [index, position] of positions.entries()) {
      expect(Math.abs(restored[index]! - position)).toBeLessThanOrEqual(1);
    }
    await expect(figure.locator('..')).toHaveClass(/focus-diff/);
  }
  await page.getByRole('button', { name: '切换到夜间模式', exact: true }).click();
  await showDocument(page, 'A', isMobile);
  await original.click();
  await expect(previewImage(page, 'A')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('image-comparison-dark.png'), animations: 'disabled' });
});

test('pairs unchanged figures and leaves additions and removals on their correct side', async ({
  page,
  isMobile
}, testInfo) => {
  await loadComparison(page);
  await page.locator('.docx-render-content img[data-ddv-image-change="unchanged"]').first().click();
  await expect(page.locator('.image-preview-status')).toHaveText('内容相同');
  await expect(page.locator('.image-preview-image')).toHaveCount(1);
  await expect(page.locator('.image-preview-filename')).toHaveCount(1);
  await expect(page.locator('.image-preview-context')).toHaveCount(0);
  await expect(page.locator('.image-preview-modes')).toHaveCount(0);
  await expect(page.locator('.image-preview-similarity')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('image-identical.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');

  await page.locator('del[data-diff-image] img[data-ddv-image-change="deleted"]').click();
  await expect(page.locator('.image-preview-status')).toHaveText('删除');
  await expect(page.locator('.image-preview-filename')).toHaveText('示例-基准文档.docx');
  await expect(page.locator('.image-preview-pane[data-side="B"]')).toHaveCount(0);
  await expect(page.locator('.image-preview-modes')).toHaveCount(0);
  await expect(page.locator('.image-preview-similarity')).toHaveCount(0);
  await expect(page.locator('.image-preview-image')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('image-deleted.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');

  await showDocument(page, 'B', isMobile);
  await page.locator('ins[data-diff-image] img[data-ddv-image-change="inserted"]').click();
  await expect(page.locator('.image-preview-status')).toHaveText('新增');
  await expect(page.locator('.image-preview-filename')).toHaveText('示例-修订文档.docx');
  await expect(page.locator('.image-preview-pane[data-side="A"]')).toHaveCount(0);
  await expect(page.locator('.image-preview-image')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('image-added.png'), animations: 'disabled' });
});

// Keep these interaction sequences separate so each has a full test budget on Linux WebKit.
test('links zoom and pan between paired images', async ({ page }) => {
  await loadComparison(page);
  await page.locator('del[data-diff-image] img[data-ddv-image-change="revised"]').first().click();
  const a = previewImage(page, 'A');
  const b = previewImage(page, 'B');
  const canvas = page.locator('.image-preview-canvas[data-side="A"]');
  const initial = (await a.boundingBox())!;
  for (let index = 0; index < 4; index++) await page.getByRole('button', { name: '放大', exact: true }).click();
  await expect.poll(async () => (await a.boundingBox())!.width).toBeGreaterThan(initial.width * 2);
  const enlarged = (await a.boundingBox())!;
  const enlargedPeer = (await b.boundingBox())!;
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 - 50, bounds.y + bounds.height / 2 - 30, { steps: 5 });
  await page.mouse.up();
  const moved = (await a.boundingBox())!;
  expect(moved.x).toBeLessThan(enlarged.x - 40);
  expect((await b.boundingBox())!.x - enlargedPeer.x).toBeCloseTo(moved.x - enlarged.x, 0);
  const peerWidth = (await b.boundingBox())!.width;
  expect(peerWidth).toBeCloseTo(moved.width, 0);
});

test('zooms the focused image independently when linking is disabled', async ({ page }) => {
  await loadComparison(page);
  await page.locator('del[data-diff-image] img[data-ddv-image-change="revised"]').first().click();
  const a = previewImage(page, 'A');
  const b = previewImage(page, 'B');
  await page.getByRole('button', { name: '放大', exact: true }).click();
  const originalWidth = (await a.boundingBox())!.width;
  const peerWidth = (await b.boundingBox())!.width;

  await page.getByRole('button', { name: '联动图片操作' }).click();
  await expect(page.getByRole('button', { name: '联动图片操作' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '放大', exact: true }).click();
  const independentWidth = (await a.boundingBox())!.width;
  expect(independentWidth).toBeGreaterThan(originalWidth);
  expect((await b.boundingBox())!.width).toBeCloseTo(peerWidth, 0);
  await page.locator('.image-preview-canvas[data-side="B"]').focus();
  await page.getByRole('button', { name: '放大', exact: true }).click();
  expect((await a.boundingBox())!.width).toBeCloseTo(independentWidth, 0);
  expect((await b.boundingBox())!.width).toBeGreaterThan(peerWidth);
});

test('switches image sizes and zooms with keyboard and wheel input', async ({ page, isMobile }) => {
  await loadComparison(page);
  await page.locator('del[data-diff-image] img[data-ddv-image-change="revised"]').first().click();
  const a = previewImage(page, 'A');
  const canvas = page.locator('.image-preview-canvas[data-side="A"]');

  await page.getByRole('button', { name: '原始尺寸（100%）' }).click();
  const naturalWidth = await a.evaluate((image: HTMLImageElement) => image.naturalWidth);
  expect((await a.boundingBox())!.width).toBeCloseTo(naturalWidth, 0);
  await page.getByRole('button', { name: '适应窗口', exact: true }).click();
  expect((await a.boundingBox())!.width).toBeLessThanOrEqual(naturalWidth);
  await canvas.focus();
  const beforeKeyboard = (await a.boundingBox())!.width;
  await page.keyboard.press('+');
  await expect.poll(async () => (await a.boundingBox())!.width).toBeGreaterThan(beforeKeyboard);
  if (!isMobile) {
    await canvas.hover();
    const beforeWheel = (await a.boundingBox())!.width;
    await page.mouse.wheel(0, -120);
    await expect.poll(async () => (await a.boundingBox())!.width).toBeGreaterThan(beforeWheel);
  }
});

test('rotates and flips in screen directions and fits rotated images', async ({ page }) => {
  await loadComparison(page);
  const figure = page.locator('del[data-diff-image] img[data-ddv-image-change="revised"]').first();
  await figure.click();
  const a = previewImage(page, 'A');
  const b = previewImage(page, 'B');
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
  const reset = page.getByRole('button', { name: '还原初始视图', exact: true });
  await expect(reset).toBeDisabled();
  await page.getByRole('button', { name: '向右旋转 90°', exact: true }).click();
  expect(await previewOrientation(page, 'A')).toEqual([0, 1, -1, 0]);
  expect(await previewOrientation(page, 'B')).toEqual([0, 1, -1, 0]);
  for (const side of ['A', 'B'] as const) {
    const image = (await previewImage(page, side).boundingBox())!;
    const canvas = (await page.locator(`.image-preview-canvas[data-side="${side}"]`).boundingBox())!;
    expect(image.x).toBeGreaterThanOrEqual(canvas.x + 23);
    expect(image.y).toBeGreaterThanOrEqual(canvas.y + 23);
    expect(image.x + image.width).toBeLessThanOrEqual(canvas.x + canvas.width - 23);
    expect(image.y + image.height).toBeLessThanOrEqual(canvas.y + canvas.height - 23);
  }
  await page.getByRole('button', { name: '原始尺寸（100%）' }).click();
  const natural = await a.evaluate((image: HTMLImageElement) => ({
    width: image.naturalWidth,
    height: image.naturalHeight
  }));
  expect((await a.boundingBox())!.width).toBeCloseTo(natural.height, 0);
  expect((await a.boundingBox())!.height).toBeCloseTo(natural.width, 0);
  await expect(page.getByRole('button', { name: '原始尺寸（100%）' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '原始尺寸（100%）' }).click();
  await expect(page.getByRole('button', { name: '原始尺寸（100%）' })).toHaveAttribute('aria-pressed', 'false');
  expect(await previewOrientation(page, 'A')).toEqual([0, 1, -1, 0]);
  await page.getByRole('button', { name: '水平翻转', exact: true }).click();
  await expect(page.getByRole('button', { name: '水平翻转', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await previewOrientation(page, 'A')).toEqual([0, 1, 1, 0]);
  // A clockwise rotation must still turn clockwise after a mirror operation.
  await page.getByRole('button', { name: '向右旋转 90°', exact: true }).click();
  expect(await previewOrientation(page, 'A')).toEqual([-1, 0, 0, 1]);
  expect(await previewOrientation(page, 'B')).toEqual([-1, 0, 0, 1]);
});

test('preserves independent orientations when relinking and resets the view', async ({ page }, testInfo) => {
  await loadComparison(page);
  const figure = page.locator('del[data-diff-image] img[data-ddv-image-change="revised"]').first();
  const dialog = page.getByRole('dialog', { name: '图片对比' });
  await figure.click();
  const a = previewImage(page, 'A');
  const b = previewImage(page, 'B');
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
  const reset = page.getByRole('button', { name: '还原初始视图', exact: true });
  await page.getByRole('button', { name: '水平翻转', exact: true }).click();
  expect(await previewOrientation(page, 'A')).toEqual([-1, 0, 0, 1]);
  await page.getByRole('button', { name: '联动图片操作' }).click();
  await page.locator('.image-preview-canvas[data-side="B"]').focus();
  const originalTransform = await a.getAttribute('style');
  await page.getByRole('button', { name: '向左旋转 90°', exact: true }).click();
  await page.getByRole('button', { name: '垂直翻转', exact: true }).click();
  await expect(a).toHaveAttribute('style', originalTransform!);
  await expect(page.locator('.image-preview-active-side')).toHaveText('修订');
  await expect(page.locator('.image-preview-pane.is-active')).toHaveAttribute('data-side', 'B');
  await expect(b).toBeVisible();
  await page.locator('.image-preview-canvas[data-side="B"]').click({ position: { x: 12, y: 12 } });
  await page.screenshot({ path: testInfo.outputPath('image-controls-independent.png'), animations: 'disabled' });
  const corrected = await previewOrientation(page, 'B');
  await page.getByRole('button', { name: '联动图片操作' }).click();
  expect(await previewOrientation(page, 'A')).toEqual([-1, 0, 0, 1]);
  expect(await previewOrientation(page, 'B')).toEqual(corrected);
  await page.getByRole('button', { name: '放大', exact: true }).click();
  expect(await previewOrientation(page, 'A')).toEqual([-1, 0, 0, 1]);
  expect(await previewOrientation(page, 'B')).toEqual(corrected);
  await page.locator('.image-preview-canvas[data-side="B"]').focus();
  await page.keyboard.press('Home');
  expect(await previewOrientation(page, 'A')).toEqual([1, 0, 0, 1]);
  expect(await previewOrientation(page, 'B')).toEqual([1, 0, 0, 1]);
  await expect(reset).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(figure).toBeFocused();
  await figure.click();
  await expect(dialog).toBeVisible();
  expect(await previewOrientation(page, 'A')).toEqual([1, 0, 0, 1]);
  await expect(reset).toBeDisabled();
});

test('fits the English controls on a narrow screen', async ({ page, isMobile }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await loadComparison(page);
  await page.locator('.language-trigger').click();
  await page.locator('del[data-diff-image] img[data-ddv-image-change="revised"]').first().click();
  await expect(page.getByRole('dialog', { name: 'Image comparison' })).toBeVisible();
  await page.getByRole('button', { name: 'Link image controls' }).click();
  await page.screenshot({ path: testInfo.outputPath('image-comparison-narrow-en.png'), animations: 'disabled' });
  const overflow = await page.locator('.image-preview-panel').evaluate((panel) => {
    const bounds = panel.getBoundingClientRect();
    return Array.from(panel.querySelectorAll('button, .image-preview-similarity')).some((control) => {
      const rect = control.getBoundingClientRect();
      return rect.left < bounds.left || rect.right > bounds.right || rect.bottom > bounds.bottom;
    });
  });
  expect(overflow).toBe(false);
  const layout = await page
    .locator('.image-preview-toolbar button, .image-preview-similarity')
    .evaluateAll((controls) => {
      const bounds = controls.map((control) => control.getBoundingClientRect());
      return {
        rows: new Set(bounds.map((rect) => Math.round(rect.top))).size,
        overlapping: bounds.some((a, index) =>
          bounds
            .slice(index + 1)
            .some(
              (b) =>
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
            )
        )
      };
    });
  expect(layout).toEqual({ rows: 1, overlapping: false });
  const similarity = page.getByRole('img', { name: /^Similarity / });
  if (isMobile) await similarity.tap();
  else await similarity.click();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page.getByRole('tooltip')).toContainText(/Similarity \d+(\.\d+)?%/);
  await page.screenshot({ path: testInfo.outputPath('image-similarity-narrow-en.png'), animations: 'disabled' });
});

test('previews a single document before comparison', async ({ page }, testInfo) => {
  await page.goto('./');
  await page.locator('input[type="file"]').first().setInputFiles('public/samples/baseline.docx');
  const image = page.locator('.docx-render-content img').first();
  await expect(image).toBeVisible({ timeout: 30_000 });
  await image.click();
  await expect(page.getByRole('dialog', { name: '图片预览', exact: true })).toBeVisible();
  await expect(page.locator('.image-preview-image')).toHaveCount(1);
  await expect(page.locator('.image-preview-modes')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('single-image.png'), animations: 'disabled' });
});

test('zooms with a touch pinch on mobile', async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== 'chromium', 'CDP touch injection requires mobile Chromium');
  await loadComparison(page);
  await page.locator('del[data-diff-image] img[data-ddv-image-change="revised"]').first().click();
  const image = previewImage(page, 'A');
  await expect(image).toBeVisible();
  const initial = (await image.boundingBox())!.width;
  const bounds = (await page.locator('.image-preview-canvas[data-side="A"]').boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: x - 35, y, id: 1 },
        { x: x + 35, y, id: 2 }
      ]
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - 85, y, id: 1 },
        { x: x + 85, y, id: 2 }
      ]
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(initial * 1.5);
  } finally {
    await cdp.detach();
  }
});
