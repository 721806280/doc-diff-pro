import type { DiffGranularity, DiffOperation, DiffSummary, DiffTuple } from '@/types/diff';

/**
 * Difference identifiers and summary arithmetic — everything about a diff that
 * does not require computing one. Deliberately free of diff-match-patch: the
 * review UI reads these from the first paint, while the engine that produces
 * the diffs (`textDiffCompute`) only loads once there is something to compare.
 */
export const DIFF_DELETE = -1 satisfies DiffOperation;
export const DIFF_EQUAL = 0 satisfies DiffOperation;
export const DIFF_INSERT = 1 satisfies DiffOperation;
const MIN_SIMILARITY = 0;
const MAX_SIMILARITY = 1;
const DIFF_ID_PREFIX = 'diff-';

export function diffId(index: number): string {
  return `${DIFF_ID_PREFIX}${index}`;
}

export function parseDiffId(id: string): number {
  return Number.parseInt(id.slice(DIFF_ID_PREFIX.length), 10);
}

export function summarizeDiffs(
  diffs: DiffTuple[],
  granularity: DiffGranularity,
  originalLength: number,
  revisedLength: number
): DiffSummary {
  return assignDiffGroups(diffs, getGapThreshold(granularity), originalLength, revisedLength);
}

/**
 * Numbers the differences and tags each diff entry with the group it belongs
 * to.
 *
 * A group is a run of edits that reads as one change. Edits separated by a
 * short enough stretch of unchanged text stay in the same group, so that a
 * reworded phrase arrives as one difference rather than one per surviving
 * word. What counts as short enough is the caller's gap threshold, which
 * follows the granularity the reader chose.
 */
function assignDiffGroups(
  diffs: DiffTuple[],
  gapThreshold: number,
  originalLength: number,
  revisedLength: number
): DiffSummary {
  let groupCount = 0;
  let inGroup = false;
  const groupOperations = new Map<string, Set<DiffOperation>>();

  for (let index = 0; index < diffs.length; index++) {
    const entry = diffs[index];
    if (!entry) continue;
    const [operation, text] = entry;

    if (operation !== DIFF_EQUAL) {
      if (!inGroup) {
        groupCount++;
        inGroup = true;
      }
      const groupId = diffId(groupCount);
      const operations = groupOperations.get(groupId) ?? new Set<DiffOperation>();

      operations.add(operation);
      entry.groupId = groupId;
      groupOperations.set(groupId, operations);
      continue;
    }

    const nextDiff = diffs[index + 1];
    const bridgesChanges = text.length <= gapThreshold && nextDiff?.[0] !== DIFF_EQUAL;
    if (!bridgesChanges) inGroup = false;
  }

  return buildDiffSummary(groupOperations, diffs, originalLength, revisedLength);
}

function buildDiffSummary(
  groupOperations: Map<string, Set<DiffOperation>>,
  diffs: DiffTuple[],
  originalLength: number,
  revisedLength: number
): DiffSummary {
  const summary: DiffSummary = {
    total: groupOperations.size,
    inserted: 0,
    deleted: 0,
    modified: 0,
    similarity: calculateSimilarity(diffs, originalLength, revisedLength),
    layoutNoiseFiltered: 0,
    layoutNoiseItems: []
  };

  for (const operations of groupOperations.values()) {
    const hasDeletion = operations.has(DIFF_DELETE);
    const hasInsertion = operations.has(DIFF_INSERT);

    if (hasDeletion && hasInsertion) {
      summary.modified++;
    } else if (hasInsertion) {
      summary.inserted++;
    } else if (hasDeletion) {
      summary.deleted++;
    }
  }

  return summary;
}

/**
 * How much of the longer document survived the revision, as a fraction.
 *
 * Measured against the longer side so that the figure means the same thing
 * whether text was added or removed: rewriting half of a document and deleting
 * half of it both read as 50%.
 */
function calculateSimilarity(diffs: DiffTuple[], originalLength: number, revisedLength: number): number {
  const baselineLength = Math.max(originalLength, revisedLength);
  if (baselineLength === 0) return MAX_SIMILARITY;

  const editDistance = estimateEditDistance(diffs);
  const similarity = 1 - editDistance / baselineLength;
  return clampSimilarity(similarity);
}

/**
 * Charges a replacement once rather than twice.
 *
 * Adjacent deletions and insertions are one edit to a reader — a phrase was
 * swapped — so each run between two unchanged stretches costs the longer of
 * the two sides, not their sum. Summing them would drive a thoroughly reworded
 * document past a full document's worth of edits and into the clamp, where
 * every such document would look equally unrecognisable.
 */
function estimateEditDistance(diffs: DiffTuple[]): number {
  let distance = 0;
  let insertions = 0;
  let deletions = 0;

  for (const [operation, text] of diffs) {
    if (operation === DIFF_INSERT) {
      insertions += text.length;
    } else if (operation === DIFF_DELETE) {
      deletions += text.length;
    } else {
      distance += Math.max(insertions, deletions);
      insertions = 0;
      deletions = 0;
    }
  }

  return distance + Math.max(insertions, deletions);
}

function clampSimilarity(value: number): number {
  if (!Number.isFinite(value)) return MIN_SIMILARITY;
  return Math.min(MAX_SIMILARITY, Math.max(MIN_SIMILARITY, value));
}

/**
 * How much unchanged text may sit between two edits before they stop reading
 * as one difference.
 *
 * Character granularity allows none: the reader asked to see edits
 * individually, so two of them stay two. Word granularity allows enough for a
 * short word plus its spaces, so a reworded phrase arrives as one difference.
 * Semantic sits between the two.
 */
function getGapThreshold(granularity: DiffGranularity): number {
  if (granularity === 'word') return 6;
  if (granularity === 'char') return 0;
  return 2;
}
