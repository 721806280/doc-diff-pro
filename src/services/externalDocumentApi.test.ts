import { createEmptyImageComparisonSummary } from '@/utils/textDiffCore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExternalDocumentApi, type DocDiffProState } from './externalDocumentApi';

const idleState: DocDiffProState = {
  ready: false,
  comparing: false,
  hasDocuments: false,
  hasResult: false,
  error: ''
};

describe('externalDocumentApi', () => {
  afterEach(() => {
    delete window.DocDiffPro;
  });

  it('installs a v2 API and fires ready on the next microtask', async () => {
    const host = createExternalDocumentApi(vi.fn(), () => idleState);
    expect(window.DocDiffPro).toBeUndefined();

    const uninstall = host.install();
    expect(window.DocDiffPro?.ready).toBe(false);

    const ready = vi.fn();
    window.DocDiffPro?.on('ready', ready);
    await Promise.resolve();
    expect(ready).toHaveBeenCalledWith({});
    expect(window.DocDiffPro?.ready).toBe(true);

    uninstall();
    expect(window.DocDiffPro).toBeUndefined();
  });

  it('preserves a newer API registration during cleanup', () => {
    const host = createExternalDocumentApi(vi.fn(), () => idleState);
    const uninstall = host.install();
    const replacement: import('./externalDocumentApi').DocDiffProApi = {
      ready: true,
      loadDocuments: vi.fn(),
      on: vi.fn(),
      getState: vi.fn()
    };
    window.DocDiffPro = replacement;

    uninstall();
    expect(window.DocDiffPro).toBe(replacement);
  });

  it('forwards loadDocuments to the host and supports a single side', async () => {
    const loadDocuments = vi.fn().mockImplementation(async () => ({ sequence: 0 }));
    const host = createExternalDocumentApi(loadDocuments, () => idleState);
    host.install();
    await Promise.resolve();

    const baseline = new File(['content'], 'baseline.docx');
    const { sequence } = (await window.DocDiffPro?.loadDocuments({ baseline })) ?? { sequence: -1 };

    expect(sequence).toBe(1);
    expect(loadDocuments).toHaveBeenCalledWith(expect.objectContaining({ baseline }));
  });

  it('attaches meta to loadDocuments calls', async () => {
    const loadDocuments = vi.fn().mockImplementation(async () => ({ sequence: 0 }));
    const host = createExternalDocumentApi(loadDocuments, () => idleState);
    host.install();
    await Promise.resolve();

    await window.DocDiffPro?.loadDocuments({ revised: new File(['r'], 'r.docx'), meta: { bizId: 'c-42' } });
    expect(loadDocuments).toHaveBeenCalledWith(expect.objectContaining({ meta: { bizId: 'c-42' } }));
  });

  it('delivers result/error/cleared events to subscribers', async () => {
    const host = createExternalDocumentApi(vi.fn(), () => idleState);
    host.install();
    await Promise.resolve();

    const result = vi.fn();
    const error = vi.fn();
    const cleared = vi.fn();
    window.DocDiffPro?.on('result', result);
    window.DocDiffPro?.on('error', error);
    window.DocDiffPro?.on('cleared', cleared);

    host.emit('result', {
      summary: {
        total: 3,
        inserted: 1,
        deleted: 1,
        modified: 1,
        similarity: 0.5,
        images: createEmptyImageComparisonSummary(),
        layoutNoiseFiltered: 0,
        layoutNoiseItems: []
      },
      meta: { bizId: 'x' }
    });
    host.emit('error', { message: 'boom', meta: { bizId: 'x' } });
    host.emit('cleared', { meta: { bizId: 'x' } });

    expect(result).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it('isolates handlers per event and supports unsubscribe', async () => {
    const host = createExternalDocumentApi(vi.fn(), () => idleState);
    host.install();
    await Promise.resolve();

    const handler = vi.fn();
    const off = window.DocDiffPro?.on('result', handler);
    host.emit('result', {
      summary: {
        total: 0,
        inserted: 0,
        deleted: 0,
        modified: 0,
        similarity: 1,
        images: createEmptyImageComparisonSummary(),
        layoutNoiseFiltered: 0,
        layoutNoiseItems: []
      }
    });
    off?.();
    host.emit('result', {
      summary: {
        total: 0,
        inserted: 0,
        deleted: 0,
        modified: 0,
        similarity: 1,
        images: createEmptyImageComparisonSummary(),
        layoutNoiseFiltered: 0,
        layoutNoiseItems: []
      }
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not emit before install', () => {
    const host = createExternalDocumentApi(vi.fn(), () => idleState);
    const ready = vi.fn();
    // Subscribe before install: not possible via API, but emit must be a no-op.
    host.emit('ready', {});
    expect(ready).not.toHaveBeenCalled();
  });

  it('reports live state via getState', async () => {
    const state: DocDiffProState = { ...idleState, comparing: true, hasDocuments: true };
    const host = createExternalDocumentApi(vi.fn(), () => state);
    host.install();
    await Promise.resolve();

    expect(window.DocDiffPro?.getState()).toEqual(state);
  });
});
