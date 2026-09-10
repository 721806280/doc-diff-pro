import { expect, test, type Page } from '@playwright/test';

test.use({ locale: 'zh-CN' });

async function holdWorker(page: Page) {
  let unblock!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pattern = '**/src/workers/diffWorker.ts*';
  await page.route(pattern, async (route) => {
    started();
    await gate;
    // A canceled worker may already have abandoned this request.
    await route.continue().catch(() => undefined);
  });
  return {
    requested,
    release: async () => {
      unblock();
      await page.unroute(pattern);
    }
  };
}

async function loadPair(page: Page) {
  await page.locator('input[type="file"]').nth(0).setInputFiles('e2e/fixtures/clauses-original.docx');
  await page.locator('input[type="file"]').nth(1).setInputFiles('e2e/fixtures/clauses-revised.docx');
}

test('cancels a comparison and retries without importing the files again', async ({ page }, testInfo) => {
  await page.goto('./');
  const worker = await holdWorker(page);
  try {
    await loadPair(page);
    await worker.requested;
    const task = page.locator('.compare-toast');
    await expect(task).toContainText('正在比对正文');
    await page.screenshot({ path: testInfo.outputPath('task-active.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '切换到夜间模式', exact: true }).click();
    const cancel = task.getByRole('button', { name: '取消', exact: true });
    await cancel.focus();
    await page.screenshot({ path: testInfo.outputPath('task-dark.png'), animations: 'disabled' });
    await page.keyboard.press('Enter');
    await expect(page.locator('.app-task-banner')).toContainText('比对已取消');
    await expect(page.locator('.docx-render-content')).toHaveCount(2);
    await expect(page.locator('.pane-preview-notice, .app-error-banner')).toHaveCount(0);
    await worker.release();
    await page.screenshot({ path: testInfo.outputPath('task-canceled.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '重新比对', exact: true }).click();
    await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '5');
    await expect(page.locator('.app-task-banner')).toHaveCount(0);
  } finally {
    await worker.release();
  }
});

test('keeps the previous result when a settings refresh is canceled', async ({ page }) => {
  await page.goto('./');
  await loadPair(page);
  await expect(page.locator('.floating-navigator')).toBeVisible();
  // The navigation index adds focus classes and tab stops after rendering.
  // Compare the actual content and change groups independently of those styles.
  const readResult = () =>
    page.locator('.docx-render-content').evaluateAll((panes) =>
      panes.map((pane) => ({
        text: pane.textContent,
        changes: Array.from(pane.querySelectorAll('[data-diff-id]'), (change) => ({
          kind: change.tagName,
          id: change.getAttribute('data-diff-id'),
          text: change.textContent
        }))
      }))
    );
  const previousContent = await readResult();
  const worker = await holdWorker(page);
  try {
    await page.locator('.settings-trigger').click();
    await page.locator('.granularity-segmented__option').first().click();
    await page.keyboard.press('Escape');
    await worker.requested;
    await page.locator('.compare-toast').getByRole('button', { name: '取消', exact: true }).click();
    await worker.release();
    await expect(page.locator('.app-task-banner')).toContainText('正在显示上次结果');
    await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '5');
    expect(await readResult()).toEqual(previousContent);
  } finally {
    await worker.release();
  }
});

test('cancels a pending sample download and accepts a manual document', async ({ page }) => {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/samples/*.docx', async (route) => {
    started();
    await gate;
    await route.continue().catch(() => undefined);
  });
  try {
    await page.goto('./');
    await page.locator('.local-processing-strip button').click();
    await requested;
    await page.locator('.compare-toast').getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('.local-processing-strip button')).toBeEnabled();
    release();
    await page.locator('input[type="file"]').first().setInputFiles('e2e/fixtures/clauses-original.docx');
    await expect(page.locator('.docx-render-content')).toContainText('服务合同关键条款');
    await expect(page.locator('.view-dock-panel').first()).toContainText('clauses-original.docx');
    await expect(page.locator('.floating-navigator, .app-error-banner')).toHaveCount(0);
  } finally {
    release();
  }
});
