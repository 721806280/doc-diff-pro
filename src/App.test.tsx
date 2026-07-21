import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '@/i18n';
import type { ParsedDocx } from '@/services/docxParser';
import App from './App';

const mocks = vi.hoisted(() => ({
  parseDocx: vi.fn(),
  compareDocuments: vi.fn(),
  downloadReviewReport: vi.fn<(html: string, fileName: string) => void>(),
  resolveTableStructureHint: vi.fn()
}));

vi.mock('@/services/docxParser', () => ({ parseDocx: mocks.parseDocx }));
vi.mock('@/services/diffEngine', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/diffEngine')>(),
  compareDocuments: mocks.compareDocuments
}));
vi.mock('@/services/reviewReport', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/reviewReport')>(),
  downloadReviewReport: mocks.downloadReviewReport
}));
vi.mock('@/utils/tableStructureHint', () => ({ resolveTableStructureHint: mocks.resolveTableStructureHint }));
vi.mock('@/config/userSettings', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/config/userSettings')>();
  return {
    ...original,
    readSavedUserSettings: () => ({ ...original.DEFAULT_USER_SETTINGS, enableDiffIgnore: true, showReportExport: true }),
    writeSavedUserSettings: vi.fn()
  };
});

describe('React app workflow', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    setLocale('en');
    vi.useRealTimers();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    mocks.parseDocx.mockReset();
    mocks.compareDocuments.mockReset().mockResolvedValue(emptyComparison());
    mocks.downloadReviewReport.mockReset();
    mocks.resolveTableStructureHint.mockReset().mockReturnValue(null);
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders both document upload panes', () => {
    renderApp();
    expect(host.textContent).toContain('Original document (A)');
    expect(host.textContent).toContain('Revised document (B)');
    expect(host.querySelectorAll('input[type="file"]')).toHaveLength(2);
    expect(window.DocDiffPro).toBeUndefined();
  });

  it('rebuilds document errors when the interface locale changes', async () => {
    renderApp();
    await selectFile(0, new File(['text'], 'notes.txt'));
    expect(host.querySelector('.side-original')?.textContent).toContain('Only .docx files are supported');
    await act(async () => { setLocale('zh-CN'); await Promise.resolve(); });
    expect(host.querySelector('.side-original')?.textContent).toContain('仅支持上传 .docx 文件');
  });

  it('rejects invalid, empty, and oversized files before parsing', async () => {
    renderApp();
    await selectFile(0, new File(['text'], 'notes.txt'));
    await selectFile(0, new File([], 'empty.docx'));
    await selectFile(0, fileWithSize('large.docx', 26 * 1024 * 1024));
    expect(mocks.parseDocx).not.toHaveBeenCalled();
    expect(host.querySelector('.side-original')?.textContent).toContain('25 MB');
    expect(host.querySelector('.compare-toast')?.textContent).toContain('25 MB');
  });

  it('keeps the newest file when an older parse finishes later', async () => {
    const first = deferred<ParsedDocx>();
    const second = deferred<ParsedDocx>();
    mocks.parseDocx.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderApp();
    dispatchFile(0, new File(['old'], 'old.docx'));
    dispatchFile(0, new File(['new'], 'new.docx'));
    await act(async () => { second.resolve(parsed('<p>new content</p>')); await Promise.resolve(); });
    await act(async () => { first.resolve(parsed('<p>old content</p>')); await Promise.resolve(); });
    expect(host.querySelector('.side-original')?.textContent).toContain('new.docx');
    expect(host.querySelector('.side-original')?.textContent).not.toContain('old.docx');
  });

  it('compares automatically when both documents are ready', async () => {
    await mountComparedApp();
    expect(mocks.compareDocuments).toHaveBeenCalledTimes(1);
    expect(mocks.compareDocuments).toHaveBeenCalledWith('<p>baseline</p>', '<p>revised</p>', expect.objectContaining({ granularity: 'char' }));
    expect(host.querySelector('.floating-navigator')).toBeTruthy();
  });

  it('moves diff actions when the same difference is selected on the other pane', async () => {
    await mountComparedApp();
    const original = host.querySelector<HTMLElement>('.side-original [data-diff-id="diff-1"]')!;
    const revised = host.querySelector<HTMLElement>('.side-revision [data-diff-id="diff-1"]')!;

    await act(async () => original.click());
    await flush();
    expect(original.classList).toContain('focus-diff');

    await act(async () => revised.click());
    await flush();
    expect(revised.classList).toContain('focus-diff');
  });

  it('supports a deletion that exists only in the original pane', async () => {
    await mountComparedApp(singleSidedComparison('deleted'));
    const original = host.querySelector<HTMLElement>('.side-original [data-diff-id="diff-1"]')!;
    expect(host.querySelector('.side-revision [data-diff-id="diff-1"]')).toBeNull();
    await act(async () => original.click());
    expect(original.classList).toContain('focus-diff');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', cancelable: true })));
    expect(original.classList).toContain('ignored-diff');
  });

  it('supports an insertion that exists only in the revised pane', async () => {
    await mountComparedApp(singleSidedComparison('inserted'));
    const revised = host.querySelector<HTMLElement>('.side-revision [data-diff-id="diff-1"]')!;
    expect(host.querySelector('.side-original [data-diff-id="diff-1"]')).toBeNull();
    await act(async () => revised.click());
    expect(revised.classList).toContain('focus-diff');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', cancelable: true })));
    expect(revised.classList).toContain('ignored-diff');
  });

  it('ignores differences in sequence and restores all of them', async () => {
    await mountComparedApp();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', cancelable: true })));
    expect(host.querySelectorAll('.ignored-diff')).toHaveLength(2);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', cancelable: true })));
    expect(host.querySelectorAll('.ignored-diff')).toHaveLength(4);
    expect(host.querySelectorAll('.focus-diff')).toHaveLength(0);
    expect(host.textContent).toContain('All differences are ignored');
    const restoreAll = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('Restore all'));
    await act(async () => restoreAll?.click());
    expect(host.querySelectorAll('.ignored-diff')).toHaveLength(0);
    expect(host.querySelector('[data-diff-id="diff-1"]')?.classList).toContain('focus-diff');
  });

  it('shows a retry action after comparison fails and retries successfully', async () => {
    mocks.parseDocx.mockResolvedValue(parsed('<p>content</p>'));
    mocks.compareDocuments.mockRejectedValueOnce(new Error('compare exploded')).mockResolvedValueOnce(emptyComparison());
    renderApp();
    await selectFile(0, new File(['a'], 'baseline.docx'));
    await selectFile(1, new File(['b'], 'revised.docx'));
    await flush();
    expect(host.querySelector('.app-error-banner')?.textContent).toContain('compare exploded');
    await act(async () => host.querySelector<HTMLButtonElement>('.app-error-banner button')?.click());
    await flush();
    expect(mocks.compareDocuments).toHaveBeenCalledTimes(2);
    expect(host.querySelector('.app-error-banner')).toBeNull();
  });

  it('navigates with review shortcuts but ignores shortcuts from form controls', async () => {
    await mountComparedApp();
    const scrollTo = vi.mocked(HTMLElement.prototype.scrollTo);
    scrollTo.mockClear();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, cancelable: true })));
    expect(host.querySelector('[data-diff-id="diff-2"]')?.classList).toContain('focus-diff');
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo.mock.calls.every(([options]) => typeof options === 'object' && (options as ScrollToOptions).behavior === 'smooth')).toBe(true);
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true })));
    expect(host.querySelector('[data-diff-id="diff-2"]')?.classList).toContain('focus-diff');
  });

  it('adds and removes the table structure marker used by the hint icon', async () => {
    mocks.parseDocx.mockResolvedValueOnce(parsed('<p>baseline</p>')).mockResolvedValueOnce(parsed('<p>revised</p>'));
    mocks.compareDocuments.mockResolvedValueOnce(tableComparison());
    mocks.resolveTableStructureHint.mockImplementation((_original, _revised, originalElements, revisedElements) => ({
      hint: { tableNumber: 1, originalRows: 1, revisedRows: 1, kind: 'cell-count-mismatch', confidence: 'high' },
      contextRows: [...originalElements, ...revisedElements].map((element: HTMLElement) => element.closest('tr')).filter(Boolean),
      candidateRows: []
    }));
    renderApp();
    await selectFile(0, new File(['a'], 'baseline.docx'));
    await selectFile(1, new File(['b'], 'revised.docx'));
    await waitForResultIndex();

    await act(async () => host.querySelector<HTMLButtonElement>('.settings-trigger')?.click());
    const tableHints = Array.from(host.querySelectorAll<HTMLButtonElement>('.settings-toggle')).find((button) => button.textContent?.includes('Table hints'))!;
    await act(async () => tableHints.click());
    expect(host.querySelectorAll('.table-structure-diff[data-table-hint="true"]')).toHaveLength(2);

    await act(async () => tableHints.click());
    expect(host.querySelector('.table-structure-diff, [data-table-hint]')).toBeNull();
  });

  it('prevents unloading only after a document session starts', async () => {
    mocks.parseDocx.mockResolvedValue(parsed('<p>baseline</p>'));
    renderApp();
    const emptyEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(emptyEvent);
    expect(emptyEvent.defaultPrevented).toBe(false);
    await selectFile(0, new File(['a'], 'baseline.docx'));
    const activeEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(activeEvent);
    expect(activeEvent.defaultPrevented).toBe(true);
  });

  it('swaps document states and compares them in the new order', async () => {
    await mountComparedApp();
    mocks.compareDocuments.mockResolvedValueOnce(comparisonWithDiffs());
    await act(async () => host.querySelector<HTMLButtonElement>('.swap-documents-trigger')?.click());
    await flush();
    expect(host.querySelector('.side-original')?.textContent).toContain('revised.docx');
    expect(host.querySelector('.side-revision')?.textContent).toContain('baseline.docx');
    expect(mocks.compareDocuments).toHaveBeenLastCalledWith('<p>revised</p>', '<p>baseline</p>', expect.any(Object));
  });

  it('keeps documents when reset is canceled and clears them when confirmed', async () => {
    await mountComparedApp();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const brand = host.querySelector<HTMLButtonElement>('.brand-zone');
    await act(async () => brand?.click());
    expect(host.textContent).toContain('baseline.docx');
    await act(async () => brand?.click());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain('baseline.docx');
    expect(host.querySelector('.floating-navigator')).toBeNull();
  });

  it('clears review state immediately when a result document is replaced', async () => {
    await mountComparedApp();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', cancelable: true })));
    expect(host.querySelector('.ignored-diff')).toBeTruthy();

    const replacement = deferred<ParsedDocx>();
    mocks.parseDocx.mockReturnValueOnce(replacement.promise);
    dispatchFile(0, new File(['replacement'], 'replacement.docx'));

    expect(host.querySelector('.floating-navigator')).toBeNull();
    expect(host.querySelector('.diff-map, .focus-diff, .ignored-diff')).toBeNull();

    await act(async () => {
      replacement.resolve(parsed('<p>replacement</p>'));
      await Promise.resolve();
    });
  });

  it('cancels an in-flight comparison when starting a new session', async () => {
    const pending = deferred<ReturnType<typeof comparisonWithDiffs>>();
    mocks.parseDocx.mockResolvedValueOnce(parsed('<p>baseline</p>')).mockResolvedValueOnce(parsed('<p>revised</p>'));
    mocks.compareDocuments.mockReturnValueOnce(pending.promise);
    renderApp();
    await selectFile(0, new File(['a'], 'baseline.docx'));
    await selectFile(1, new File(['b'], 'revised.docx'));
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await act(async () => host.querySelector<HTMLButtonElement>('.brand-zone')?.click());
    expect(host.querySelector('.compare-toast-dot')?.classList).toContain('done');
    expect(host.textContent).not.toContain('baseline.docx');

    await act(async () => { pending.resolve(comparisonWithDiffs()); await Promise.resolve(); });
    expect(host.querySelector('.floating-navigator')).toBeNull();
    expect(host.textContent).not.toContain('baseline.docx');
  });

  it('debounces rapid comparison-setting changes', async () => {
    await mountComparedApp();
    vi.useFakeTimers();
    await act(async () => host.querySelector<HTMLButtonElement>('.settings-trigger')?.click());
    const options = host.querySelectorAll<HTMLButtonElement>('.granularity-segmented__option');
    await act(async () => { options[0]?.click(); options[1]?.click(); });
    await act(async () => vi.advanceTimersByTimeAsync(179));
    expect(mocks.compareDocuments).toHaveBeenCalledTimes(1);
    mocks.compareDocuments.mockResolvedValueOnce(comparisonWithDiffs());
    await act(async () => vi.advanceTimersByTimeAsync(1));
    await act(async () => Promise.resolve());
    expect(mocks.compareDocuments).toHaveBeenCalledTimes(2);
    expect(mocks.compareDocuments).toHaveBeenLastCalledWith('<p>baseline</p>', '<p>revised</p>', expect.objectContaining({ granularity: 'word' }));
  });

  it('exports a local html review report', async () => {
    await mountComparedApp();
    const exportButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('Export report'));
    await act(async () => exportButton?.click());
    expect(mocks.downloadReviewReport).toHaveBeenCalledTimes(1);
    const [html, fileName] = mocks.downloadReviewReport.mock.calls[0];
    expect(html).toContain('old one');
    expect(html).toContain('new two');
    expect(fileName).toMatch(/^docdiff-report-\d{8}-\d{4}\.html$/);
  });

  function renderApp(): void {
    act(() => root.render(<StrictMode><App /></StrictMode>));
  }

  async function mountComparedApp(comparison = comparisonWithDiffs()): Promise<void> {
    mocks.parseDocx.mockResolvedValueOnce(parsed('<p>baseline</p>')).mockResolvedValueOnce(parsed('<p>revised</p>'));
    mocks.compareDocuments.mockResolvedValueOnce(comparison);
    renderApp();
    await selectFile(0, new File(['a'], 'baseline.docx'));
    await selectFile(1, new File(['b'], 'revised.docx'));
    await flush();
    await waitForResultIndex();
  }

  async function selectFile(index: number, file: File): Promise<void> {
    const pane = host.querySelectorAll<HTMLElement>('.view-dock-panel')[index];
    const input = pane?.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error(`Missing file input for pane ${index}`);
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    await flush();
  }

  function dispatchFile(index: number, file: File): void {
    const pane = host.querySelectorAll<HTMLElement>('.view-dock-panel')[index];
    const input = pane?.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error(`Missing file input for pane ${index}`);
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
  }
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitForResultIndex(): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (document.querySelector('.diff-map__marker')) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw new Error('Difference index did not become ready');
}

