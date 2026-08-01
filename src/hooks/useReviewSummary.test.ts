import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffSummary, IgnoredDiffItem } from '@/types/diff';
import type { DiffElementIndex } from '@/utils/diffElementIndex';
import { createReviewItem, diffReviewId } from '@/utils/diffReview';
import { useReviewSummary } from './useReviewSummary';

function summaryWith(total: number): DiffSummary {
  return { total, inserted: total, deleted: 0, modified: 0, similarity: 0.5, layoutNoiseFiltered: 0, layoutNoiseItems: [] };
}

/** Indexes `total` differences; entries in `texts` override the default body. */
function buildIndex(total: number, texts: Record<number, string> = {}): DiffElementIndex {
  const index: DiffElementIndex = new Map();
  for (let position = 1; position <= total; position++) {
    const original = document.createElement('del');
    original.textContent = texts[position] ?? `original ${position}`;
    const revised = document.createElement('ins');
    revised.textContent = texts[position] ?? `revised ${position}`;
    index.set(diffReviewId(position), { A: [original], B: [revised] });
  }
  return index;
}

function ignoredMapFor(index: DiffElementIndex, positions: number[]): Map<string, IgnoredDiffItem> {
  const map = new Map<string, IgnoredDiffItem>();
  positions.forEach((position) => {
    const item = createReviewItem(position, index.get(diffReviewId(position)));
    if (item) map.set(item.id, item);
  });
  return map;
}

function mountSummary(options: {
  total: number;
  currentDiff?: number;
  ignored?: number[];
  index?: DiffElementIndex;
  enableDiffIgnore?: boolean;
  enableSimilarDiffs?: boolean;
}) {
  const index = options.index ?? buildIndex(options.total);
  const diffIndex = { current: index };
  const ignoredDiffs = ignoredMapFor(index, options.ignored ?? []);

  const view = renderHook(
    (props: { currentDiff: number; ignoredDiffs: Map<string, IgnoredDiffItem> }) =>
      useReviewSummary({
        summary: summaryWith(options.total),
        currentDiff: props.currentDiff,
        ignoredDiffs: props.ignoredDiffs,
        diffIndex,
        indexVersion: 1,
        enableDiffIgnore: options.enableDiffIgnore ?? true,
        enableSimilarDiffs: options.enableSimilarDiffs ?? true,
        similarDiffLevel: 'balanced'
      }),
    { initialProps: { currentDiff: options.currentDiff ?? 1, ignoredDiffs } }
  );

  return { ...view, index, ignoredDiffs };
}

describe('useReviewSummary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reports every difference as active when none are ignored', () => {
    const { result } = mountSummary({ total: 4 });

    expect(result.current.activeCount).toBe(4);
    expect(result.current.activePosition).toBe(1);
    expect(result.current.ignoredList).toEqual([]);
    expect(result.current.ignoredDiffIds.size).toBe(0);
  });

  it('excludes ignored differences from the active count', () => {
    const { result } = mountSummary({ total: 4, ignored: [2, 3] });

    expect(result.current.activeCount).toBe(2);
    expect(result.current.ignoredList).toHaveLength(2);
    expect(result.current.ignoredIndices).toEqual(new Set([2, 3]));
  });

  it('reports the position of the current difference among active ones', () => {
    const { result } = mountSummary({ total: 5, currentDiff: 4, ignored: [2] });

    // Differences 1, 3, 4, 5 remain active, so 4 sits third.
    expect(result.current.activePosition).toBe(3);
  });

  it('keeps the ignored list ordered by difference index', () => {
    const { result } = mountSummary({ total: 5, ignored: [4, 1, 3] });

    expect(result.current.ignoredList.map((item) => item.index)).toEqual([1, 3, 4]);
  });

  it('exposes the current review item with its previews', () => {
    const { result } = mountSummary({ total: 3, currentDiff: 2 });

    expect(result.current.currentReviewItem?.id).toBe(diffReviewId(2));
    expect(result.current.currentReviewItem?.originalPreview).toContain('original 2');
    expect(result.current.currentReviewItem?.revisedPreview).toContain('revised 2');
  });

  it('has no current review item when nothing is selected', () => {
    const { result } = mountSummary({ total: 3, currentDiff: 0 });

    expect(result.current.currentReviewItem).toBeNull();
    expect(result.current.similarItems).toEqual([]);
  });

  it('finds differences with matching text as similar', () => {
    const index = buildIndex(3, { 1: 'repeated clause', 2: 'something else', 3: 'repeated clause' });
    const { result } = mountSummary({ total: 3, currentDiff: 1, index });

    expect(result.current.similarItems.map((item) => item.index)).toEqual([3]);
  });

  it('offers no similar differences when the feature is off', () => {
    const index = buildIndex(3, { 1: 'repeated clause', 2: 'other', 3: 'repeated clause' });
    const { result } = mountSummary({ total: 3, currentDiff: 1, index, enableSimilarDiffs: false });

    expect(result.current.similarItems).toEqual([]);
  });

  it('offers no similar differences when ignoring is disabled', () => {
    const index = buildIndex(3, { 1: 'repeated clause', 2: 'other', 3: 'repeated clause' });
    const { result } = mountSummary({ total: 3, currentDiff: 1, index, enableDiffIgnore: false });

    expect(result.current.similarItems).toEqual([]);
  });

  it('offers no similar differences once the current one is ignored', () => {
    const index = buildIndex(3, { 1: 'repeated clause', 2: 'other', 3: 'repeated clause' });
    const { result } = mountSummary({ total: 3, currentDiff: 1, index, ignored: [1] });

    expect(result.current.similarItems).toEqual([]);
  });

  it('leaves already ignored differences out of the similar list', () => {
    const index = buildIndex(4, {
      1: 'repeated clause',
      2: 'other',
      3: 'repeated clause',
      4: 'repeated clause'
    });
    const { result } = mountSummary({ total: 4, currentDiff: 1, index, ignored: [3] });

    expect(result.current.similarItems.map((item) => item.index)).toEqual([4]);
  });

  it('recomputes when the ignored set changes', () => {
    const view = mountSummary({ total: 4 });
    expect(view.result.current.activeCount).toBe(4);

    act(() => {
      view.rerender({ currentDiff: 1, ignoredDiffs: ignoredMapFor(view.index, [2]) });
    });

    expect(view.result.current.activeCount).toBe(3);
    expect(view.result.current.ignoredIndices).toEqual(new Set([2]));
  });
});
