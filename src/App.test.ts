import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_USER_SETTINGS } from '@/config/userSettings';
import type { ParsedDocx } from '@/services/docxParser';
import { createMountRegistry } from '@/test-utils/mountComponent';
import App from './App.vue';

const mocks = vi.hoisted(() => ({
  parseDocx: vi.fn(),
  compareDocuments: vi.fn(),
  cancelPendingTextDiffs: vi.fn(),
  downloadReviewReport: vi.fn<(html: string, fileName: string) => void>(),
  writeSavedUserSettings: vi.fn()
}));

vi.mock('@/services/docxParser', () => ({ parseDocx: mocks.parseDocx }));
vi.mock('@/services/diffEngine', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/diffEngine')>(),
  compareDocuments: mocks.compareDocuments
}));
vi.mock('@/services/diffWorkerClient', () => ({ cancelPendingTextDiffs: mocks.cancelPendingTextDiffs }));
vi.mock('@/services/reviewReport', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/reviewReport')>(),
  downloadReviewReport: mocks.downloadReviewReport
}));
vi.mock('@/config/userSettings', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/config/userSettings')>();
  return {
    ...original,
    readSavedUserSettings: () => ({
      ...original.DEFAULT_USER_SETTINGS,
      enableDiffIgnore: true,
      showReportExport: true
    }),
    writeSavedUserSettings: mocks.writeSavedUserSettings
  };
});

const mounts = createMountRegistry();

