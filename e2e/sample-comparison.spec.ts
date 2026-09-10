import { expect, test } from '@playwright/test';

test('loads the sample documents and renders a comparison', async ({ page }) => {
  await page.goto('./');
  await page.locator('.local-processing-strip button').click();

  await expect(page.locator('.floating-navigator')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.docx-render-content')).toHaveCount(2);
  await expect(page.locator('.summary-chip.similarity')).toHaveCount(1);
});

/**
 * Contract figures illustrate their neighboring clauses while demonstrating
 * modified payments, an unchanged service chain, a removed acceptance rule and
 * a newly added data-incident response obligation.
 */
test('shows every kind of figure difference in the sample comparison', async ({ page }) => {
  await page.goto('./');
  await page.locator('.local-processing-strip button').click();
  await expect(page.locator('.floating-navigator')).toBeVisible({ timeout: 30_000 });

  const baseline = page.locator('.view-dock-panel').first();
  const revised = page.locator('.view-dock-panel').last();

  // The revised payment chart and the removed acceptance flow.
  await expect(baseline.locator('del[data-diff-image] img')).toHaveCount(2);
  // The revised payment chart and the added incident-response diagram.
  await expect(revised.locator('ins[data-diff-image] img')).toHaveCount(2);

  // The chart appears on both sides under one difference id: the same figure,
  // revised, rather than one removed beside one added.
  const revisedChartId = await baseline
    .locator('del[data-diff-image]:has(img[data-ddv-image-change="revised"])')
    .getAttribute('data-diff-id');
  await expect(revised.locator(`ins[data-diff-image][data-diff-id="${revisedChartId}"]`)).toHaveCount(1);

  // The service chain is byte-identical — six figures rendered, four marked.
  await expect(page.locator('.docx-render-content img')).toHaveCount(6);

  // Each figure belongs beside its contract clause, with enough source pixels
  // for a readable enlarged preview rather than a stretched thumbnail.
  for (const [pane, sections] of [
    [baseline, ['第一条服务范围', '第二条交付与验收', '第三条费用与支付']],
    [revised, ['第一条服务范围', '第三条费用与支付', '第五条数据安全与保密']]
  ] as const) {
    const figures = await pane.locator('.docx-render-content img').evaluateAll((images) =>
      images.map((image) => {
        const root = image.closest('.docx-render-content');
        let block: Element = image;
        while (block.parentElement && block.parentElement !== root) block = block.parentElement;
        let heading = block.previousElementSibling;
        while (heading && !heading.matches('h2')) heading = heading.previousElementSibling;
        return {
          section: heading?.textContent?.replace(/\s/g, ''),
          width: (image as HTMLImageElement).naturalWidth
        };
      })
    );
    expect(figures.map((figure) => figure.section)).toEqual(sections);
    expect(figures.every((figure) => figure.width >= 1500)).toBe(true);
  }

  // Every marked figure carries the label the review list previews it by. The
  // word in front of the dimensions is localized, so only the shape is asserted.
  await expect(baseline.locator('del[data-diff-image]').first()).toHaveAttribute('data-diff-image', /\S+ \d+×\d+/);
});

test('opens a full-size preview without losing image-difference focus', async ({ page }) => {
  await page.goto('./');
  await page.locator('.local-processing-strip button').click();
  await expect(page.locator('.floating-navigator')).toBeVisible({ timeout: 30_000 });

  const image = page.locator('del[data-diff-image] img[data-ddv-image-change="revised"]').first();
  const source = await image.getAttribute('src');
  await image.click();

  const preview = page.locator('.image-preview-overlay');
  await expect(preview).toBeVisible();
  await expect(preview.locator('.image-preview-pane[data-side="A"] .image-preview-image')).toHaveAttribute(
    'src',
    source ?? ''
  );
  await expect(preview.locator('.image-preview-image')).toHaveCount(2);
  await expect(page.locator('del[data-diff-image].focus-diff')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
});

/**
 * The native equation and VML text box survive conversion. Word/WPS may also
 * save a DrawingML alternative and an empty image marker for that same text
 * box; neither is another piece of missing content.
 */
test('retains centered equations without reporting them as missing content', async ({ page }) => {
  await page.goto('./');
  await page.locator('.local-processing-strip button').click();
  await expect(page.locator('.floating-navigator')).toBeVisible({ timeout: 30_000 });

  await expect(page.locator('.warning-chip.uncomparable')).toHaveCount(0);
  const equations = page.locator('.docx-render-content math');
  await expect(equations).toHaveCount(2);
  for (const equation of await equations.all()) {
    await expect(equation).toContainText('阶段付款金额');
    await expect(equation.locator('..')).toHaveCSS('text-align', 'center');
  }
  await expect(page.locator('.docx-render-content math ins, .docx-render-content math del')).toHaveCount(0);
  const archiveNote = '履约资料：源代码、部署包、测试报告与验收记录应完整归档。';
  await expect(page.locator('.docx-render-content')).toContainText([archiveNote, archiveNote]);
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
