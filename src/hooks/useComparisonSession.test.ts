import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/i18n/messages';
import type { DiffSummary } from '@/types/diff';
import type { DocumentPair } from '@/types/document';
import { createEmptyDocument } from '@/services/documentFile';
import { useComparisonSession } from './useComparisonSession';

const mocks = vi.hoisted(() => ({
  compareDocuments: vi.fn(),
  cancelPendingTextDiffs: vi.fn()
}));

vi.mock('@/services/diffEngine', () => ({ compareDocuments: mocks.compareDocuments }));
vi.mock('@/services/diffWorkerClient', () => ({ cancelPendingTextDiffs: mocks.cancelPendingTextDiffs }));

const i18n = messages.en;

function summaryWith(total: number): DiffSummary {
  return {
    total,
    inserted: total,
    deleted: 0,
    modified: 0,
    similarity: 0.9,
    layoutNoiseFiltered: 0,
    layoutNoiseItems: []
  };
}

function comparisonResult(total = 2) {
  return {
    originalHtml: '<p>marked original</p>',
    revisedHtml: '<p>marked revised</p>',
    summary: summaryWith(total)
  };
}

function readyDocuments(): DocumentPair {
  return {
    A: { ...createEmptyDocument(), name: 'a.docx', status: 'ready', originalHtml: '<p>a</p>' },
    B: { ...createEmptyDocument(), name: 'b.docx', status: 'ready', originalHtml: '<p>b</p>' }
  };
}

function mountSession(initialDocuments: DocumentPair = readyDocuments()) {
  const onClearReviewState = vi.fn();
  const onResult = vi.fn();
  const onNotice = vi.fn();
  const state = { documents: initialDocuments };
  const setDocuments = vi.fn((value: DocumentPair | ((previous: DocumentPair) => DocumentPair)) => {
    state.documents = typeof value === 'function' ? value(state.documents) : value;
  });

  const view = renderHook(
    (props: { documents: DocumentPair; ready: boolean }) =>
      useComparisonSession({
        documents: props.documents,
        i18n,
        ready: props.ready,
        rules: {
          diffGranularity: 'semantic',
          filterLayoutNoise: false,
          ignoreFullHalfWidth: true,
          ignoreSpaces: true
        },
        setDocuments,
        onClearReviewState,
        onResult,
        onNotice
      }),
    { initialProps: { documents: initialDocuments, ready: true } }
  );

  return { ...view, state, setDocuments, onClearReviewState, onResult, onNotice };
}

