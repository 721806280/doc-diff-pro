import { expect, test, type Page } from '@playwright/test';

test.use({ locale: 'zh-CN' });

type ImageAllocationProbe = { attempts: number; created: string[]; revoked: string[] };

async function compareFixture(page: Page, fixture: string) {
  await page.goto('./');
  await page.locator('input[type="file"]').nth(0).setInputFiles(`e2e/fixtures/${fixture}-original.docx`);
  await page.locator('input[type="file"]').nth(1).setInputFiles(`e2e/fixtures/${fixture}-revised.docx`);
  await expect(page.locator('.floating-navigator')).toBeVisible();
  return [page.locator('.docx-render-content').first(), page.locator('.docx-render-content').last()] as const;
}

test('preserves joining characters and highlights complete Unicode characters', async ({ page }) => {
  const [original, revised] = await compareFixture(page, 'unicode');
  await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '3');
  await expect(original.locator('del').filter({ hasText: '😀' })).toHaveCount(1);
  await expect(revised.locator('ins').filter({ hasText: '😁' })).toHaveCount(1);
  await expect(original.locator('del').filter({ hasText: '𐀀' })).toHaveCount(1);
  await expect(revised.locator('ins').filter({ hasText: '𠀀' })).toHaveCount(1);
  await expect(original).toContainText('می\u200cروم');
  await expect(revised).toContainText('میروم');
  for (const pane of [original, revised]) {
    await expect(pane).toContainText('👩\u200d💻');
    expect(
      await pane.evaluate((root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (!node.textContent?.isWellFormed()) return false;
        }
        return true;
      })
    ).toBe(true);
  }
});

test('marks every critical clause change without marking unchanged repeated paragraphs', async ({ page }) => {
  const [original, revised] = await compareFixture(page, 'clauses');
  const expected = [
    ['付款金额：100000.00元。', '付款金额：120000.00元。'],
    ['交付日期：2026年9月10日。', '交付日期：2026年10月10日。'],
    ['每日违约金比例：0.05%。', '每日违约金比例：0.08%。'],
    ['乙方不得转包服务。', '乙方可以转包服务。'],
    ['通知送达期限：3日。', '通知送达期限：7日。']
  ];
  for (const [before, after] of expected) {
    const removed = original.locator('p').filter({ hasText: before });
    const inserted = revised.locator('p').filter({ hasText: after });
    await expect(removed).toHaveCount(1);
    await expect(inserted).toHaveCount(1);
    await expect(removed.locator('del[data-diff-id]').first()).not.toBeEmpty();
    await expect(inserted.locator('ins[data-diff-id]').first()).not.toBeEmpty();
  }
  await expect(original.locator('del').filter({ hasText: '不得' })).toHaveCount(1);
  for (const pane of [original, revised]) {
    const repeated = pane.locator('p').filter({ hasText: '双方应妥善保存履约记录。' });
    await expect(repeated).toHaveCount(2);
    await expect(repeated.locator('[data-diff-id]')).toHaveCount(0);
  }
  await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '5');
});

test('preserves merged cells and distinguishes repeated, re-encoded and edited figures', async ({ page }) => {
  const [original, revised] = await compareFixture(page, 'structure-images');
  for (const pane of [original, revised]) {
    await expect(pane.locator('td[colspan="2"]')).toHaveText('预算汇总');
    await expect(pane.locator('td[rowspan="2"]')).toHaveText('服务费');
    const images = pane.locator('img');
    await expect(images).toHaveCount(3);
    await expect(images.nth(0)).toHaveAttribute('data-ddv-image-change', 'unchanged');
    await expect(images.nth(1)).toHaveAttribute('data-ddv-image-change', 'revised');
    await expect(images.nth(2)).toHaveAttribute('data-ddv-image-change', 'revised');
  }
  await expect(original.locator('table del').first()).not.toBeEmpty();
  await expect(revised.locator('table ins').first()).not.toBeEmpty();
  for (let index = 0; index < 3; index++) {
    const pair = await original.locator('img').nth(index).getAttribute('data-ddv-image-pair');
    expect(pair).toBeTruthy();
    await expect(revised.locator('img').nth(index)).toHaveAttribute('data-ddv-image-pair', pair!);
  }
  await original.locator('img').nth(1).click();
  await expect(page.locator('.image-preview-image')).toHaveCount(2);
  // Different bytes are capped at 99%, even when the decoded pixels agree.
  await expect(page.locator('.image-preview-similarity')).toContainText('99%');
  await expect(page.locator('.image-preview-status').filter({ hasText: '内容相同' })).toHaveCount(0);
});

