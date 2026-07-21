import { act, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const mocks = vi.hoisted(() => ({
  parseDocx: vi.fn(),
  compareDocuments: vi.fn()
}));

vi.mock('@/services/docxParser', () => ({ parseDocx: mocks.parseDocx }));
vi.mock('@/services/diffEngine', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/diffEngine')>(),
  compareDocuments: mocks.compareDocuments
}));

describe('React app external document input', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    window.__DOC_DIFF_CONFIG__ = { documentInput: 'external', showHeader: false, showSampleDocuments: false };
    mocks.parseDocx.mockReset();
    mocks.compareDocuments.mockReset().mockResolvedValue({
      originalHtml: '<p>baseline</p>',
      revisedHtml: '<p>revised</p>',
      summary: { total: 0, inserted: 0, deleted: 0, modified: 0, similarity: 1, layoutNoiseFiltered: 0, layoutNoiseItems: [] }
    });
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    delete window.DocDiffPro;
    delete window.__DOC_DIFF_CONFIG__;
  });

  it('exposes only the external API and rejects malformed input', async () => {
    await renderApp();
    expect(host?.querySelector('input[type="file"]')).toBeNull();
    expect(host?.textContent).toContain('Waiting for the connected system');
    expect(window.DocDiffPro).toBeDefined();
    await expect(window.DocDiffPro?.loadDocuments({})).rejects.toThrow('Provide a baseline or revised');
    await expect(window.DocDiffPro?.loadDocuments({ baseline: {} as File })).rejects.toThrow('Baseline must');
  });

  it('loads both documents, compares them, and removes the API on unmount', async () => {
    mocks.parseDocx.mockResolvedValueOnce(parsed('<p>baseline</p>')).mockResolvedValueOnce(parsed('<p>revised</p>'));
    await renderApp();
    await act(async () => {
      await window.DocDiffPro?.loadDocuments({ baseline: externalFile('baseline.docx'), revised: externalFile('revised.docx') });
      await Promise.resolve();
    });
    expect(mocks.parseDocx).toHaveBeenCalledTimes(2);
    expect(mocks.compareDocuments).toHaveBeenCalledWith('<p>baseline</p>', '<p>revised</p>', expect.any(Object));
    expect(host?.textContent).toContain('baseline.docx');
    act(() => root?.unmount());
    root = null;
    expect(window.DocDiffPro).toBeUndefined();
  });

  async function renderApp(): Promise<void> {
    const { default: App } = await import('./App');
    root = createRoot(host!);
    act(() => root?.render(<StrictMode><App /></StrictMode>));
  }
});

function externalFile(name: string): File {
  const file = new File(['docx'], name);
  if (typeof file.arrayBuffer !== 'function') {
    Object.defineProperty(file, 'arrayBuffer', { value: vi.fn().mockResolvedValue(new ArrayBuffer(4)) });
  }
  return file;
}

function parsed(html: string) {
  return {
    html,
    textLength: html.length,
    imageCount: 0,
    warnings: [],
    layoutNoise: { hints: { exact: [], fragments: [] }, nativeItems: [] }
  };
}
