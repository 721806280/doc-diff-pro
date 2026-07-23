import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { DiffSummary, IgnoredDiffItem } from '@/types/diff';
import type { DiffElementIndex } from '@/utils/diffElementIndex';
import { clearReviewClass, createReviewItem, diffReviewId, diffReviewIndex, findActiveReviewIndex, setReviewClass } from '@/utils/diffReview';

type ReviewActionsOptions = {
  summary: DiffSummary;
  currentDiff: number;
  setCurrentDiff: Dispatch<SetStateAction<number>>;
  ignoredDiffs: Map<string, IgnoredDiffItem>;
  setIgnoredDiffs: Dispatch<SetStateAction<Map<string, IgnoredDiffItem>>>;
  diffIndex: RefObject<DiffElementIndex>;
  focusDiff: (index: number, behavior?: ScrollBehavior) => void;
  onIgnore: () => void;
  onNoActiveDiff: () => void;
};

export function useReviewActions({ summary, currentDiff, setCurrentDiff, ignoredDiffs, setIgnoredDiffs, diffIndex, focusDiff, onIgnore, onNoActiveDiff }: ReviewActionsOptions) {
  const locateDiff = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    if (index < 1 || index > summary.total) return;
    setCurrentDiff(index);
    focusDiff(index, behavior);
  }, [focusDiff, setCurrentDiff, summary.total]);

  const moveDiff = useCallback((direction: 1 | -1) => {
    const target = findActiveReviewIndex(currentDiff + direction, direction, summary.total, new Set(ignoredDiffs.keys()));
    if (target !== null) locateDiff(target);
  }, [currentDiff, ignoredDiffs, locateDiff, summary.total]);

  const ignoreDiffsById = useCallback((ids: string[]) => {
    const next = new Map(ignoredDiffs);
    ids.forEach((id) => {
      if (next.has(id)) return;
      const index = diffReviewIndex(id);
      const item = createReviewItem(index, diffIndex.current.get(id));
      if (!Number.isNaN(index) && item) {
        next.set(id, item);
        setReviewClass(diffIndex.current.get(id), 'ignored-diff', true);
      }
    });
    setIgnoredDiffs(next);
    onIgnore();
    if (!ids.includes(diffReviewId(currentDiff))) return;
    const ignoredIds = new Set(next.keys());
    const nextIndex = findActiveReviewIndex(currentDiff + 1, 1, summary.total, ignoredIds)
      ?? findActiveReviewIndex(currentDiff - 1, -1, summary.total, ignoredIds);
    if (nextIndex !== null) {
      locateDiff(nextIndex);
      return;
    }
    setCurrentDiff(0);
    clearReviewClass(diffIndex.current, 'focus-diff');
    onNoActiveDiff();
  }, [currentDiff, diffIndex, ignoredDiffs, locateDiff, onIgnore, onNoActiveDiff, setCurrentDiff, setIgnoredDiffs, summary.total]);

  const restoreIgnored = useCallback((id: string) => {
    const item = ignoredDiffs.get(id);
    if (!item) return;
    const next = new Map(ignoredDiffs);
    next.delete(id);
    setIgnoredDiffs(next);
    setReviewClass(diffIndex.current.get(id), 'ignored-diff', false);
    if (!currentDiff) locateDiff(item.index, 'auto');
  }, [currentDiff, diffIndex, ignoredDiffs, locateDiff, setIgnoredDiffs]);

  const restoreAllIgnored = useCallback(() => {
    clearReviewClass(diffIndex.current, 'ignored-diff');
    setIgnoredDiffs(new Map());
    if (!currentDiff && summary.total) locateDiff(1, 'auto');
  }, [currentDiff, diffIndex, locateDiff, setIgnoredDiffs, summary.total]);

  return { locateDiff, moveDiff, ignoreDiffsById, restoreIgnored, restoreAllIgnored };
}