describe('App document workflow', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.parseDocx.mockReset();
    mocks.compareDocuments.mockReset();
    mocks.cancelPendingTextDiffs.mockReset();
    mocks.downloadReviewReport.mockReset();
    mocks.writeSavedUserSettings.mockReset();
    mocks.compareDocuments.mockResolvedValue(emptyComparison());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn()
    });
  });

  afterEach(() => {
    mounts.cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects invalid, empty, and oversized files before parsing', async () => {
    const { root } = mounts.mount(App);

    await selectFile(root, 0, new File(['text'], 'notes.txt'));
    await selectFile(root, 0, new File([], 'empty.docx'));
    await selectFile(root, 0, fileWithSize('large.docx', 26 * 1024 * 1024));

    expect(mocks.parseDocx).not.toHaveBeenCalled();
    expect(root.querySelector('.side-original')?.textContent).toContain('25 MB');
  });

  it('keeps the newest file when an older parse finishes later', async () => {
    const first = deferred<ParsedDocx>();
    const second = deferred<ParsedDocx>();
    mocks.parseDocx.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { root } = mounts.mount(App);

    const oldSelection = selectFile(root, 0, new File(['old'], 'old.docx'));
    const newSelection = selectFile(root, 0, new File(['new'], 'new.docx'));
    second.resolve(parsed('<p>new content</p>'));
    await newSelection;
    first.resolve(parsed('<p>old content</p>'));
    await oldSelection;

    expect(root.querySelector('.side-original')?.textContent).toContain('new.docx');
    expect(root.querySelector('.side-original')?.textContent).not.toContain('old.docx');
  });

  it('compares automatically when both documents are ready', async () => {
    mocks.parseDocx
      .mockResolvedValueOnce(parsed('<p>baseline</p>'))
      .mockResolvedValueOnce(parsed('<p>revised</p>'));
    const { root } = mounts.mount(App);

    await selectFile(root, 0, new File(['a'], 'baseline.docx'));
    await selectFile(root, 1, new File(['b'], 'revised.docx'));
    await flushUpdates();

    expect(mocks.compareDocuments).toHaveBeenCalledWith(
      '<p>baseline</p>',
      '<p>revised</p>',
      expect.objectContaining({ granularity: 'char' })
    );
    expect(root.querySelector('.floating-navigator')).toBeTruthy();
  });

  it('shows a retry action after comparison fails and retries successfully', async () => {
    mocks.parseDocx.mockResolvedValue(parsed('<p>content</p>'));
    mocks.compareDocuments
      .mockRejectedValueOnce(new Error('compare exploded'))
      .mockResolvedValueOnce(emptyComparison());
    const { root } = mounts.mount(App);

    await selectFile(root, 0, new File(['a'], 'baseline.docx'));
    await selectFile(root, 1, new File(['b'], 'revised.docx'));
    await flushUpdates();

    const retry = root.querySelector<HTMLButtonElement>('.app-error-banner button');
    expect(root.querySelector('.app-error-banner')?.textContent).toContain('compare exploded');
    retry?.click();
    await flushUpdates();

    expect(mocks.compareDocuments).toHaveBeenCalledTimes(2);
    expect(root.querySelector('.app-error-banner')).toBeNull();
  });

  it('navigates with review shortcuts but ignores shortcuts from form controls', async () => {
    const { root } = await mountComparedApp();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, cancelable: true }));
    await nextTick();
    expect(root.querySelector('[data-diff-id="diff-2"]')?.classList).toContain('focus-diff');

    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      altKey: true,
      bubbles: true,
      cancelable: true
    }));
    await nextTick();

    expect(root.querySelector('[data-diff-id="diff-2"]')?.classList).toContain('focus-diff');
    expect(root.querySelector('[data-diff-id="diff-1"]')?.classList).not.toContain('focus-diff');
  });

  it('ignores differences in sequence and restores all of them', async () => {
    const { root } = await mountComparedApp();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', cancelable: true }));
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', cancelable: true }));
    await nextTick();

    expect(root.querySelectorAll('.ignored-diff')).toHaveLength(4);
    expect(root.textContent).toContain('All differences are ignored');

    const restoreAll = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Restore all'));
    restoreAll?.click();
    await nextTick();

    expect(root.querySelectorAll('.ignored-diff')).toHaveLength(0);
    expect(root.querySelector('[data-diff-id="diff-1"]')?.classList).toContain('focus-diff');
  });

  it('prevents unloading only after a document session starts', async () => {
    mocks.parseDocx.mockResolvedValue(parsed('<p>baseline</p>'));
    const { root } = mounts.mount(App);
    const emptyEvent = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(emptyEvent);
    expect(emptyEvent.defaultPrevented).toBe(false);

    await selectFile(root, 0, new File(['a'], 'baseline.docx'));
    const activeEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(activeEvent);

    expect(activeEvent.defaultPrevented).toBe(true);
  });

  it('exports the current comparison as an html review report', async () => {
    const { root } = await mountComparedApp();
    const exportButton = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Export report'));

    exportButton?.click();

    expect(mocks.downloadReviewReport).toHaveBeenCalledTimes(1);
    const [html, fileName] = mocks.downloadReviewReport.mock.calls[0];
    expect(html).toContain('old one');
    expect(html).toContain('new two');
    expect(fileName).toMatch(/^docdiff-report-\d{8}-\d{4}\.html$/);
  });

  it('swaps document states and compares them in the new order', async () => {
    const { root } = await mountComparedApp();

    root.querySelector<HTMLButtonElement>('.swap-documents-trigger')?.click();
    await flushUpdates();

    expect(root.querySelector('.side-original')?.textContent).toContain('revised.docx');
    expect(root.querySelector('.side-revision')?.textContent).toContain('baseline.docx');
    expect(mocks.compareDocuments).toHaveBeenLastCalledWith(
      '<p>revised</p>',
      '<p>baseline</p>',
      expect.any(Object)
    );
  });

  it('keeps documents when reset is canceled and clears them when confirmed', async () => {
    const { root } = await mountComparedApp();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const brand = root.querySelector<HTMLButtonElement>('.brand-zone');

    brand?.click();
    await nextTick();
    expect(root.textContent).toContain('baseline.docx');

    brand?.click();
    await nextTick();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(root.textContent).not.toContain('baseline.docx');
    expect(root.textContent).not.toContain('revised.docx');
    expect(root.querySelector('.floating-navigator')).toBeNull();
  });

  it('clears review state immediately when a result document is replaced', async () => {
    const { root } = await mountComparedApp();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', cancelable: true }));
    await nextTick();
    expect(root.querySelector('.ignored-diff')).toBeTruthy();

    const replacement = deferred<ParsedDocx>();
    mocks.parseDocx.mockReturnValueOnce(replacement.promise);
    await selectFile(root, 0, new File(['replacement'], 'replacement.docx'));

    expect(root.querySelector('.floating-navigator')).toBeNull();
    expect(root.querySelector('.diff-map, .focus-diff, .ignored-diff')).toBeNull();

    replacement.resolve(parsed('<p>replacement</p>'));
    await flushUpdates();
  });

  it('persists each settings change as a complete snapshot', async () => {
    const { root } = mounts.mount(App);
    root.querySelector<HTMLButtonElement>('.settings-trigger')?.click();
    await nextTick();

    const reportToggle = root.querySelector<HTMLButtonElement>(
      '.settings-toggle-list--plain > .settings-toggle:nth-child(3)'
    );
    expect(reportToggle).toBeTruthy();
    reportToggle!.click();
    await nextTick();

    expect(mocks.writeSavedUserSettings).toHaveBeenLastCalledWith({
      ...DEFAULT_USER_SETTINGS,
      enableDiffIgnore: true,
      showReportExport: false
    });
  });

  it('debounces rapid comparison-setting changes', async () => {
    const { root } = await mountComparedApp();
    vi.useFakeTimers();
    root.querySelector<HTMLButtonElement>('.settings-trigger')?.click();
    await nextTick();
    const granularity = root.querySelectorAll<HTMLButtonElement>('.granularity-segmented__option');

    granularity[0]?.click();
    granularity[1]?.click();
    await nextTick();
    await vi.advanceTimersByTimeAsync(179);
    expect(mocks.compareDocuments).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await flushUpdates();
    expect(mocks.compareDocuments).toHaveBeenCalledTimes(2);
    expect(mocks.compareDocuments).toHaveBeenLastCalledWith(
      '<p>baseline</p>',
      '<p>revised</p>',
      expect.objectContaining({ granularity: 'word' })
    );
  });
});

