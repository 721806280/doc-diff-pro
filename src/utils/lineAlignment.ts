/**
 * Lines up the paragraphs of two documents before any of their text is compared.
 *
 * The comparison engine used to hand both documents to diff-match-patch whole,
 * which has two consequences worth removing. `diff_main` bounds its search with
 * a wall clock, so on a long pair it abandons the exact search partway and
 * returns a coarse split of whatever is left — meaning the same two documents
 * can produce different differences on a fast machine and a slow one, and that
 * quality *falls* as documents grow. Neither is acceptable in a tool whose whole
 * output is a claim about what changed.
 *
 * Aligning paragraphs first removes the need for that bound rather than tuning
 * it: every character-level comparison downstream is then one paragraph against
 * one paragraph, small enough to solve exactly and quickly.
 *
 * The alignment is patience-style. Lines that occur exactly once on each side and
 * match are unambiguous, so they become anchors; the longest increasing run of
 * those anchors is the skeleton, and only the gaps between them need weighing by
 * similarity. That ordering is what keeps this near-linear on the documents where
 * a full matrix would not fit, and it also produces the alignment a reader would
 * have drawn by hand: a repeated boilerplate line never anchors anything, while a
 * distinctive heading does.
 */

import { longestCommonSubsequenceLength } from './longestCommonSubsequence';
import { alignSequences, diceSimilarity } from './tableAlignment';

/** Lowest bigram similarity at which two paragraphs may be called the same one. */
const LINE_MATCH_THRESHOLD = 0.35;
/**
 * What leaving a paragraph unpaired costs, charged once per side. Half the
 * threshold, so pairing is preferred exactly when the threshold permits it and
 * never otherwise; the two constants cannot drift apart.
 */
const LINE_GAP_PENALTY = LINE_MATCH_THRESHOLD / 2;
/** Above this many candidate pairs within one gap, fall back to position. */
const MAX_GAP_ALIGNMENT_PAIRS = 40_000;
/**
 * How deep the anchor recursion may go before a gap is simply weighed as it
 * stands. Reached only by contrived input — real documents resolve in a handful
 * of levels — and its purpose is to make this function total rather than to
 * improve any alignment.
 */
const MAX_ANCHOR_DEPTH = 48;
/**
 * Below this length a line is compared by longest common subsequence instead of
 * by bigrams.
 *
 * Bigrams need length to mean anything. "abc" and "axc" plainly correspond and
 * share two of three characters, yet they have no bigram in common at all, so
 * Dice scores them zero — and a table of dates, amounts and short labels is made
 * almost entirely of lines that short. The subsequence ratio is quadratic, which
 * is why it is reserved for the lines where quadratic costs nothing.
 */
const MAX_EXACT_SIMILARITY_LENGTH = 64;

/**
 * Characters of a longer line the similarity is allowed to look at. A document
 * whose converter merged a whole section into one paragraph would otherwise make
 * every comparison against it proportional to the section's length.
 */
const MAX_SIMILARITY_LENGTH = 2048;

export type LineAlignmentEntry = {
  /** Index into the original lines, absent when the line only exists on the right. */
  original?: number;
  /** Index into the revised lines, absent when the line only exists on the left. */
  revised?: number;
};

export function alignLines(original: readonly string[], revised: readonly string[]): LineAlignmentEntry[] {
  const entries: LineAlignmentEntry[] = [];
  alignRange(
    original,
    revised,
    { originalStart: 0, originalEnd: original.length },
    { start: 0, end: revised.length },
    0,
    entries
  );

  return entries;
}

type OriginalRange = { originalStart: number; originalEnd: number };
type RevisedRange = { start: number; end: number };

/**
 * Aligns one range of each side, appending to `entries` in document order.
 *
 * Equal runs at either end are taken first. They are the cheapest possible
 * evidence and stripping them is what turns a small edit in a long document into
 * a small problem.
 */
function alignRange(
  original: readonly string[],
  revised: readonly string[],
  originalRange: OriginalRange,
  revisedRange: RevisedRange,
  depth: number,
  entries: LineAlignmentEntry[]
): void {
  let { originalStart, originalEnd } = originalRange;
  let { start: revisedStart, end: revisedEnd } = revisedRange;

  while (
    originalStart < originalEnd &&
    revisedStart < revisedEnd &&
    original[originalStart] === revised[revisedStart]
  ) {
    entries.push({ original: originalStart++, revised: revisedStart++ });
  }

  const suffix: LineAlignmentEntry[] = [];
  while (
    originalEnd > originalStart &&
    revisedEnd > revisedStart &&
    original[originalEnd - 1] === revised[revisedEnd - 1]
  ) {
    suffix.push({ original: --originalEnd, revised: --revisedEnd });
  }
  suffix.reverse();

  alignInterior(
    original,
    revised,
    { originalStart, originalEnd },
    { start: revisedStart, end: revisedEnd },
    depth,
    entries
  );
  entries.push(...suffix);
}

