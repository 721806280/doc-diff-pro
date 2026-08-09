import { useMemo, type RefObject } from 'react';
import type { DiffSummary, IgnoredDiffItem, SimilarDiffItem, SimilarDiffLevel } from '@/types/diff';
import type { DiffElementIndex } from '@/utils/diffElementIndex';
import {
  activeReviewCount,
  activeReviewPosition,
  buildReviewSignatures,
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
  // Keyed on the index rebuild rather than the selection, so walking through
  // differences never re-reads the DOM. Skipped entirely while the feature is
  // off, which is what the scan used to rely on the caller for.
  const reviewSignatures = useMemo(() => {
    void indexVersion;
    if (!enableDiffIgnore || !enableSimilarDiffs) return [];

    return buildReviewSignatures(summary.total, (index) => diffIndex.current.get(diffReviewId(index)));
  }, [diffIndex, enableDiffIgnore, enableSimilarDiffs, indexVersion, summary.total]);
  const similarItems = useMemo<SimilarDiffItem[]>(() => {
    if (!currentReviewItem || ignoredDiffIds.has(currentReviewItem.id)) return [];

    return findSimilarReviewItems({
      currentIndex: currentDiff,
      signatures: reviewSignatures,
      ignoredIds: ignoredDiffIds,
      level: similarDiffLevel
    });
  }, [currentDiff, currentReviewItem, ignoredDiffIds, reviewSignatures, similarDiffLevel]);

  return { ignoredDiffIds, ignoredList, ignoredIndices, activeCount, activePosition, currentReviewItem, similarItems };
}