async function mountComparedApp() {
  mocks.parseDocx
    .mockResolvedValueOnce(parsed('<p>baseline</p>'))
    .mockResolvedValueOnce(parsed('<p>revised</p>'));
  mocks.compareDocuments.mockResolvedValueOnce(comparisonWithDiffs());
  const mounted = mounts.mount(App);
  await selectFile(mounted.root, 0, new File(['a'], 'baseline.docx'));
  await selectFile(mounted.root, 1, new File(['b'], 'revised.docx'));
  await flushUpdates();
  return mounted;
}

async function selectFile(root: HTMLElement, paneIndex: number, file: File): Promise<void> {
  const pane = root.querySelectorAll<HTMLElement>('.view-dock-panel')[paneIndex];
  const input = pane?.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error(`Missing file input for pane ${paneIndex}`);
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flushUpdates();
}

async function flushUpdates(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

function parsed(html: string): ParsedDocx {
  return {
    html,
    textLength: html.length,
    imageCount: 0,
    warnings: [],
    layoutNoise: { hints: { exact: [], fragments: [] }, nativeItems: [] }
  };
}

function emptyComparison() {
  return {
    originalHtml: '<p>baseline</p>',
    revisedHtml: '<p>revised</p>',
    summary: {
      total: 0,
      inserted: 0,
      deleted: 0,
      modified: 0,
      similarity: 1,
      layoutNoiseFiltered: 0,
      layoutNoiseItems: []
    }
  };
}

function comparisonWithDiffs() {
  return {
    originalHtml: '<p><del data-diff-id="diff-1">old one</del> <del data-diff-id="diff-2">old two</del></p>',
    revisedHtml: '<p><ins data-diff-id="diff-1">new one</ins> <ins data-diff-id="diff-2">new two</ins></p>',
    summary: {
      total: 2,
      inserted: 0,
      deleted: 0,
      modified: 2,
      similarity: 0.5,
      layoutNoiseFiltered: 0,
      layoutNoiseItems: []
    }
  };
}

function fileWithSize(name: string, size: number): File {
  const file = new File(['x'], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
