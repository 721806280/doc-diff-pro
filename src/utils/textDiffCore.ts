import DiffMatchPatch from 'diff-match-patch';
import type { DiffGranularity, DiffOperation, DiffSummary, DiffTuple } from '@/types/diff';

const diffMatchPatch = new DiffMatchPatch();
diffMatchPatch.Diff_Timeout = 0;

export const DIFF_DELETE = -1 satisfies DiffOperation;
export const DIFF_EQUAL = 0 satisfies DiffOperation;
export const DIFF_INSERT = 1 satisfies DiffOperation;
const DIFF_ID_PREFIX = 'diff-';

export function diffId(index: number): string {
  return `${DIFF_ID_PREFIX}${index}`;
}

export function parseDiffId(id: string): number {
  return Number.parseInt(id.slice(DIFF_ID_PREFIX.length), 10);
}

export function createTextDiffs(
  originalText: string,
  revisedText: string,
  granularity: DiffGranularity
): DiffTuple[] {
  const diffs = diffMatchPatch.diff_main(originalText, revisedText) as DiffTuple[];

  cleanupDiffs(diffs, granularity);
  return diffs;
}

export function summarizeDiffs(
  diffs: DiffTuple[],
  granularity: DiffGranularity,
  originalLength: number,
  revisedLength: number
): DiffSummary {
  return assignDiffGroups(diffs, getGapThreshold(granularity), originalLength, revisedLength);
}

function cleanupDiffs(diffs: DiffTuple[], granularity: DiffGranularity): void {
  if (granularity === 'semantic') {
    diffMatchPatch.diff_cleanupSemantic(diffs);
  }
  diffMatchPatch.diff_cleanupEfficiency(diffs);
}

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
    const [operation, text] = diffs[index];

    if (operation !== DIFF_EQUAL) {
      if (!inGroup) {
        groupCount++;
        inGroup = true;
      }
      const groupId = diffId(groupCount);
      const operations = groupOperations.get(groupId) ?? new Set<DiffOperation>();

      operations.add(operation);
      diffs[index].groupId = groupId;
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
    modified: 0
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

function getGapThreshold(granularity: DiffGranularity): number {
  if (granularity === 'word') return 6;
  if (granularity === 'char') return 0;
  return 2;
}
