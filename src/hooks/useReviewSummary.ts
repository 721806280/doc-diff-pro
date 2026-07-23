import { useMemo, type RefObject } from 'react';
import type { DiffSummary, IgnoredDiffItem, SimilarDiffItem, SimilarDiffLevel } from '@/types/diff';
import type { DiffElementIndex } from '@/utils/diffElementIndex';
import {
  activeReviewCount,
  activeReviewPosition,
  createReviewItem,
  diffReviewId,
  findSimilarReviewItems,
  sortReviewItems
} from '@/utils/diffReview';

type ReviewSummaryOptions = {
  summary: DiffSummary;
  currentDiff: number;
  ignoredDiffs: Map<string, IgnoredDiffItem>;
  diffIndex: RefObject<DiffElementIndex>;
  indexVersion: number;
  enableDiffIgnore: boolean;
  enableSimilarDiffs: boolean;
  similarDiffLevel: SimilarDiffLevel;
};

export function useReviewSummary({
  summary,
  currentDiff,
  ignoredDiffs,
  diffIndex,
  indexVersion,
  enableDiffIgnore,
  enableSimilarDiffs,
  similarDiffLevel
}: ReviewSummaryOptions) {
  const ignoredDiffIds = useMemo(() => new Set(ignoredDiffs.keys()), [ignoredDiffs]);
  const ignoredList = useMemo(() => sortReviewItems(ignoredDiffs.values()), [ignoredDiffs]);
  const ignoredIndices = useMemo(() => new Set(ignoredList.map((item) => item.index)), [ignoredList]);
  const activeCount = activeReviewCount(summary.total, ignoredDiffs.size);
  const activePosition = activeReviewPosition(currentDiff, summary.total, ignoredDiffIds);
  const currentReviewItem = useMemo(() => {
    void indexVersion;
    return currentDiff > 0 ? createReviewItem(currentDiff, diffIndex.current.get(diffReviewId(currentDiff))) : null;
  }, [currentDiff, diffIndex, indexVersion]);
  const similarItems = useMemo<SimilarDiffItem[]>(() => {
    void indexVersion;
    if (!enableDiffIgnore || !enableSimilarDiffs || !currentReviewItem || ignoredDiffIds.has(currentReviewItem.id)) return [];
    return findSimilarReviewItems({
      currentIndex: currentDiff,
      total: summary.total,
      ignoredIds: ignoredDiffIds,
      level: similarDiffLevel,
      getGroup: (index) => diffIndex.current.get(diffReviewId(index))
    });
  }, [currentDiff, currentReviewItem, diffIndex, enableDiffIgnore, enableSimilarDiffs, ignoredDiffIds, indexVersion, similarDiffLevel, summary.total]);

  return { ignoredDiffIds, ignoredList, ignoredIndices, activeCount, activePosition, currentReviewItem, similarItems };
}
