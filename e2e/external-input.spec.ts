import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { DocDiffProApi } from '../src/services/externalDocumentApi';

type ProbeWindow = Window & {
  externalProbe?: {
    api?: DocDiffProApi;
    readyEvents: number;
    results: Array<{ total: number; bizId?: string }>;
  };
};

test('keeps an external subscription and request sequence through a language switch', async ({ page }) => {
  const [baseline, revised] = await Promise.all([
    readFile('e2e/fixtures/clauses-original.docx'),
    readFile('e2e/fixtures/clauses-revised.docx')
  ]);
  await page.addInitScript(() => {
    window.__DOC_DIFF_CONFIG__ = { documentInput: 'both', locale: 'en' };
    const probe = ((window as ProbeWindow).externalProbe = { readyEvents: 0, results: [] });
    window.addEventListener('doc-diff-pro:ready', () => probe.readyEvents++);
  });
  await page.goto('./');
  await page.waitForFunction(() => window.DocDiffPro?.ready);
  const first = await page.evaluate(
    async ({ original, revision }) => {
      const probe = (window as ProbeWindow).externalProbe!;
      const api = (probe.api = window.DocDiffPro!);
      api.on('result', ({ summary, meta }) => probe.results.push({ total: summary.total, bizId: meta?.bizId }));
      return api.loadDocuments({
        baseline: new File([new Uint8Array(original)], 'original.docx'),
        revised: new File([new Uint8Array(revision)], 'revised.docx'),
        meta: { bizId: 'first' }
      });
    },
    { original: Array.from(baseline), revision: Array.from(revised) }
  );
  expect(first.sequence).toBe(1);
  await expect(page.locator('.diff-progress')).toHaveAttribute('aria-valuemax', '5');

  await page.locator('.language-trigger').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  expect(await page.evaluate(() => window.DocDiffPro === (window as ProbeWindow).externalProbe!.api)).toBe(true);
  const second = await page.evaluate(async (revision) => {
    return window.DocDiffPro!.loadDocuments({
      baseline: new File([new Uint8Array(revision)], 'equal.docx'),
      meta: { bizId: 'second' }
    });
  }, Array.from(revised));
  expect(second.sequence).toBe(2);
  await expect(page.locator('.summary-chip.total')).toContainText('无差异');
  expect(
    await page.evaluate(() => {
      const { readyEvents, results } = (window as ProbeWindow).externalProbe!;
      return { readyEvents, results };
    })
  ).toEqual({
    readyEvents: 1,
    results: [
      { total: 5, bizId: 'first' },
      { total: 0, bizId: 'second' }
    ]
  });
});
