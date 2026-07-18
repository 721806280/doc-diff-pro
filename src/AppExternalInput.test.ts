import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMountRegistry } from '@/test-utils/mountComponent';

const mocks = vi.hoisted(() => ({
  parseDocx: vi.fn(),
  compareDocuments: vi.fn(),
  cancelPendingTextDiffs: vi.fn()
}));

vi.mock('@/services/docxParser', () => ({ parseDocx: mocks.parseDocx }));
vi.mock('@/services/diffEngine', () => ({ compareDocuments: mocks.compareDocuments }));
vi.mock('@/services/diffWorkerClient', () => ({ cancelPendingTextDiffs: mocks.cancelPendingTextDiffs }));

const mounts = createMountRegistry();

describe('App external document input', () => {
  beforeEach(() => {
    vi.resetModules();
    window.__DOC_DIFF_CONFIG__ = {
      documentInput: 'external',
      showHeader: false,
      showSampleDocuments: false
    };
    mocks.parseDocx.mockReset();
    mocks.compareDocuments.mockReset();
    mocks.compareDocuments.mockResolvedValue({
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
    });
  });

  afterEach(() => {
    mounts.cleanup();
    delete window.DocDiffPro;
    delete window.__DOC_DIFF_CONFIG__;
  });

  it('exposes external loading without local file controls', async () => {
    const { default: App } = await import('./App.vue');
    const { root } = mounts.mount(App);

    expect(root.querySelector('input[type="file"]')).toBeNull();
    expect(root.textContent).toContain('Waiting for the connected system');
    expect(window.DocDiffPro).toBeDefined();
    await expect(window.DocDiffPro?.loadDocuments({})).rejects.toThrow('Provide a baseline or revised');
    await expect(window.DocDiffPro?.loadDocuments({ baseline: {} as File })).rejects.toThrow('Baseline must');
  });

  it('loads both external documents, compares them, and removes the API on unmount', async () => {
    mocks.parseDocx
      .mockResolvedValueOnce(parsed('<p>baseline</p>'))
      .mockResolvedValueOnce(parsed('<p>revised</p>'));
    const { default: App } = await import('./App.vue');
    mounts.mount(App);

    await window.DocDiffPro?.loadDocuments({
      baseline: externalFile('baseline.docx'),
      revised: externalFile('revised.docx')
    });
    await flushUpdates();

    expect(mocks.parseDocx).toHaveBeenCalledTimes(2);
    expect(mocks.compareDocuments).toHaveBeenCalledWith(
      '<p>baseline</p>',
      '<p>revised</p>',
      expect.any(Object)
    );

    mounts.cleanup();
    expect(window.DocDiffPro).toBeUndefined();
  });
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

async function flushUpdates(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}
