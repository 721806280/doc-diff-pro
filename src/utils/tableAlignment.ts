/**
 * Pairs the tables of two documents against each other.
 *
 * Lives apart from `diffGroupStructure` because both the comparison engine and
 * the table hint shown while reading need it, and only the former has any use
 * for diff-match-patch. Keeping this module free of that dependency is what
 * lets the whole comparison engine load on demand.
 */

import {
  createBigramProfile,
  diceSimilarityFromProfiles,
  maxDiceSimilarity,
  type BigramProfile
} from './bigramSimilarity';

// How alike two tables must look before the alignment is willing to call them
// the same table. Low, because a table can be edited heavily and still be the
// one the reader is following: shape alone carries a lot of the evidence.
const TABLE_MATCH_THRESHOLD = 0.15;
// Table-count changes need text evidence; equal shape alone scores at most 0.3.
const TABLE_COUNT_CHANGE_MATCH_THRESHOLD = 0.35;
// What leaving a table unpaired costs, charged once per side. Skipping both
// therefore costs 0.4 while any pairing the threshold permits credits at least
// 0.15, so the alignment prefers to pair whenever it is allowed to. The
// threshold decides what may pair; this decides how hard it tries.
const TABLE_GAP_PENALTY = 0.2;
// Above this, the alignment matrices stop being worth their memory and the
// documents are past the point where table-by-table pairing tells the reader
// anything, so position wins.
const MAX_TABLE_ALIGNMENT_PAIRS = 1_000_000;

/**
 * How much better a candidate must score before it displaces the one already
 * chosen.
 *
 * Every cell's score is a running sum of floats, so two alignments genuinely
 * worth the same can end up a rounding error apart — and then the drift, rather
 * than the preference order the loop below states, decides between them. A
 * document whose only figure had been duplicated twice showed this at its
 * plainest: pairing that figure with the first copy and pairing it with the last
 * both score exactly 1, one ulp separated them, and the reader was shown the two
 * figures *above* the untouched one marked as the additions.
 *
 * Orders of magnitude below any similarity difference that means anything, so a
 * genuinely better alignment is never passed over for a worse one.
 */
const SCORE_EPSILON = 1e-9;

type AlignmentPair<T> = { original?: T; revised?: T };
export type TableAlignmentEntry = AlignmentPair<HTMLTableElement> & { id: string };

export type SequenceAlignmentOptions = {
  /** Lowest similarity at which two items may be paired at all. */
  matchThreshold: number;
  /** What leaving one item unpaired costs, charged once per side. */
  gapPenalty: number;
  /** Above this many candidate pairs, fall back to pairing by position. */
  maxPairs: number;
};

/**
 * Pairs each table in the original with the table in the revision it most
 * likely became, leaving genuinely added or removed tables unpaired.
 *
 * The ids handed back number the pairing, not the tables: a table that moved
 * keeps the same id on both sides, which is what lets the rest of the
 * comparison talk about "the same table" across the two documents.
 *
 * Signatures are taken once up front because the alignment compares every
 * table against every other, so anything derived per comparison would be
 * derived n*m times.
 */
export function alignDocumentTables(originalRoot: HTMLElement, revisedRoot: HTMLElement): TableAlignmentEntry[] {
  const original = Array.from(originalRoot.querySelectorAll<HTMLTableElement>('table'));
  const revised = Array.from(revisedRoot.querySelectorAll<HTMLTableElement>('table'));
  const signatures = new WeakMap<HTMLTableElement, ReturnType<typeof createTableSignature>>();
  [...original, ...revised].forEach((table) => signatures.set(table, createTableSignature(table)));
  const matchThreshold =
    original.length === revised.length ? TABLE_MATCH_THRESHOLD : TABLE_COUNT_CHANGE_MATCH_THRESHOLD;

  return alignSequences(
    original,
    revised,
    (left, right, threshold) => tableSimilarity(signatures.get(left)!, signatures.get(right)!, threshold),
    { matchThreshold, gapPenalty: TABLE_GAP_PENALTY, maxPairs: MAX_TABLE_ALIGNMENT_PAIRS }
  ).map((entry, index) => ({ ...entry, id: `table-${index}` }));
}