describe('useComparisonSession', () => {
  beforeEach(() => {
    mocks.compareDocuments.mockReset().mockResolvedValue(comparisonResult());
    mocks.cancelPendingTextDiffs.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('compares automatically once both documents are ready', async () => {
    const view = mountSession();

    await waitFor(() => expect(view.result.current.summary.total).toBe(2));

    expect(mocks.compareDocuments).toHaveBeenCalledTimes(1);
    expect(view.onResult).toHaveBeenCalledWith(summaryWith(2));
    expect(view.state.documents.A.highlightedHtml).toBe('<p>marked original</p>');
  });

  it('does not compare until both documents are ready', () => {
    const documents = readyDocuments();
    documents.B.status = 'parsing';
    mountSession(documents);

    expect(mocks.compareDocuments).not.toHaveBeenCalled();
  });

  it('does not re-compare when highlighted markup already exists', async () => {
    const view = mountSession();
    await waitFor(() => expect(mocks.compareDocuments).toHaveBeenCalledTimes(1));

    view.rerender({ documents: view.state.documents, ready: true });

    expect(mocks.compareDocuments).toHaveBeenCalledTimes(1);
  });

  it('surfaces a comparison failure as an error and a notice', async () => {
    mocks.compareDocuments.mockRejectedValueOnce(new Error('worker exploded'));
    const view = mountSession();

    await waitFor(() => expect(view.result.current.error).toBeTruthy());

    expect(view.result.current.error).toContain('worker exploded');
    expect(view.onNotice).toHaveBeenCalledWith(i18n.app.notices.compareFailed);
    expect(view.result.current.comparing).toBe(false);
  });

  it('announces a refreshed comparison when asked', async () => {
    const view = mountSession();
    await waitFor(() => expect(mocks.compareDocuments).toHaveBeenCalledTimes(1));

    await act(async () => {
      await view.result.current.runCompare(readyDocuments(), true);
    });

    expect(view.onNotice).toHaveBeenCalledWith(i18n.app.notices.compareRefreshed);
  });

  // compareSequence guards against a slow comparison overwriting a newer one.
  it('discards a superseded comparison result', async () => {
    const resolvers: Array<(value: ReturnType<typeof comparisonResult>) => void> = [];
    mocks.compareDocuments.mockImplementation(
      () => new Promise<ReturnType<typeof comparisonResult>>((resolve) => resolvers.push(resolve))
    );

    const view = mountSession();
    await waitFor(() => expect(resolvers).toHaveLength(1));

    let second: Promise<void>;
    act(() => {
      second = view.result.current.runCompare(readyDocuments());
    });
    await waitFor(() => expect(resolvers).toHaveLength(2));

    await act(async () => {
      resolvers[1]?.(comparisonResult(9));
      resolvers[0]?.(comparisonResult(1));
      await second;
    });

    expect(view.result.current.summary.total).toBe(9);
  });

  it('cancels an in-flight comparison', async () => {
    mocks.compareDocuments.mockImplementation(() => new Promise(() => undefined));
    const view = mountSession();

    await waitFor(() => expect(view.result.current.comparing).toBe(true));
    act(() => view.result.current.cancelCompare());

    expect(view.result.current.comparing).toBe(false);
    expect(mocks.cancelPendingTextDiffs).toHaveBeenCalled();
  });

  // The engine only checks this between phases, so signalling it is what lets
  // a superseded run stop part way instead of running to completion.
  it('signals the running comparison to stop when cancelled', async () => {
    mocks.compareDocuments.mockImplementation(() => new Promise(() => undefined));
    const view = mountSession();

    await waitFor(() => expect(mocks.compareDocuments).toHaveBeenCalled());
    const signal = mocks.compareDocuments.mock.calls[0]![2].signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    act(() => view.result.current.cancelCompare());

    expect(signal.aborted).toBe(true);
  });

  it('signals the previous comparison to stop when a newer one starts', async () => {
    mocks.compareDocuments.mockImplementation(() => new Promise(() => undefined));
    const view = mountSession();

    await waitFor(() => expect(mocks.compareDocuments).toHaveBeenCalled());
    const first = mocks.compareDocuments.mock.calls[0]![2].signal as AbortSignal;

    await act(async () => {
      void view.result.current.runCompare(readyDocuments());
    });

    const second = mocks.compareDocuments.mock.calls[1]![2].signal as AbortSignal;
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
  });

  it('stops the running comparison on unmount', async () => {
    mocks.compareDocuments.mockImplementation(() => new Promise(() => undefined));
    const view = mountSession();

    await waitFor(() => expect(mocks.compareDocuments).toHaveBeenCalled());
    const signal = mocks.compareDocuments.mock.calls[0]![2].signal as AbortSignal;

    view.unmount();

    expect(signal.aborted).toBe(true);
  });

  it('clears the summary and review state', async () => {
    const view = mountSession();
    await waitFor(() => expect(view.result.current.summary.total).toBe(2));

    act(() => view.result.current.clearComparison());

    expect(view.result.current.summary.total).toBe(0);
    expect(view.onClearReviewState).toHaveBeenCalled();
  });

  it('cancels pending diffs on unmount', async () => {
    const view = mountSession();
    await waitFor(() => expect(mocks.compareDocuments).toHaveBeenCalled());
    mocks.cancelPendingTextDiffs.mockClear();

    view.unmount();

    expect(mocks.cancelPendingTextDiffs).toHaveBeenCalledTimes(1);
  });
});
