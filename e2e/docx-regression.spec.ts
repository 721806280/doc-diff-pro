import { expect, test, type Page } from '@playwright/test';
import type { DocDiffProState } from '../src/services/externalDocumentApi';

test.use({ locale: 'zh-CN' });

type ImageAllocationProbe = { attempts: number; created: string[]; revoked: string[] };
type LargeImageProbe = { decodes: number; imageUrls: number };

async function compareFixture(page: Page, fixture: string) {
  await page.goto('./');
  await page.locator('input[type="file"]').nth(0).setInputFiles(`e2e/fixtures/${fixture}-original.docx`);
  await page.locator('input[type="file"]').nth(1).setInputFiles(`e2e/fixtures/${fixture}-revised.docx`);
  await expect(page.locator('.floating-navigator')).toBeVisible();
  return [page.locator('.docx-render-content').first(), page.locator('.docx-render-content').last()] as const;
}

for (const ignoreSpaces of [true, false]) {
  test(`detects edits that move numeric text across table cells (ignoreSpaces=${ignoreSpaces})`, async ({ page }) => {
    await page.addInitScript(
      (ignore) => localStorage.setItem('doc-diff-settings', JSON.stringify({ ignoreSpaces: ignore })),
      ignoreSpaces
    );
    const [original, revised] = await compareFixture(page, 'table-boundary');
    const leftCells = original.locator('tr').nth(1).locator('td');
    const rightCells = revised.locator('tr').nth(1).locator('td');
    for (const [index, before, after] of [
      [1, '1', '12'],
      [2, '23', '3']
    ] as const) {
      await expect(leftCells.nth(index)).toHaveText(before);
      await expect(rightCells.nth(index)).toHaveText(after);
      // An added digit belongs only to the revised side; a deleted one to the original.
      expect(
        (await leftCells.nth(index).locator('[data-diff-id]').count()) +
          (await rightCells.nth(index).locator('[data-diff-id]').count())
      ).toBeGreaterThan(0);
    }
    await expect(page.locator('.summary-chip.total')).not.toContainText('无差异');
    await expect(page.locator('.summary-chip.similarity')).not.toContainText('100%');
  });
}

test('preserves repeated confidentiality clauses when layout filtering is enabled', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('doc-diff-settings', JSON.stringify({ filterLayoutNoise: true }))
  );
  const [original, revised] = await compareFixture(page, 'confidential');
  await expect(original.locator('p').filter({ hasText: '双方承担保密义务，期限为1年。' })).toHaveCount(2);
  await expect(revised.locator('p').filter({ hasText: '双方承担保密义务，期限为3年。' })).toHaveCount(2);
  await expect(original.locator('del')).toHaveCount(2);
  await expect(revised.locator('ins')).toHaveCount(2);
  await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '2');
  await expect(page.locator('.summary-chip.layout-noise')).toHaveCount(0);
});

test('finishes a comparison with an empty body on only one side', async ({ page }) => {
  const [original, revised] = await compareFixture(page, 'empty-body');
  await expect(original).toHaveText('（空文档）');
  await expect(revised).toContainText('乙方须于30日内交付。');
  await expect(revised.locator('ins').first()).not.toBeEmpty();
  await expect(page.locator('.spinner-large')).toHaveCount(0);
  await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '1');
});