/**
 * Global sequence alignment: the best way to line two sequences up end to end,
 * where each step either pairs one item from each side or skips one side at a
 * cost.
 *
 * Pairing tables by index would be simpler and wrong at the first insertion —
 * add a table near the top and every table below it would be reported as
 * rewritten. Working out the best whole-document pairing costs an
 * (n+1) x (m+1) pass and is what keeps a single inserted table from
 * cascading.
 *
 * Shared with image alignment, which wants the same shape for the same reason
 * and differs only in what it means by similar. Order preservation is part of
 * what it offers: a document repeating one logo forty times needs no tiebreak
 * between the copies, because the alignment cannot cross them.
 */
export function alignSequences<T>(
  original: T[],
  revised: T[],
  similarity: (original: T, revised: T, matchThreshold: number) => number,
  options: SequenceAlignmentOptions
): Array<AlignmentPair<T>> {
  const { matchThreshold, gapPenalty } = options;

  if (original.length === 0 || revised.length === 0 || original.length * revised.length > options.maxPairs) {
    return alignByPosition(original, revised);
  }

  const MATCH = 0;
  const ORIGINAL = 1;
  const REVISED = 2;
  const width = revised.length + 1;
  // Scoring needs only the previous and current row. Traceback retains one
  // byte per choice; all reads below follow initialized cells within bounds.
  let previous = new Float64Array(width);
  let current = new Float64Array(width);
  const choices = new Uint8Array((original.length + 1) * width);

  // Loop bounds keep these element reads in range; T itself may legitimately be
  // a nullable type, so a value guard would be wrong here.
  const originalAt = (index: number): T => original[index] as T;
  const revisedAt = (index: number): T => revised[index] as T;

  for (let index = 1; index < width; index++) {
    previous[index] = previous[index - 1]! - gapPenalty;
    choices[index] = REVISED;
  }

  for (let originalIndex = 1; originalIndex <= original.length; originalIndex++) {
    const offset = originalIndex * width;
    current[0] = previous[0]! - gapPenalty;
    choices[offset] = ORIGINAL;
    for (let revisedIndex = 1; revisedIndex < width; revisedIndex++) {
      const matchScore = similarity(originalAt(originalIndex - 1), revisedAt(revisedIndex - 1), matchThreshold);
      let bestScore = previous[revisedIndex]! - gapPenalty;
      let bestChoice = ORIGINAL;
      const revisedScore = current[revisedIndex - 1]! - gapPenalty;
      // Each candidate has to beat the standing one outright, so a tie leaves
      // the earlier one in place: skipping beats pairing here, and because the
      // traceback reads these backwards, that is what pulls the pairings toward
      // the front of the two sequences. Three identical copies of one figure
      // pair with the first, not the last.
      if (revisedScore > bestScore + SCORE_EPSILON) {
        bestScore = revisedScore;
        bestChoice = REVISED;
      }
      if (matchScore >= matchThreshold) {
        const alignedScore = previous[revisedIndex - 1]! + matchScore;
        if (alignedScore > bestScore + SCORE_EPSILON) {
          bestScore = alignedScore;
          bestChoice = MATCH;
        }
      }

      current[revisedIndex] = bestScore;
      choices[offset + revisedIndex] = bestChoice;
    }
    [previous, current] = [current, previous];
  }

  const reversed: Array<AlignmentPair<T>> = [];
  let originalIndex = original.length;
  let revisedIndex = revised.length;
  // Walk the recorded choices back from the far corner to recover the pairing
  // that produced the best score, then flip it into document order.
  while (originalIndex > 0 || revisedIndex > 0) {
    const choice = choices[originalIndex * width + revisedIndex];
    if (choice === MATCH) {
      reversed.push({ original: originalAt(originalIndex - 1), revised: revisedAt(revisedIndex - 1) });
      originalIndex--;
      revisedIndex--;
    } else if (choice === ORIGINAL) {
      reversed.push({ original: originalAt(originalIndex - 1) });
      originalIndex--;
    } else {
      reversed.push({ revised: revisedAt(revisedIndex - 1) });
      revisedIndex--;
    }
  }

  return reversed.reverse();
}

