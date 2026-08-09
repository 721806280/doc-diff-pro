import DiffMatchPatch from 'diff-match-patch';
import type { DiffGranularity, DiffTuple } from '@/types/diff';

/**
 * Seconds `diff_main` may spend bisecting before it gives up and returns a
 * coarse split of whatever text is left.
 *
 * Zero means "no limit", which sounds like the better diff but is not: the
 * exact O(ND) search on a large, heavily edited pair outlives the worker
 * deadline in `diffWorkerClient`, the worker is torn down, and the reader is
 * left with an error instead of a result. Stopping short of that deadline
 * trades exactness on the worst inputs for always having something to show.
 */
export const DIFF_COMPUTE_TIMEOUT_SECONDS = 10;

const diffMatchPatch = new DiffMatchPatch();
diffMatchPatch.Diff_Timeout = DIFF_COMPUTE_TIMEOUT_SECONDS;

/**
 * Kept apart from `textDiffCore` so that the diff-match-patch bundle follows
 * the comparison engine into its own chunk. The identifier and summary helpers
 * next door are needed by the review UI from the first paint; this is not.
 */
export function createTextDiffs(
  originalText: string,
  revisedText: string,
  granularity: DiffGranularity,
  options: { mergeShortGaps?: boolean } = {}
): DiffTuple[] {
  const diffs = diffMatchPatch.diff_main(originalText, revisedText) as DiffTuple[];

  cleanupDiffs(diffs, granularity, options.mergeShortGaps ?? true);
  return diffs;
}

function cleanupDiffs(diffs: DiffTuple[], granularity: DiffGranularity, mergeShortGaps: boolean): void {
  if (granularity === 'semantic') {
    diffMatchPatch.diff_cleanupSemantic(diffs);
  } else {
    // while preserving word/character granularity.
    diffMatchPatch.diff_cleanupSemanticLossless(diffs);
  }
  if (mergeShortGaps) {
    diffMatchPatch.diff_cleanupEfficiency(diffs);
  }
}
