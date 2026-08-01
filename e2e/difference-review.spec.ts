import { expect, test, type Page } from '@playwright/test';

const SETTINGS_KEY = 'doc-diff-settings';

/**
 * Seeds user settings before the app boots. Difference ignore and report
 * export are off by default, and driving the settings panel for every test
 * would test the panel rather than the review workflow.
 */
async function seedSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, JSON.stringify(value));
    },
    [SETTINGS_KEY, settings]
  );
}

async function loadSampleComparison(page: Page): Promise<void> {
  await page.goto('./');
  await page.locator('.local-processing-strip button').click();
  await expect(page.locator('.floating-navigator')).toBeVisible({ timeout: 30_000 });
}

/** The progressbar publishes the active difference as aria-valuenow. */
function activeDiffPosition(page: Page) {
  return page.locator('.diff-progress');
}

test.describe('difference review', () => {
  test.beforeEach(async ({ page }) => {
    await seedSettings(page, {
      diffGranularity: 'char',
      enableDiffIgnore: true,
      enableSimilarDiffs: true,
      showReportExport: true,
      showDiffMap: true,
      syncScroll: true
    });
  });

  test('steps through differences with Alt+ArrowDown and Alt+ArrowUp', async ({ page }) => {
    await loadSampleComparison(page);

    const position = activeDiffPosition(page);
    await expect(position).toHaveAttribute('aria-valuenow', '1');

    await page.keyboard.press('Alt+ArrowDown');
    await expect(position).toHaveAttribute('aria-valuenow', '2');

    await page.keyboard.press('Alt+ArrowDown');
    await expect(position).toHaveAttribute('aria-valuenow', '3');

    await page.keyboard.press('Alt+ArrowUp');
    await expect(position).toHaveAttribute('aria-valuenow', '2');
  });

  test('moves between differences with the previous and next buttons', async ({ page }) => {
    await loadSampleComparison(page);

    const position = activeDiffPosition(page);
    await page.locator('.btn-action-nav--next').click();
    await expect(position).toHaveAttribute('aria-valuenow', '2');

    await page.locator('.btn-action-nav--previous').click();
    await expect(position).toHaveAttribute('aria-valuenow', '1');
  });

  // Regression guard: the ignore popover used to appear only after a direct
  // click, because the visibility predicate was fed an array index instead of
  // a bounding rect whenever no preferred element had been recorded.
  test('shows the ignore popover after keyboard navigation', async ({ page }) => {
    await loadSampleComparison(page);

    await page.keyboard.press('Alt+ArrowDown');

    await expect(page.locator('.diff-action-popover')).toBeVisible();
  });

  test('ignores and restores a difference', async ({ page }) => {
    await loadSampleComparison(page);

    // aria-valuemax carries the active difference count, which is what
    // ignoring and restoring changes. aria-valuenow also moves, so comparing
    // the rendered "n/m" text would be comparing two moving parts.
    const progress = activeDiffPosition(page);
    const before = await progress.getAttribute('aria-valuemax');

    await page.locator('.diff-action-popover__button--main').first().click();
    await expect(progress).not.toHaveAttribute('aria-valuemax', before ?? '');

    // The restore control lives in the ignored-difference dialog.
    await page.locator('.summary-chip.ignored').click();
    await page.locator('.ignored-diff-restore-all').click();

    await expect(progress).toHaveAttribute('aria-valuemax', before ?? '');
  });

  test('toggles ignore with the I shortcut', async ({ page }) => {
    await loadSampleComparison(page);

    const progress = activeDiffPosition(page);
    const before = await progress.getAttribute('aria-valuemax');

    await page.keyboard.press('i');

    await expect(progress).not.toHaveAttribute('aria-valuemax', before ?? '');
  });

  test('jumps to a difference from the difference map', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The difference map is hidden below 820px');
    await loadSampleComparison(page);

    const markers = page.locator('.diff-map__marker');
    await expect(markers.first()).toBeVisible();
    await expect(markers.first()).toHaveAttribute('aria-current', 'true');

    // Markers are 16x12 dots positioned by percentage, so a coordinate-based
    // click can land on an overlapping neighbour even with force. Dispatch on
    // the element itself. The map lists only differences it could place, so
    // assert against the marker rather than assuming nth marker == nth diff.
    const third = markers.nth(2);
    await third.dispatchEvent('click');

    await expect(third).toHaveAttribute('aria-current', 'true');
    await expect(markers.first()).not.toHaveAttribute('aria-current', 'true');
  });

  test('exports an HTML review report', async ({ page }) => {
    await loadSampleComparison(page);

    const download = page.waitForEvent('download');
    await page.locator('.summary-chip.export-report').click();

    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.html$/);
  });
});

test.describe('narrow screens', () => {
  test.beforeEach(async ({ page }) => {
    await seedSettings(page, { enableDiffIgnore: true, showDiffMap: true, syncScroll: true });
  });

  test('keeps the active difference when switching panes', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile layout only');
    await loadSampleComparison(page);

    await page.keyboard.press('Alt+ArrowDown');
    const position = activeDiffPosition(page);
    await expect(position).toHaveAttribute('aria-valuenow', '2');

    await page.locator('.mobile-pane-switch__option.is-revised').click();

    await expect(position).toHaveAttribute('aria-valuenow', '2');
    await expect(page.locator('.view-dock-panel.mobile-pane-active')).toHaveCount(1);
  });
});
