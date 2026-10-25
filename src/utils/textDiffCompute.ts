import DiffMatchPatch from 'diff-match-patch';
import type { DiffGranularity, DiffSide, DiffTuple } from '@/types/diff';
import { alignLines } from './lineAlignment';
import { DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT } from './textDiffCore';

/**
 * Computes the character differences between two documents, one paragraph at a
 * time.
 *
 * Handing both documents to `diff_main` whole is the obvious implementation and
 * it has a defect that cannot be tuned away: `diff_main` bounds its search with
 * `Date.now()`, so on a long pair it abandons the exact search partway through
 * and returns a coarse split of the remainder. Two consequences follow. The same
 * two documents can produce different differences on a fast machine than on a
 * slow or busy one — for a tool whose entire output is a claim about what
 * changed, that is disqualifying. And quality *degrades* as documents grow, which
 * is backwards.
 *
 * Aligning paragraphs first removes the need for that bound instead of adjusting
 * it. Every call into diff-match-patch is then one paragraph against one
 * paragraph — and, because the alignment only pairs paragraphs it already judged
 * similar, a pair whose edit distance is small, which is exactly when the exact
 * algorithm is fast. What is left is bounded by size rather than by a clock, so
 * the result depends only on the input.
 *
 * The contract with everything downstream is unchanged and load-bearing:
 * concatenating the deletions and equalities reproduces the original text, and
 * concatenating the insertions and equalities reproduces the revised text.
 * `diffMarkup` maps tuple offsets back onto DOM text nodes through exactly that
 * correspondence.
 *
 * diff-match-patch searches UTF-16 code units. Shared ends and returned
 * equalities are guarded so no tuple boundary splits a surrogate pair before
 * those offsets become separate DOM text nodes.
 */

/**
 * Longest stretch of a single paragraph pair still compared exactly, measured
 * after the shared prefix and suffix have been set aside.
 *
 * A size ceiling rather than a deadline, so that reaching it is a property of the
 * documents and not of the machine. Only a converter that merged a whole section
 * into one paragraph gets near it, and stripping the shared ends first means even
 * those are usually compared exactly, because what actually changed inside them
 * is small.
 */
export const MAX_EXACT_DIFF_CHARS = 20_000;

const diffMatchPatch = new DiffMatchPatch();
// Deliberately no limit. Nothing reaches this without having been bounded by
// size first, and a time limit here is what made the output machine-dependent.
diffMatchPatch.Diff_Timeout = 0;

/**
 * Kept apart from `textDiffCore` so that the diff-match-patch bundle follows
 * the comparison engine into its own chunk. The identifier and summary helpers
 * next door are needed by the review UI from the first paint; this is not.
 */
export function createTextDiffs(
  original: DiffSide,
  revised: DiffSide,
  granularity: DiffGranularity,
  options: { mergeShortGaps?: boolean } = {}
): DiffTuple[] {
  const originalBlocks = splitBlocks(original);
  const revisedBlocks = splitBlocks(revised);
  const mergeShortGaps = options.mergeShortGaps ?? true;
  const diffs: DiffTuple[] = [];

  for (const entry of alignLines(originalBlocks, revisedBlocks)) {
    const left = entry.original === undefined ? undefined : (originalBlocks[entry.original] ?? '');
    const right = entry.revised === undefined ? undefined : (revisedBlocks[entry.revised] ?? '');

    if (left !== undefined && right !== undefined) {
      appendParagraphDiff(diffs, left, right, granularity, mergeShortGaps);
    } else if (left !== undefined) {
      append(diffs, DIFF_DELETE, left);
    } else if (right !== undefined) {
      append(diffs, DIFF_INSERT, right);
    }
  }

  return diffs;
}

/**
 * The text cut at its block boundaries, into pieces that concatenate back to it
 * exactly.
 *
 * Whatever the separator collapsed to — a space, or nothing — stays with the
 * block it trailed. That keeps the pieces a true partition of the text, which is
 * what lets the tuples assembled from them reproduce both documents.
 */
function splitBlocks({ text, boundaries }: DiffSide): string[] {
  if (boundaries.length === 0) return [text];

  const blocks: string[] = [];
  let start = 0;
  for (const boundary of boundaries) {
    if (boundary <= start || boundary > text.length) continue;
    blocks.push(text.slice(start, boundary));
    start = boundary;
  }
  blocks.push(text.slice(start));

  return blocks;
}

