import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { DocDiffProApi } from '../src/services/externalDocumentApi';

type ProbeWindow = Window & {
  externalProbe?: {
    api?: DocDiffProApi;
    readyEvents: number;
    results: Array<{ total: number; bizId?: string }>;
  };
  replacementProbe?: {
    releaseRevised?: () => void;
    firstOutcome?: Promise<string>;
    errors: number;
    results: Array<string | undefined>;
  };
};

for (const filename of ['invalid.pdf', 'corrupt.docx']) {
  test(`reports an external import failure through rejection, event and current state (${filename})`, async ({
    page
  }) => {
    await page.addInitScript(() => {
      window.__DOC_DIFF_CONFIG__ = { documentInput: 'external', locale: 'zh-CN' };
    });
    await page.goto('./');
    await page.waitForFunction(() => window.DocDiffPro?.ready);
    const outcome = await page.evaluate(async (name) => {
      const api = window.DocDiffPro!;
      const events: Array<{
        message: string;
        side?: string;
        phase?: string;
        bizId?: string;
        state: ReturnType<typeof api.getState>;
      }> = [];
      api.on('error', ({ message, side, phase, meta }) =>
        events.push({ message, side, phase, bizId: meta?.bizId, state: api.getState() })
      );
      try {
        await api.loadDocuments({
          revised: new File([new Uint8Array([1, 2, 3, 4])], name),
          meta: { bizId: 'bad-import' }
        });
        return { rejected: false, events, state: api.getState() };
      } catch (error) {
        return { rejected: true, errorName: (error as Error).name, events, state: api.getState() };
      }
    }, filename);
    expect(outcome.rejected).toBe(true);
    expect(outcome.errorName).toBe('DocumentImportError');
    expect(outcome.events).toEqual([
      {
        message: expect.any(String),
        side: 'B',
        phase: 'import',
        bizId: 'bad-import',
        state: outcome.state
      }
    ]);
    expect(outcome.state).toMatchObject({ ready: false, comparing: false, hasDocuments: true, hasResult: false });
    expect(outcome.state.error).toBeTruthy();
    await expect(page.locator('.state-card.error')).toBeVisible();
  });
}

test('invalidates a pending pair after its already imported baseline is replaced', async ({ page }) => {
  const [baseline, revised] = await Promise.all([
    readFile('e2e/fixtures/clauses-original.docx'),
    readFile('e2e/fixtures/clauses-revised.docx')
  ]);
  await page.addInitScript(() => {
    window.__DOC_DIFF_CONFIG__ = { documentInput: 'external', locale: 'zh-CN' };
    const probe: NonNullable<ProbeWindow['replacementProbe']> = { errors: 0, results: [] };
    (window as ProbeWindow).replacementProbe = probe;
    const read = Reflect.get(File.prototype, 'arrayBuffer');
    File.prototype.arrayBuffer = function (this: File) {
      if (this.name !== 'old-b.docx') return read.call(this);
      return new Promise<ArrayBuffer>((resolve) => {
        probe.releaseRevised = () => resolve(read.call(this));
      });
    };
  });
  await page.goto('./');
  await page.waitForFunction(() => window.DocDiffPro?.ready);
  await page.evaluate(
    ({ original, revision }) => {
      const api = window.DocDiffPro!;
      const probe = (window as ProbeWindow).replacementProbe!;
      api.on('error', () => probe.errors++);
      api.on('result', ({ meta }) => probe.results.push(meta?.bizId));
      probe.firstOutcome = api
        .loadDocuments({
          baseline: new File([new Uint8Array(original)], 'old-a.docx'),
          revised: new File([new Uint8Array(revision)], 'old-b.docx'),
          meta: { bizId: 'old' }
        })
        .then(
          () => 'resolved',
          (error: Error) => error.name
        );
    },
    { original: Array.from(baseline), revision: Array.from(revised) }
  );
  await expect(page.locator('.side-original .status-chip')).toHaveClass(/\bready\b/);
  await expect(page.locator('.side-revision .status-chip')).toHaveClass(/\bparsing\b/);
  const loaded = await page.evaluate(
    async (revision) =>
      window.DocDiffPro!.loadDocuments({
        baseline: new File([new Uint8Array(revision)], 'new-a.docx'),
        meta: { bizId: 'new' }
      }),
    Array.from(revised)
  );
  expect(loaded.sequence).toBe(2);
  const firstOutcome = await page.evaluate(async () => {
    const probe = (window as ProbeWindow).replacementProbe!;
    probe.releaseRevised!();
    return probe.firstOutcome!;
  });
  expect(firstOutcome).toBe('AbortError');
  await expect(page.locator('.summary-chip.total')).toHaveText('无差异');
  await expect(page.locator('.side-original .file-name-text')).toHaveText('new-a.docx');
  await expect(page.locator('.side-revision .file-name-text')).toHaveText('old-b.docx');
  await page.waitForFunction(() => (window as ProbeWindow).replacementProbe!.results.length === 1);
  expect(
    await page.evaluate(() => {
      const { errors, results } = (window as ProbeWindow).replacementProbe!;
      return { errors, results };
    })
  ).toEqual({ errors: 0, results: ['new'] });
});

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