for (const fixture of ['tracked', 'tracked-aliased']) {
  test(`explains accepted tracked changes from the document notice (${fixture})`, async ({
    page,
    isMobile
  }, testInfo) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 740 });
    const panes = await compareFixture(page, fixture);
    for (const pane of panes) await expect(pane).toHaveText('交付期限为15日。');
    await expect(page.locator('.summary-chip.total')).toHaveText('无差异');
    if (isMobile) await page.locator('.mobile-pane-switch__option.is-revised').click();
    const notice = page.locator('.warning-chip.revisions');
    await expect(notice).toBeVisible();
    await notice.locator('.warning-chip__trigger').focus();
    const tooltip = notice.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('全部修订被接受后的状态');
    const bounds = await tooltip.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: testInfo.outputPath('document-notice.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '切换到夜间模式', exact: true }).click();
    await notice.locator('.warning-chip__trigger').focus();
    await expect(tooltip).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('document-notice-dark.png'), animations: 'disabled' });
  });
}

for (const fixture of ['native-chart', 'native-chart-aliased']) {
  test(`qualifies a zero-difference result when native chart data could not be compared (${fixture})`, async ({
    page
  }) => {
    await compareFixture(page, fixture);
    await expect(page.locator('.summary-chip.total')).toHaveText('已解析内容无差异');
    await expect(page.locator('.summary-chip.total')).not.toHaveClass(/clean/);
    await expect(page.locator('.warning-chip.uncomparable')).toHaveCount(2);
    const notice = page.locator('.warning-chip.uncomparable').first();
    await notice.locator('.warning-chip__trigger').focus();
    await expect(notice.getByRole('tooltip')).toBeVisible();
    await expect(notice.getByRole('tooltip')).toContainText('1');
  });
}

test('releases images after a partial allocation failure and allows a fresh import', async ({ page }) => {
  await page.addInitScript(() => {
    const probe: ImageAllocationProbe = { attempts: 0, created: [], revoked: [] };
    Reflect.set(window, '__imageAllocationProbe', probe);
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob instanceof Blob && blob.type === 'image/png') {
        probe.attempts++;
        if (probe.attempts === 2) throw new Error('Image allocation failed');
        const url = create(blob);
        probe.created.push(url);
        return url;
      }
      return create(blob);
    };
    URL.revokeObjectURL = (url) => {
      if (probe.created.includes(url)) probe.revoked.push(url);
      revoke(url);
    };
  });
  await page.goto('./');
  const originalInput = page.locator('input[type="file"]').first();
  await originalInput.setInputFiles('e2e/fixtures/structure-images-original.docx');
  await expect(page.getByText('无法解析该 DOCX 文件。Image allocation failed', { exact: true })).toBeVisible();
  const probe = await page.evaluate(() => Reflect.get(window, '__imageAllocationProbe') as ImageAllocationProbe);
  expect(probe.created).toHaveLength(1);
  expect(probe.revoked).toEqual(probe.created);

  await originalInput.setInputFiles('e2e/fixtures/structure-images-original.docx');
  await page.locator('input[type="file"]').last().setInputFiles('e2e/fixtures/structure-images-revised.docx');
  await expect(page.locator('.floating-navigator')).toBeVisible();
  await expect(page.locator('.docx-render-content img')).toHaveCount(6);
  await expect
    .poll(() =>
      page
        .locator('.docx-render-content img')
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)
        )
    )
    .toBe(true);
});

test('keeps conversion warnings beside the document when parsed content is identical', async ({ page }) => {
  await page.goto('./');
  for (const input of await page.locator('input[type="file"]').all()) {
    await input.setInputFiles('public/samples/baseline.docx');
  }
  await expect(page.locator('.summary-chip.total')).toHaveText('已解析内容无差异');
  await expect(page.locator('.summary-chip.total')).toHaveClass(/limited/);
  const notice = page.locator('.warning-chip:not(.uncomparable):not(.revisions)').first();
  await notice.locator('.warning-chip__trigger').focus();
  await expect(notice.getByRole('tooltip')).toBeVisible();
  await expect(notice.locator('li').first()).not.toBeEmpty();
});
