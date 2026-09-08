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

test('opens the paired images from either side and returns to the clicked figure', async ({
  page,
  isMobile
}, testInfo) => {
  await loadComparison(page);
  const original = page.locator('del[data-diff-image] img').first();
  const revision = page.locator('ins[data-diff-image] img').first();
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
    await expect(page.locator('.image-preview-status')).toHaveText('已修改');
    const left = await previewImage(page, 'A').boundingBox();
    const right = await previewImage(page, 'B').boundingBox();
    if (isMobile) expect(left!.y).toBeLessThan(right!.y);
    else expect(left!.x).toBeLessThan(right!.x);
    await expect(page.locator('.image-preview-header button')).toHaveCount(1);
    await expect(page.locator('.image-preview-similarity')).toContainText(/\d+(\.\d+)?%/);
    if (side === 'A')
      await page.screenshot({ path: testInfo.outputPath('image-comparison.png'), animations: 'disabled' });
    const positions = await page
      .locator('.render-viewport')
      .evaluateAll((panes) => panes.map((pane) => pane.scrollTop));
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(figure).toBeFocused();
    expect(await page.locator('.render-viewport').evaluateAll((panes) => panes.map((pane) => pane.scrollTop))).toEqual(
      positions
    );
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
  await expect(page.locator('.image-preview-context')).toHaveText('两份文档使用同一张图片');
  await expect(page.locator('.image-preview-modes')).toHaveCount(0);
  await expect(page.locator('.image-preview-similarity')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('image-identical.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');

  await page.locator('del[data-diff-image] img').last().click();
  await expect(page.locator('.image-preview-status')).toHaveText('删除');
  await expect(page.locator('.image-preview-context')).toHaveText('这张图片仅存在于基准文档');
  await expect(page.locator('.image-preview-pane[data-side="B"]')).toHaveCount(0);
  await expect(page.locator('.image-preview-modes')).toHaveCount(0);
  await expect(page.locator('.image-preview-similarity')).toHaveCount(0);
  await expect(page.locator('.image-preview-image')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('image-deleted.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');

  await showDocument(page, 'B', isMobile);
  await page.locator('ins[data-diff-image] img').last().click();
  await expect(page.locator('.image-preview-status')).toHaveText('新增');
  await expect(page.locator('.image-preview-context')).toHaveText('这张图片仅存在于修订文档');
  await expect(page.locator('.image-preview-pane[data-side="A"]')).toHaveCount(0);
  await expect(page.locator('.image-preview-image')).toHaveCount(1);
});

test('links zoom and pan and supports independent adjustment with keyboard and wheel controls', async ({ page }) => {
  await loadComparison(page);
  await page.locator('del[data-diff-image] img').first().click();
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

  await page.getByRole('button', { name: '联动缩放和移动' }).click();
  await expect(page.getByRole('button', { name: '联动缩放和移动' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '放大', exact: true }).click();
  const independentWidth = (await a.boundingBox())!.width;
  expect(independentWidth).toBeGreaterThan(moved.width);
  expect((await b.boundingBox())!.width).toBeCloseTo(peerWidth, 0);
  await page.locator('.image-preview-canvas[data-side="B"]').focus();
  await page.getByRole('button', { name: '放大', exact: true }).click();
  expect((await a.boundingBox())!.width).toBeCloseTo(independentWidth, 0);
  await canvas.focus();

  await page.getByRole('button', { name: '原始尺寸（100%）' }).click();
  expect((await a.boundingBox())!.width).toBeCloseTo(480, 0);
  await page.getByRole('button', { name: '适应窗口', exact: true }).click();
  expect((await a.boundingBox())!.width).toBeLessThanOrEqual(480);
  await canvas.focus();
  const beforeKeyboard = (await a.boundingBox())!.width;
  await page.keyboard.press('+');
  await expect.poll(async () => (await a.boundingBox())!.width).toBeGreaterThan(beforeKeyboard);
  await canvas.hover();
  const beforeWheel = (await a.boundingBox())!.width;
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await a.boundingBox())!.width).toBeGreaterThan(beforeWheel);
});

test('fits the English controls on a narrow screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await loadComparison(page);
  await page.locator('.language-trigger').click();
  await page.locator('del[data-diff-image] img').first().click();
  await expect(page.getByRole('dialog', { name: 'Image comparison' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('image-comparison-narrow-en.png'), animations: 'disabled' });
  const overflow = await page.locator('.image-preview-panel').evaluate((panel) => {
    const bounds = panel.getBoundingClientRect();
    return Array.from(panel.querySelectorAll('button')).some((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left < bounds.left || rect.right > bounds.right || rect.bottom > bounds.bottom;
    });
  });
  expect(overflow).toBe(false);
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

test('zooms with a touch pinch on mobile', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch gestures');
  await loadComparison(page);
  await page.locator('del[data-diff-image] img').first().click();
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
