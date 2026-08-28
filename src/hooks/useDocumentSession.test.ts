import { createEmptyGraphicsReport } from '@/services/docxGraphics';
import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/i18n/messages';
import type { ParsedDocx } from '@/services/docxParser';
import { createEmptyLayoutNoise } from '@/utils/layoutNoise';
import { useDocumentSession } from './useDocumentSession';

const mocks = vi.hoisted(() => ({
  parseDocx: vi.fn(),
  loadSampleDocuments: vi.fn()
}));

vi.mock('@/services/docxParser', () => ({ parseDocx: mocks.parseDocx }));
vi.mock('@/services/sampleDocuments', () => ({ loadSampleDocuments: mocks.loadSampleDocuments }));

const i18n = messages.en;

function parsed(overrides: Partial<ParsedDocx> = {}): ParsedDocx {
  return {
    html: '<p>content</p>',
    textLength: 7,
    imageCount: 0,
    droppedImageCount: 0,
    graphics: createEmptyGraphicsReport(),
    imageUrls: [],
    imageDescriptors: new Map(),
    warnings: [],
    layoutNoise: createEmptyLayoutNoise(),
    ...overrides
  };
}

function docxFile(name = 'review.docx'): File {
  return new File(['docx'], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

function mountSession(overrides: { allowLocalInput?: boolean } = {}) {
  const onNotice = vi.fn();
  const onBeforeDocumentChange = vi.fn();
  const onMeta = vi.fn();
  const getStateRef = {
    current: () => ({ ready: false, comparing: false, hasDocuments: false, hasResult: false, error: '' })
  };
  const view = renderHook(() =>
    useDocumentSession({
      allowsExternalApi: !(overrides.allowLocalInput ?? true),
      i18n,
      maxSizeMb: 10,
      getStateRef,
      onMeta,
      onBeforeDocumentChange,
      onNotice
    })
  );
  return { ...view, onNotice, onBeforeDocumentChange, onMeta, getStateRef };
}

describe('useDocumentSession', () => {
  beforeEach(() => {
    mocks.parseDocx.mockReset().mockResolvedValue(parsed());
    mocks.loadSampleDocuments.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves a pane to ready once its file parses', async () => {
    const { result, onBeforeDocumentChange } = mountSession();

    await act(async () => {
      await result.current.handleFile('A', docxFile('baseline.docx'));
    });

    expect(result.current.documents.A.status).toBe('ready');
    expect(result.current.documents.A.name).toBe('baseline.docx');
    expect(result.current.documents.A.originalHtml).toBe('<p>content</p>');
    expect(result.current.hasDocuments).toBe(true);
    expect(result.current.ready).toBe(false);
    expect(onBeforeDocumentChange).toHaveBeenCalledTimes(1);
  });

  it('reports ready only once both panes have parsed', async () => {
    const { result } = mountSession();

    await act(async () => {
      await Promise.all([
        result.current.handleFile('A', docxFile('a.docx')),
        result.current.handleFile('B', docxFile('b.docx'))
      ]);
    });

    expect(result.current.ready).toBe(true);
  });

  it('rejects a file that fails validation without parsing it', async () => {
    const { result, onNotice } = mountSession();

    await act(async () => {
      await result.current.handleFile('A', new File(['text'], 'notes.txt'));
    });

    expect(mocks.parseDocx).not.toHaveBeenCalled();
    expect(result.current.documents.A.status).toBe('error');
    expect(result.current.documents.A.error).toBeTruthy();
    expect(onNotice).toHaveBeenCalledWith(result.current.documents.A.error);
  });

  it('surfaces a parse failure as an error state and a notice', async () => {
    mocks.parseDocx.mockRejectedValueOnce(new Error('corrupt archive'));
    const { result, onNotice } = mountSession();

    await act(async () => {
      await result.current.handleFile('A', docxFile());
    });

    expect(result.current.documents.A.status).toBe('error');
    expect(result.current.documents.A.error).toContain('corrupt archive');
    expect(onNotice).toHaveBeenCalledWith(i18n.app.notices.parseFailed);
  });

  it('notifies when a parse succeeds with conversion warnings', async () => {
    mocks.parseDocx.mockResolvedValueOnce(parsed({ warnings: ['unsupported shape'] }));
    const { result, onNotice } = mountSession();

    await act(async () => {
      await result.current.handleFile('A', docxFile('warned.docx'));
    });

    expect(onNotice).toHaveBeenCalledWith(i18n.app.notices.parseCompleteWithWarnings('warned.docx', 1));
  });

  // The fileSequences guard exists so a slow first parse cannot clobber the
  // document the user selected afterwards. This is the regression it prevents.
  it('discards a stale parse result when the same pane is replaced mid-flight', async () => {
    const resolvers: Array<(value: ParsedDocx) => void> = [];
    mocks.parseDocx.mockImplementation(() => new Promise<ParsedDocx>((resolve) => resolvers.push(resolve)));

    const { result } = mountSession();

    let firstCall: Promise<void>;
    let secondCall: Promise<void>;
    act(() => {
      firstCall = result.current.handleFile('A', docxFile('old.docx'));
      secondCall = result.current.handleFile('A', docxFile('new.docx'));
    });

    await waitFor(() => expect(resolvers).toHaveLength(2));

    // Resolve the superseded request last, so it would win without the guard.
    await act(async () => {
      resolvers[1]?.(parsed({ html: '<p>new</p>' }));
      resolvers[0]?.(parsed({ html: '<p>old</p>' }));
      await Promise.all([firstCall, secondCall]);
    });

    expect(result.current.documents.A.name).toBe('new.docx');
    expect(result.current.documents.A.originalHtml).toBe('<p>new</p>');
  });

  // Object URLs outlive the markup that referenced them unless something
  // revokes them, so every path that drops a pane has to release its images.
  describe('embedded image lifetime', () => {
    it('releases the previous pane images when the pane is replaced', async () => {
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
      mocks.parseDocx.mockResolvedValueOnce(parsed({ imageUrls: ['blob:first'] }));
      const { result } = mountSession();

      await act(async () => {
        await result.current.handleFile('A', docxFile('first.docx'));
      });
      expect(revokeObjectURL).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.handleFile('A', docxFile('second.docx'));
      });

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:first');
    });

    it('releases the images of a parse that lost its pane', async () => {
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
      const resolvers: Array<(value: ParsedDocx) => void> = [];
      mocks.parseDocx.mockImplementation(() => new Promise<ParsedDocx>((resolve) => resolvers.push(resolve)));

      const { result } = mountSession();
      let firstCall: Promise<void>;
      let secondCall: Promise<void>;
      act(() => {
        firstCall = result.current.handleFile('A', docxFile('old.docx'));
        secondCall = result.current.handleFile('A', docxFile('new.docx'));
      });
      await waitFor(() => expect(resolvers).toHaveLength(2));

      await act(async () => {
        resolvers[1]?.(parsed({ imageUrls: ['blob:winner'] }));
        resolvers[0]?.(parsed({ imageUrls: ['blob:loser'] }));
        await Promise.all([firstCall, secondCall]);
      });

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:loser');
      expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:winner');
    });

    it('releases both panes on reset', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
      mocks.parseDocx
        .mockResolvedValueOnce(parsed({ imageUrls: ['blob:a'] }))
        .mockResolvedValueOnce(parsed({ imageUrls: ['blob:b'] }));
      const { result } = mountSession();

      await act(async () => {
        await result.current.handleFile('A', docxFile('a.docx'));
        await result.current.handleFile('B', docxFile('b.docx'));
      });
      act(() => result.current.resetDocuments());

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:a');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:b');
    });

    it('keeps images alive across a swap and releases them on unmount', async () => {
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
      mocks.parseDocx
        .mockResolvedValueOnce(parsed({ imageUrls: ['blob:a'] }))
        .mockResolvedValueOnce(parsed({ imageUrls: ['blob:b'] }));
      const { result, unmount } = mountSession();

      await act(async () => {
        await result.current.handleFile('A', docxFile('a.docx'));
        await result.current.handleFile('B', docxFile('b.docx'));
      });
      act(() => result.current.swapDocuments());

      expect(revokeObjectURL).not.toHaveBeenCalled();
      expect(result.current.documents.A.imageUrls).toEqual(['blob:b']);

      unmount();

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:a');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:b');
    });
  });

  it('discards a stale parse failure for a superseded file', async () => {
    const settlers: Array<{ resolve: (value: ParsedDocx) => void; reject: (reason: Error) => void }> = [];
    mocks.parseDocx.mockImplementation(
      () => new Promise<ParsedDocx>((resolve, reject) => settlers.push({ resolve, reject }))
    );

    const { result, onNotice } = mountSession();

    let firstCall: Promise<void>;
    let secondCall: Promise<void>;
    act(() => {
      firstCall = result.current.handleFile('A', docxFile('old.docx'));
      secondCall = result.current.handleFile('A', docxFile('new.docx'));
    });

    await waitFor(() => expect(settlers).toHaveLength(2));

    await act(async () => {
      settlers[1]?.resolve(parsed({ html: '<p>new</p>' }));
      settlers[0]?.reject(new Error('stale failure'));
      await Promise.all([firstCall, secondCall]);
    });

    expect(result.current.documents.A.status).toBe('ready');
    expect(onNotice).not.toHaveBeenCalledWith(i18n.app.notices.parseFailed);
  });

  it('ignores a sample load that finishes after the session was reset', async () => {
    let resolveSamples: ((value: { A: File; B: File }) => void) | undefined;
    mocks.loadSampleDocuments.mockImplementation(
      () =>
        new Promise<{ A: File; B: File }>((resolve) => {
          resolveSamples = resolve;
        })
    );

    const { result, onNotice } = mountSession();

    let pending: Promise<void>;
    act(() => {
      pending = result.current.loadSamples();
    });
    await waitFor(() => expect(resolveSamples).toBeDefined());

    // resetDocuments bumps sampleSequence, invalidating the in-flight load.
    act(() => result.current.resetDocuments());

    await act(async () => {
      resolveSamples?.({ A: docxFile('sample-a.docx'), B: docxFile('sample-b.docx') });
      await pending;
    });

    expect(result.current.documents.A.name).toBe('');
    expect(result.current.documents.B.name).toBe('');
    expect(onNotice).not.toHaveBeenCalledWith(i18n.app.notices.sampleLoadFailed);
  });

  it('reports a failed sample load', async () => {
    mocks.loadSampleDocuments.mockRejectedValue(new Error('offline'));
    const { result, onNotice } = mountSession();

    await act(async () => {
      await result.current.loadSamples();
    });

    expect(onNotice).toHaveBeenCalledWith(i18n.app.notices.sampleLoadFailed);
    expect(result.current.loadingSample).toBe(false);
  });

  it('skips sample loading once documents are present', async () => {
    const { result } = mountSession();

    await act(async () => {
      await result.current.handleFile('A', docxFile());
    });
    await act(async () => {
      await result.current.loadSamples();
    });

    expect(mocks.loadSampleDocuments).not.toHaveBeenCalled();
  });

  it('keeps the documents when the reset confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result, onNotice } = mountSession();

    await act(async () => {
      await result.current.handleFile('A', docxFile('keep.docx'));
    });
    act(() => result.current.resetDocuments());

    expect(result.current.documents.A.name).toBe('keep.docx');
    expect(onNotice).not.toHaveBeenCalledWith(i18n.app.notices.newComparisonStarted);
  });

  it('clears both panes when the reset confirmation is accepted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result, onNotice } = mountSession();

    await act(async () => {
      await result.current.handleFile('A', docxFile('drop.docx'));
    });
    act(() => result.current.resetDocuments());

    expect(result.current.documents.A.name).toBe('');
    expect(result.current.hasDocuments).toBe(false);
    expect(onNotice).toHaveBeenCalledWith(i18n.app.notices.newComparisonStarted);
  });

  it('swaps the panes and drops stale highlight markup', async () => {
    const { result, onNotice } = mountSession();

    await act(async () => {
      await Promise.all([
        result.current.handleFile('A', docxFile('a.docx')),
        result.current.handleFile('B', docxFile('b.docx'))
      ]);
    });
    act(() => {
      result.current.setDocuments((current) => ({
        A: { ...current.A, highlightedHtml: '<p>marked</p>' },
        B: { ...current.B, highlightedHtml: '<p>marked</p>' }
      }));
    });
    act(() => result.current.swapDocuments());

    expect(result.current.documents.A.name).toBe('b.docx');
    expect(result.current.documents.B.name).toBe('a.docx');
    expect(result.current.documents.A.highlightedHtml).toBe('');
    expect(onNotice).toHaveBeenCalledWith(i18n.app.notices.documentsSwapped);
  });

  it('refuses to swap before both panes are ready', async () => {
    const { result, onNotice } = mountSession();

    await act(async () => {
      await result.current.handleFile('A', docxFile('a.docx'));
    });
    act(() => result.current.swapDocuments());

    expect(result.current.documents.A.name).toBe('a.docx');
    expect(onNotice).not.toHaveBeenCalledWith(i18n.app.notices.documentsSwapped);
  });

  it('exposes the external document API only when local input is disabled', () => {
    const local = mountSession({ allowLocalInput: true });
    expect(window.DocDiffPro).toBeUndefined();
    local.unmount();

    const embedded = mountSession({ allowLocalInput: false });
    expect(window.DocDiffPro).toBeDefined();
    embedded.unmount();
    expect(window.DocDiffPro).toBeUndefined();
  });
});