function parsed(html: string): ParsedDocx {
  return { html, textLength: html.length, imageCount: 0, warnings: [], layoutNoise: { hints: { exact: [], fragments: [] }, nativeItems: [] } };
}

function emptyComparison() {
  return { originalHtml: '<p>baseline</p>', revisedHtml: '<p>revised</p>', summary: { ...EMPTY_TEST_SUMMARY } };
}

function comparisonWithDiffs() {
  return {
    originalHtml: '<p><del data-diff-id="diff-1">old one</del> <del data-diff-id="diff-2">old two</del></p>',
    revisedHtml: '<p><ins data-diff-id="diff-1">new one</ins> <ins data-diff-id="diff-2">new two</ins></p>',
    summary: { ...EMPTY_TEST_SUMMARY, total: 2, modified: 2, similarity: 0.5 }
  };
}

function singleSidedComparison(kind: 'inserted' | 'deleted') {
  const inserted = kind === 'inserted';
  return {
    originalHtml: inserted ? '<p>baseline</p>' : '<p><del data-diff-id="diff-1">removed text</del></p>',
    revisedHtml: inserted ? '<p><ins data-diff-id="diff-1">added text</ins></p>' : '<p>revised</p>',
    summary: { ...EMPTY_TEST_SUMMARY, total: 1, inserted: inserted ? 1 : 0, deleted: inserted ? 0 : 1, similarity: 0.5 }
  };
}

function tableComparison() {
  return {
    originalHtml: '<table><tbody><tr><td><del data-diff-id="diff-1">old</del></td></tr></tbody></table>',
    revisedHtml: '<table><tbody><tr><td><ins data-diff-id="diff-1">new</ins></td></tr></tbody></table>',
    summary: { ...EMPTY_TEST_SUMMARY, total: 1, modified: 1, similarity: 0.5 }
  };
}

const EMPTY_TEST_SUMMARY = { total: 0, inserted: 0, deleted: 0, modified: 0, similarity: 1, layoutNoiseFiltered: 0, layoutNoiseItems: [] };

function fileWithSize(name: string, size: number): File {
  const file = new File(['x'], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}