for (const filename of ['header-only.docx', 'blank.docx']) {
  test(`finishes two empty bodies once and keeps placeholders out of comparison (${filename})`, async ({ page }) => {
    await page.addInitScript(() => {
      window.__DOC_DIFF_CONFIG__ = { documentInput: 'both', locale: 'zh-CN' };
    });
    await page.goto('./');
    await page.waitForFunction(() => window.DocDiffPro?.ready);
    await page.evaluate(() => {
      const states: DocDiffProState[] = [];
      Reflect.set(window, '__emptyResultStates', states);
      window.DocDiffPro!.on('result', () => states.push(window.DocDiffPro!.getState()));
    });
    for (const input of await page.locator('input[type="file"]').all())
      await input.setInputFiles(`e2e/fixtures/${filename}`);
    await expect(page.locator('.floating-navigator')).toBeVisible();
    await expect(page.locator('.summary-chip.total')).toHaveText('无差异');
    for (const pane of await page.locator('.docx-render-content').all()) await expect(pane).toHaveText('（空文档）');
    await page.locator('.language-trigger').click();
    for (const pane of await page.locator('.docx-render-content').all())
      await expect(pane).toHaveText('(Empty document)');
    // A short observation window catches the previous repeated auto-comparison loop.
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => Reflect.get(window, '__emptyResultStates') as DocDiffProState[])).toEqual([
      { ready: true, comparing: false, hasDocuments: true, hasResult: true, error: '' }
    ]);
    await expect(page.locator('.spinner-large')).toHaveCount(0);
  });
}

test('shows a completed empty result after filtering all body layout text', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('doc-diff-settings', JSON.stringify({ filterLayoutNoise: true }))
  );
  const panes = await compareFixture(page, 'layout-only');
  for (const pane of panes) await expect(pane).toHaveText('（空文档）');
  await expect(page.locator('.summary-chip.total')).toHaveText('无差异');
  await expect(page.locator('.summary-chip.layout-noise')).toContainText('2');
  await expect(page.locator('.spinner-large')).toHaveCount(0);
});

test('reviews a link target change with identical display text', async ({ page }) => {
  const [original, revised] = await compareFixture(page, 'link');
  await expect(original.locator('a')).toHaveAttribute('href', 'https://original.example.com/pay');
  await expect(revised.locator('a')).toHaveAttribute('href', 'https://revised.example.com/pay');
  await expect(original.locator('del[data-diff-semantic]')).toHaveAttribute(
    'data-diff-semantic',
    /original\.example\.com/
  );
  await expect(revised.locator('ins[data-diff-semantic]')).toHaveAttribute(
    'data-diff-semantic',
    /revised\.example\.com/
  );
  await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '1');
});

test('reviews the conversion from normal text to superscript', async ({ page }) => {
  const [original, revised] = await compareFixture(page, 'superscript');
  await expect(original.locator('del[data-diff-semantic]')).toHaveText('2');
  await expect(revised.locator('sup > ins[data-diff-semantic]')).toHaveText('2');
  await expect(revised.locator('ins')).toHaveAttribute('data-diff-semantic', '上标');
  await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '1');
});

test('preserves link semantics without nested highlights when repairing a long table cell', async ({ page }) => {
  const [original, revised] = await compareFixture(page, 'long-table-semantic');
  const label = '付款入口说明'.repeat(10);
  for (const [pane, operation, first, last] of [
    [original, 'del', '旧', '末'],
    [revised, 'ins', '新', '尾']
  ] as const) {
    await expect(pane.locator(`a > ${operation}[data-diff-semantic]`)).toHaveText(label);
    await expect(pane.locator(`${operation} ${operation}`)).toHaveCount(0);
    await expect(pane.locator('td').nth(1)).toHaveText('正文'.repeat(1100) + first + label + last);
  }
  await expect(page.locator('.summary-chip.total')).not.toContainText('无差异');
});

test('marks an explicit inline line-break deletion', async ({ page }) => {
  const [original, revised] = await compareFixture(page, 'line-break');
  await expect(original.locator('del[data-diff-line-break] > br')).toHaveCount(1);
  await expect(original.locator('del')).toHaveAttribute('data-diff-semantic', '换行');
  await expect(revised).toHaveText('AB');
  await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '1');
});

test('detects a single unchanged image moved relative to the clauses', async ({ page }) => {
  const panes = await compareFixture(page, 'image-moved');
  for (const pane of panes) {
    await expect(pane.locator('img')).toHaveAttribute('data-ddv-image-change', 'moved');
    await expect(pane.locator('[data-diff-image] > img')).toHaveCount(1);
  }
  await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '1');
});

