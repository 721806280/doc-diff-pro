import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffSummary, IgnoredDiffItem } from '@/types/diff';
import { buildDiffElementIndex, type DiffElementIndex } from '@/utils/diffElementIndex';
import { diffReviewId } from '@/utils/diffReview';
import { useReviewActions } from './useReviewActions';

function summaryWith(total: number): DiffSummary {
  return {
    total,
    inserted: total,
    deleted: 0,
    modified: 0,
    similarity: 0.5,
    layoutNoiseFiltered: 0,
    layoutNoiseItems: []
  };
}

/** Builds panes holding `total` paired diff elements, then indexes them. */
function buildIndex(total: number): { index: DiffElementIndex; paneA: HTMLElement; paneB: HTMLElement } {
  const paneA = document.createElement('div');
  const paneB = document.createElement('div');
  for (let position = 1; position <= total; position++) {
    const original = document.createElement('del');
    original.dataset.diffId = diffReviewId(position);
    original.textContent = `original ${position}`;
    paneA.append(original);

    const revised = document.createElement('ins');
    revised.dataset.diffId = diffReviewId(position);
    revised.textContent = `revised ${position}`;
    paneB.append(revised);
  }
  return { index: buildDiffElementIndex(paneA, paneB), paneA, paneB };
}

function mountActions(total: number, startAt = 1) {
  const { index, paneA, paneB } = buildIndex(total);
  const diffIndex = createRef<DiffElementIndex>() as { current: DiffElementIndex };
  diffIndex.current = index;

  const focusDiff = vi.fn();
  const onIgnore = vi.fn();
  const onNoActiveDiff = vi.fn();
  const state = {
    currentDiff: startAt,
    ignoredDiffs: new Map<string, IgnoredDiffItem>()
  };
  const setCurrentDiff = vi.fn((value: number | ((previous: number) => number)) => {
    state.currentDiff = typeof value === 'function' ? value(state.currentDiff) : value;
  });
  const setIgnoredDiffs = vi.fn(
    (
      value: Map<string, IgnoredDiffItem> | ((previous: Map<string, IgnoredDiffItem>) => Map<string, IgnoredDiffItem>)
    ) => {
      state.ignoredDiffs = typeof value === 'function' ? value(state.ignoredDiffs) : value;
    }
  );

  const view = renderHook(
    (props: { currentDiff: number; ignoredDiffs: Map<string, IgnoredDiffItem> }) =>
      useReviewActions({
        summary: summaryWith(total),
        currentDiff: props.currentDiff,
        setCurrentDiff,
        ignoredDiffs: props.ignoredDiffs,
        setIgnoredDiffs,
        diffIndex,
        focusDiff,
        onIgnore,
        onNoActiveDiff
      }),
    { initialProps: { currentDiff: state.currentDiff, ignoredDiffs: state.ignoredDiffs } }
  );

  const sync = () => view.rerender({ currentDiff: state.currentDiff, ignoredDiffs: state.ignoredDiffs });

  return { ...view, sync, state, diffIndex, paneA, paneB, focusDiff, onIgnore, onNoActiveDiff, setCurrentDiff };
}