function alignInterior(
  original: readonly string[],
  revised: readonly string[],
  { originalStart, originalEnd }: OriginalRange,
  { start: revisedStart, end: revisedEnd }: RevisedRange,
  depth: number,
  entries: LineAlignmentEntry[]
): void {
  if (originalStart >= originalEnd && revisedStart >= revisedEnd) return;

  if (originalStart >= originalEnd) {
    for (let index = revisedStart; index < revisedEnd; index++) entries.push({ revised: index });
    return;
  }
  if (revisedStart >= revisedEnd) {
    for (let index = originalStart; index < originalEnd; index++) entries.push({ original: index });
    return;
  }

  const anchors =
    depth < MAX_ANCHOR_DEPTH
      ? findUniqueAnchors(original, revised, originalStart, originalEnd, revisedStart, revisedEnd)
      : [];
  if (anchors.length === 0) {
    weighGap(original, revised, originalStart, originalEnd, revisedStart, revisedEnd, entries);
    return;
  }

  // Anchors can cross each other; only an increasing run of them can all hold at
  // once, and the longest such run leaves the least to weigh by similarity.
  const skeleton = longestIncreasingAnchors(anchors);
  let originalCursor = originalStart;
  let revisedCursor = revisedStart;

  for (const anchor of skeleton) {
    alignRange(
      original,
      revised,
      { originalStart: originalCursor, originalEnd: anchor.original },
      { start: revisedCursor, end: anchor.revised },
      depth + 1,
      entries
    );
    entries.push({ original: anchor.original, revised: anchor.revised });
    originalCursor = anchor.original + 1;
    revisedCursor = anchor.revised + 1;
  }

  alignRange(
    original,
    revised,
    { originalStart: originalCursor, originalEnd },
    { start: revisedCursor, end: revisedEnd },
    depth + 1,
    entries
  );
}

type Anchor = { original: number; revised: number };

/**
 * Lines appearing exactly once on each side of this range, and equal.
 *
 * Uniqueness is the whole point: a line of boilerplate repeated forty times says
 * nothing about which of its occurrences corresponds to which, while a line that
 * appears once on each side can only correspond to itself.
 */
function findUniqueAnchors(
  original: readonly string[],
  revised: readonly string[],
  originalStart: number,
  originalEnd: number,
  revisedStart: number,
  revisedEnd: number
): Anchor[] {
  const originalPositions = new Map<string, number | null>();
  for (let index = originalStart; index < originalEnd; index++) {
    const line = original[index] ?? '';
    originalPositions.set(line, originalPositions.has(line) ? null : index);
  }

  const anchors: Anchor[] = [];
  const seen = new Map<string, number | null>();
  for (let index = revisedStart; index < revisedEnd; index++) {
    const line = revised[index] ?? '';
    seen.set(line, seen.has(line) ? null : index);
  }

  for (const [line, revisedIndex] of seen) {
    const originalIndex = originalPositions.get(line);
    if (revisedIndex === null || originalIndex === null || originalIndex === undefined) continue;
    // A blank separator carries no identity, and a document has many.
    if (line.trim().length === 0) continue;

    anchors.push({ original: originalIndex, revised: revisedIndex });
  }

  return anchors.sort((left, right) => left.original - right.original);
}

/**
 * The longest run of anchors that increases on both sides, recovered by patience
 * sorting: each anchor extends the shortest run whose end it can follow, and the
 * chain is walked back from the last one.
 */
function longestIncreasingAnchors(anchors: readonly Anchor[]): Anchor[] {
  const tails: number[] = [];
  const previous = new Array<number>(anchors.length).fill(-1);

  for (let index = 0; index < anchors.length; index++) {
    const revised = anchors[index]?.revised ?? 0;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((anchors[tails[middle] ?? 0]?.revised ?? 0) < revised) low = middle + 1;
      else high = middle;
    }

    previous[index] = low > 0 ? (tails[low - 1] ?? -1) : -1;
    tails[low] = index;
  }

  const chain: Anchor[] = [];
  let cursor = tails.length > 0 ? (tails[tails.length - 1] ?? -1) : -1;
  while (cursor >= 0) {
    const anchor = anchors[cursor];
    if (anchor) chain.push(anchor);
    cursor = previous[cursor] ?? -1;
  }

  return chain.reverse();
}

/**
 * Weighs a stretch with no unambiguous anchors left in it.
 *
 * This is where a reworded paragraph is recognised as the same paragraph, and it
 * is the only part of the alignment that costs a matrix — which is affordable
 * precisely because anchoring ran first and left this stretch short.
 */
function weighGap(
  original: readonly string[],
  revised: readonly string[],
  originalStart: number,
  originalEnd: number,
  revisedStart: number,
  revisedEnd: number,
  entries: LineAlignmentEntry[]
): void {
  // One paragraph facing one paragraph, with everything around them already
  // matched: there is no ambiguity for a threshold to resolve, and the two are
  // the same paragraph revised however little they still have in common. The rest
  // of the comparison makes the same call for the same reason — see
  // `pairScopedBuckets`, which pairs a sole candidate outright.
  if (originalEnd - originalStart === 1 && revisedEnd - revisedStart === 1) {
    entries.push({ original: originalStart, revised: revisedStart });
    return;
  }

  const originalIndices = range(originalStart, originalEnd);
  const revisedIndices = range(revisedStart, revisedEnd);

  const paired = alignSequences(
    originalIndices,
    revisedIndices,
    (left, right) => lineSimilarity(original[left] ?? '', revised[right] ?? ''),
    { matchThreshold: LINE_MATCH_THRESHOLD, gapPenalty: LINE_GAP_PENALTY, maxPairs: MAX_GAP_ALIGNMENT_PAIRS }
  );

  for (const pair of paired) {
    entries.push({ original: pair.original, revised: pair.revised });
  }
}

function lineSimilarity(left: string, right: string): number {
  if (left.length <= MAX_EXACT_SIMILARITY_LENGTH && right.length <= MAX_EXACT_SIMILARITY_LENGTH) {
    const longest = Math.max(left.length, right.length);
    return longest === 0 ? 1 : longestCommonSubsequenceLength(left, right) / longest;
  }

  return diceSimilarity(left.slice(0, MAX_SIMILARITY_LENGTH), right.slice(0, MAX_SIMILARITY_LENGTH));
}

function range(start: number, end: number): number[] {
  const values: number[] = [];
  for (let index = start; index < end; index++) values.push(index);

  return values;
}