for (const [filename, limit] of [
  ['large-image.docx', 'image-pixels'],
  ['large-image-svg-filter.docx', 'image-pixels'],
  ['large-image-svg-html.docx', 'unknown-dimensions']
] as const) {
  test(`blocks oversized or unverifiable image sources from decoding, body loading and preview while comparing their bytes (${filename})`, async ({
    page
  }) => {
    await page.addInitScript(() => {
      const probe = { decodes: 0, imageUrls: 0 };
      Reflect.set(window, '__largeImageProbe', probe);
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        if (blob instanceof Blob && blob.type.startsWith('image/')) probe.imageUrls++;
        return create(blob);
      };
      if (typeof window.createImageBitmap === 'function') {
        window.createImageBitmap = new Proxy(window.createImageBitmap.bind(window), {
          apply(target, context, args) {
            probe.decodes++;
            return Reflect.apply(target, context, args) as Promise<ImageBitmap>;
          }
        });
      }
    });
    await page.goto('./');
    for (const input of await page.locator('input[type="file"]').all())
      await input.setInputFiles(`e2e/fixtures/${filename}`);
    await expect(page.locator('.floating-navigator')).toBeVisible();
    const images = page.locator('.docx-render-content img');
    await expect(images).toHaveCount(2);
    for (const image of await images.all()) {
      await expect(image).toHaveAttribute('data-ddv-image-resource-limit', limit);
      await expect(image).toHaveAttribute('data-ddv-image-change', 'unchanged');
      expect(await image.getAttribute('src')).toBeNull();
      expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(0);
    }
    await expect(page.locator('button[aria-label="1 张图片无法预览"]')).toHaveCount(2);
    await expect(page.locator('.summary-chip.total')).toHaveText('已解析内容无差异');
    expect(await page.evaluate(() => Reflect.get(window, '__largeImageProbe') as LargeImageProbe)).toEqual({
      decodes: 0,
      imageUrls: 0
    });
    await images.first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
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

test('detects different PNGs with the same legacy short hash without Web Crypto', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: undefined });
  });
  const panes = await compareFixture(page, 'hash-collision');
  await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '1');
  const colors = [];
  for (const pane of panes) {
    const image = pane.locator('img');
    await expect(image).toHaveAttribute('data-ddv-image-change', 'revised');
    colors.push(
      await image.evaluate(async (element: HTMLImageElement) => {
        await element.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        context.drawImage(element, 0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
      })
    );
  }
  expect(colors).toEqual([
    [255, 0, 0],
    [0, 0, 255]
  ]);
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

test('releases images after a partial allocation failure and allows a fresh import', async ({ page, isMobile }) => {
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
  // The revised fixture contains distinct payloads; duplicate originals now share a URL.
  await originalInput.setInputFiles('e2e/fixtures/structure-images-revised.docx');
  await expect(page.getByText('无法解析该 DOCX 文件。Image allocation failed', { exact: true })).toBeVisible();
  const probe = await page.evaluate(() => Reflect.get(window, '__imageAllocationProbe') as ImageAllocationProbe);
  expect(probe.created).toHaveLength(1);
  expect(probe.revoked).toEqual(probe.created);

  await originalInput.setInputFiles('e2e/fixtures/structure-images-original.docx');
  await page.locator('input[type="file"]').last().setInputFiles('e2e/fixtures/structure-images-revised.docx');
  await expect(page.locator('.floating-navigator')).toBeVisible();
  // WebKit leaves lazy images in the inactive mobile pane unloaded. Visit each
  // pane and bring every figure into view before checking the recovered sources.
  for (const [side, selector] of [
    ['A', '.side-original'],
    ['B', '.side-revision']
  ] as const) {
    const pane = page.locator(selector);
    if (isMobile) {
      const option = page.locator(`.mobile-pane-switch__option[data-pane="${side}"]`);
      await option.click();
      await expect(option).toHaveAttribute('aria-checked', 'true');
      await expect(pane).toHaveClass(/mobile-pane-active/);
    }
    const images = pane.locator('.docx-render-content img');
    await expect(images).toHaveCount(3);
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeInViewport();
      await expect
        .poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0))
        .toBe(true);
    }
  }
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