/**
 * Degraded pairing for documents with more tables than the alignment matrices
 * can justify: pair them off in order and report the surplus as one-sided.
 */
function alignByPosition<T>(original: T[], revised: T[]): Array<AlignmentPair<T>> {
  const shared = Math.min(original.length, revised.length);
  const pairs: Array<AlignmentPair<T>> = [];

  for (let index = 0; index < shared; index++) {
    pairs.push({ original: original[index], revised: revised[index] });
  }
  for (let index = shared; index < original.length; index++) pairs.push({ original: original[index] });
  for (let index = shared; index < revised.length; index++) pairs.push({ revised: revised[index] });

  return pairs;
}

/**
 * What a table is compared on: its text, and its shape as row and cell counts.
 *
 * Shape is kept separately rather than folded into the text because it
 * survives a rewrite. A table whose every cell was reworded still has the same
 * number of rows, and that is often the only evidence left that it is the same
 * table.
 *
 * The text is held as a bigram profile because the alignment scores every
 * table against every other one; profiling once here keeps each of those
 * scores proportional to the number of distinct pairs, not the text length.
 */
type TableSignature = { text: BigramProfile; rows: number; cells: number };

function createTableSignature(table: HTMLTableElement): TableSignature {
  const rows = directTableRows(table);
  return {
    text: createBigramProfile(normalizeStructureText(table.textContent ?? '')),
    rows: rows.length,
    cells: rows.reduce((total, row) => total + directRowCells(row).length, 0)
  };
}

/**
 * Text carries most of the weight because two tables of the same shape are
 * common — a document full of three-column tables says nothing by shape alone
 * — while shared wording rarely happens by accident. Shape still gets a say,
 * so a heavily reworded table is not mistaken for a different one.
 *
 * Two tables with no text at all can only be judged on shape, which is the
 * early return.
 */
function tableSimilarity(left: TableSignature, right: TableSignature, matchThreshold: number): number {
  const rowScore = ratioSimilarity(left.rows, right.rows);
  const cellScore = ratioSimilarity(left.cells, right.cells);
  if (!left.text.text && !right.text.text) return (rowScore + cellScore) / 2;

  const shapeScore = rowScore * 0.15 + cellScore * 0.15;
  // Dice similarity can never exceed the bigram-count ratio of the two texts,
  // so a pair whose best case still falls short is rejected on lengths alone.
  // The caller only reads this score when it clears the threshold, which makes
  // the early exit invisible to the alignment and turns the n*m profile
  // comparisons into n*m integer comparisons.
  if (shapeScore + maxDiceSimilarity(left.text, right.text) * 0.7 < matchThreshold) return 0;

  return diceSimilarityFromProfiles(left.text, right.text) * 0.7 + shapeScore;
}

function ratioSimilarity(left: number, right: number): number {
  if (left === right) return 1;
  const maximum = Math.max(left, right);
  return maximum === 0 ? 1 : Math.min(left, right) / maximum;
}

export function normalizeStructureText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\s\u200b\u200c\u200d\ufeff]+/g, '')
    .toLowerCase();
}

export function directTableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.querySelectorAll<HTMLTableRowElement>('tr')).filter((row) => row.closest('table') === table);
}

export function directRowCells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  return Array.from(row.children).filter(
    (element): element is HTMLTableCellElement => element instanceof HTMLTableCellElement
  );
}