function appendParagraphDiff(
  diffs: DiffTuple[],
  original: string,
  revised: string,
  granularity: DiffGranularity,
  mergeShortGaps: boolean
): void {
  if (original === revised) {
    append(diffs, DIFF_EQUAL, original);
    return;
  }

  // Shared ends first. They are free to find, they are the bulk of a paragraph
  // that was lightly edited, and setting them aside is what keeps even an
  // oversized paragraph inside the exact budget.
  const prefix = commonPrefixLength(original, revised);
  const suffix = commonSuffixLength(original.slice(prefix), revised.slice(prefix));
  const originalMiddle = original.slice(prefix, original.length - suffix);
  const revisedMiddle = revised.slice(prefix, revised.length - suffix);

  if (prefix > 0) append(diffs, DIFF_EQUAL, original.slice(0, prefix));

  if (Math.max(originalMiddle.length, revisedMiddle.length) > MAX_EXACT_DIFF_CHARS) {
    // One replacement rather than an exact but unbounded search. Reached only by
    // a pair too large to be a paragraph at all, and reported as the one thing
    // that is certainly true about it.
    if (originalMiddle) append(diffs, DIFF_DELETE, originalMiddle);
    if (revisedMiddle) append(diffs, DIFF_INSERT, revisedMiddle);
  } else {
    for (const [operation, text] of computeMiddle(originalMiddle, revisedMiddle, granularity, mergeShortGaps)) {
      append(diffs, operation, text);
    }
  }

  if (suffix > 0) append(diffs, DIFF_EQUAL, original.slice(original.length - suffix));
}

function computeMiddle(
  original: string,
  revised: string,
  granularity: DiffGranularity,
  mergeShortGaps: boolean
): DiffTuple[] {
  if (!original && !revised) return [];
  if (!original) return [[DIFF_INSERT, revised]];
  if (!revised) return [[DIFF_DELETE, original]];

  const diffs = diffMatchPatch.diff_main(original, revised) as DiffTuple[];
  cleanupDiffs(diffs, granularity, mergeShortGaps);
  return repairSurrogateBoundaries(diffs);
}

/** Move shared surrogate halves into the adjacent edits to keep whole characters. */
function repairSurrogateBoundaries(diffs: DiffTuple[]): DiffTuple[] {
  const hasSplit = diffs.some(
    ([, text]) => isLowSurrogate(text.charCodeAt(0)) || isHighSurrogate(text.charCodeAt(text.length - 1))
  );
  if (!hasSplit) return diffs;

  const repaired: DiffTuple[] = [];
  let deleted = '';
  let inserted = '';
  const flushChanges = (): void => {
    append(repaired, DIFF_DELETE, deleted);
    append(repaired, DIFF_INSERT, inserted);
    deleted = '';
    inserted = '';
  };

  for (const [operation, text] of diffs) {
    if (operation === DIFF_DELETE) deleted += text;
    else if (operation === DIFF_INSERT) inserted += text;
    else {
      const start = isLowSurrogate(text.charCodeAt(0)) ? 1 : 0;
      const end = text.length - (isHighSurrogate(text.charCodeAt(text.length - 1)) ? 1 : 0);
      // An equality can consist entirely of a shared half. Keeping it as an
      // edit lets the next run supply its partner on each side independently.
      deleted += text.slice(0, start);
      inserted += text.slice(0, start);
      if (start < end) {
        flushChanges();
        append(repaired, DIFF_EQUAL, text.slice(start, end));
      }
      deleted += text.slice(end);
      inserted += text.slice(end);
    }
  }
  flushChanges();
  return repaired;
}

/**
 * Cleanup runs per paragraph, not over the assembled result.
 *
 * `diff_cleanupSemantic` and `diff_cleanupEfficiency` both eliminate short
 * equalities caught between edits, turning them into a deletion and an insertion
 * of the same text. Run across the whole document that would reach across
 * paragraph boundaries and report untouched paragraphs as replaced whenever their
 * neighbours were edited. Confined to one paragraph it does what it is for:
 * makes a reworded phrase read as one change.
 */
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

/** Appends, folding into the previous tuple when it carries the same operation. */
function append(diffs: DiffTuple[], operation: DiffTuple[0], text: string): void {
  if (!text) return;

  const previous = diffs.at(-1);
  if (previous && previous[0] === operation) {
    previous[1] += text;
    return;
  }

  diffs.push([operation, text]);
}

/**
 * Shared leading characters, never splitting a surrogate pair.
 *
 * Half a pair on one side of a boundary and half on the other would leave lone
 * surrogates in the markup, which is a corrupted document rather than a
 * mismatched one.
 */
function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left[length] === right[length]) length++;

  return isHighSurrogate(left.charCodeAt(length - 1)) ? length - 1 : length;
}

function commonSuffixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left[left.length - length - 1] === right[right.length - length - 1]) length++;

  return isLowSurrogate(left.charCodeAt(left.length - length)) ? length - 1 : length;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