describe('useReviewActions', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('locates a difference within range and focuses it', () => {
    const { result, focusDiff, state } = mountActions(3);

    act(() => result.current.locateDiff(2));

    expect(state.currentDiff).toBe(2);
    expect(focusDiff).toHaveBeenCalledWith(2, 'smooth');
  });

  it('ignores a locate request outside the difference range', () => {
    const { result, focusDiff, setCurrentDiff } = mountActions(3);

    act(() => result.current.locateDiff(0));
    act(() => result.current.locateDiff(4));

    expect(setCurrentDiff).not.toHaveBeenCalled();
    expect(focusDiff).not.toHaveBeenCalled();
  });

  it('steps to the next and previous difference', () => {
    const view = mountActions(3, 2);

    act(() => view.result.current.moveDiff(1));
    expect(view.state.currentDiff).toBe(3);

    view.sync();
    act(() => view.result.current.moveDiff(-1));
    expect(view.state.currentDiff).toBe(2);
  });

  it('stops at the last difference', () => {
    const { result, focusDiff } = mountActions(2, 2);

    act(() => result.current.moveDiff(1));

    expect(focusDiff).not.toHaveBeenCalled();
  });

  it('skips over ignored differences when stepping', () => {
    const view = mountActions(4, 1);

    act(() => view.result.current.ignoreDiffsById([diffReviewId(2), diffReviewId(3)]));
    view.sync();
    view.state.currentDiff = 1;
    view.sync();

    act(() => view.result.current.moveDiff(1));

    expect(view.state.currentDiff).toBe(4);
  });

  it('marks ignored elements and advances off the ignored difference', () => {
    const view = mountActions(3, 1);

    act(() => view.result.current.ignoreDiffsById([diffReviewId(1)]));

    expect(view.state.ignoredDiffs.has(diffReviewId(1))).toBe(true);
    expect(view.diffIndex.current.get(diffReviewId(1))?.A[0]?.classList.contains('ignored-diff')).toBe(true);
    expect(view.state.currentDiff).toBe(2);
    expect(view.onIgnore).toHaveBeenCalled();
  });

  it('falls back to the previous difference when nothing follows', () => {
    const view = mountActions(2, 2);

    act(() => view.result.current.ignoreDiffsById([diffReviewId(2)]));

    expect(view.state.currentDiff).toBe(1);
  });

  it('clears the active difference when every difference is ignored', () => {
    const view = mountActions(2, 1);

    act(() => view.result.current.ignoreDiffsById([diffReviewId(1), diffReviewId(2)]));

    expect(view.state.currentDiff).toBe(0);
    expect(view.onNoActiveDiff).toHaveBeenCalledTimes(1);
  });

  it('keeps the active difference when an unrelated one is ignored', () => {
    const view = mountActions(3, 1);

    act(() => view.result.current.ignoreDiffsById([diffReviewId(3)]));

    expect(view.state.currentDiff).toBe(1);
    expect(view.onNoActiveDiff).not.toHaveBeenCalled();
  });

  it('restores a single ignored difference and clears its marker', () => {
    const view = mountActions(3, 1);

    act(() => view.result.current.ignoreDiffsById([diffReviewId(2)]));
    view.sync();
    act(() => view.result.current.restoreIgnored(diffReviewId(2)));

    expect(view.state.ignoredDiffs.has(diffReviewId(2))).toBe(false);
    expect(view.diffIndex.current.get(diffReviewId(2))?.A[0]?.classList.contains('ignored-diff')).toBe(false);
  });

  it('does nothing when restoring a difference that is not ignored', () => {
    const view = mountActions(3, 1);

    act(() => view.result.current.restoreIgnored(diffReviewId(2)));

    expect(view.setCurrentDiff).not.toHaveBeenCalled();
  });

  it('re-focuses the restored difference when no difference is active', () => {
    const view = mountActions(2, 1);

    act(() => view.result.current.ignoreDiffsById([diffReviewId(1), diffReviewId(2)]));
    view.sync();
    expect(view.state.currentDiff).toBe(0);

    act(() => view.result.current.restoreIgnored(diffReviewId(2)));

    expect(view.state.currentDiff).toBe(2);
    expect(view.focusDiff).toHaveBeenCalledWith(2, 'auto');
  });

  it('restores every ignored difference at once', () => {
    const view = mountActions(3, 1);

    act(() => view.result.current.ignoreDiffsById([diffReviewId(1), diffReviewId(2), diffReviewId(3)]));
    view.sync();
    act(() => view.result.current.restoreAllIgnored());

    expect(view.state.ignoredDiffs.size).toBe(0);
    expect(view.paneA.querySelectorAll('.ignored-diff')).toHaveLength(0);
    expect(view.state.currentDiff).toBe(1);
  });

  it('does not re-ignore a difference that is already ignored', () => {
    const view = mountActions(3, 1);

    act(() => view.result.current.ignoreDiffsById([diffReviewId(2)]));
    view.sync();
    const firstSize = view.state.ignoredDiffs.size;
    act(() => view.result.current.ignoreDiffsById([diffReviewId(2)]));

    expect(view.state.ignoredDiffs.size).toBe(firstSize);
  });
});
