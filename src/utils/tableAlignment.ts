/**
 * Pairs the tables of two documents against each other.
 *
 * Lives apart from `diffGroupStructure` because both the comparison engine and
 * the table hint shown while reading need it, and only the former has any use
 * for diff-match-patch. Keeping this module free of that dependency is what
 * lets the whole comparison engine load on demand.
 */

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

type AlignmentPair<T> = { original?: T; revised?: T };
export type TableAlignmentEntry = AlignmentPair<HTMLTableElement> & { id: string };

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
    matchThreshold
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
 */
function alignSequences<T>(
  original: T[],
  revised: T[],
  similarity: (original: T, revised: T, matchThreshold: number) => number,
  matchThreshold: number
): Array<AlignmentPair<T>> {
  type AlignmentChoice = 'match' | 'original' | 'revised';

  if (original.length * revised.length > MAX_TABLE_ALIGNMENT_PAIRS) {
    return alignByPosition(original, revised);
  }

  const scores = Array.from({ length: original.length + 1 }, () =>
    new Array<number>(revised.length + 1).fill(Number.NEGATIVE_INFINITY)
  );
  const choices = Array.from({ length: original.length + 1 }, () =>
    new Array<AlignmentChoice | null>(revised.length + 1).fill(null)
  );

  // Both matrices are allocated at (original.length + 1) x (revised.length + 1)
  // and every index below is derived from those same bounds, so these accessors
  // never fall back at runtime. They exist to state the invariant once instead
  // of guarding at each of the dozen index sites in the loops.
  const scoreAt = (row: number, column: number): number => scores[row]?.[column] ?? Number.NEGATIVE_INFINITY;
  const setScore = (row: number, column: number, value: number): void => {
    const line = scores[row];
    if (line) line[column] = value;
  };
  const setChoice = (row: number, column: number, value: AlignmentChoice): void => {
    const line = choices[row];
    if (line) line[column] = value;
  };
  // Loop bounds keep these element reads in range; T itself may legitimately be
  // a nullable type, so a value guard would be wrong here.
  const originalAt = (index: number): T => original[index] as T;
  const revisedAt = (index: number): T => revised[index] as T;

  setScore(0, 0, 0);
  for (let index = 1; index <= original.length; index++) {
    setScore(index, 0, scoreAt(index - 1, 0) - TABLE_GAP_PENALTY);
    setChoice(index, 0, 'original');
  }
  for (let index = 1; index <= revised.length; index++) {
    setScore(0, index, scoreAt(0, index - 1) - TABLE_GAP_PENALTY);
    setChoice(0, index, 'revised');
  }

  for (let originalIndex = 1; originalIndex <= original.length; originalIndex++) {
    for (let revisedIndex = 1; revisedIndex <= revised.length; revisedIndex++) {
      const matchScore = similarity(originalAt(originalIndex - 1), revisedAt(revisedIndex - 1), matchThreshold);
      let bestScore = scoreAt(originalIndex - 1, revisedIndex) - TABLE_GAP_PENALTY;
      let bestChoice: AlignmentChoice = 'original';
      const revisedScore = scoreAt(originalIndex, revisedIndex - 1) - TABLE_GAP_PENALTY;
      if (revisedScore > bestScore) {
        bestScore = revisedScore;
        bestChoice = 'revised';
      }
      if (matchScore >= matchThreshold) {
        const alignedScore = scoreAt(originalIndex - 1, revisedIndex - 1) + matchScore;
        if (alignedScore > bestScore) {
          bestScore = alignedScore;
          bestChoice = 'match';
        }
      }

      setScore(originalIndex, revisedIndex, bestScore);
      setChoice(originalIndex, revisedIndex, bestChoice);
    }
  }

  const reversed: Array<AlignmentPair<T>> = [];
  let originalIndex = original.length;
  let revisedIndex = revised.length;
  // Walk the recorded choices back from the far corner to recover the pairing
  // that produced the best score, then flip it into document order.
  while (originalIndex > 0 || revisedIndex > 0) {
    const choice = choices[originalIndex]?.[revisedIndex] ?? null;
    if (choice === 'match') {
      reversed.push({ original: originalAt(originalIndex - 1), revised: revisedAt(revisedIndex - 1) });
      originalIndex--;
      revisedIndex--;
    } else if (choice === 'original') {
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
 */
function createTableSignature(table: HTMLTableElement): { text: string; rows: number; cells: number } {
  const rows = directTableRows(table);
  return {
    text: normalizeStructureText(table.textContent ?? ''),
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
function tableSimilarity(
  left: { text: string; rows: number; cells: number },
  right: { text: string; rows: number; cells: number },
  matchThreshold: number
): number {
  const rowScore = ratioSimilarity(left.rows, right.rows);
  const cellScore = ratioSimilarity(left.cells, right.cells);
  if (!left.text && !right.text) return (rowScore + cellScore) / 2;

  const shapeScore = rowScore * 0.15 + cellScore * 0.15;
  // Dice similarity can never exceed the bigram-count ratio of the two texts,
  // so a pair whose best case still falls short is rejected on lengths alone.
  // The caller only reads this score when it clears the threshold, which makes
  // the early exit invisible to the alignment and turns the n*m full-text
  // scans into n*m integer comparisons.
  if (shapeScore + maxDiceSimilarity(left.text, right.text) * 0.7 < matchThreshold) return 0;

  return diceSimilarity(left.text, right.text) * 0.7 + shapeScore;
}

/** Largest `diceSimilarity` the two texts could reach, from their lengths alone. */
function maxDiceSimilarity(left: string, right: string): number {
  const leftPairs = Math.max(0, left.length - 1);
  const rightPairs = Math.max(0, right.length - 1);
  // Mirrors diceSimilarity's own handling of texts too short to form a bigram.
  if (leftPairs === 0 || rightPairs === 0) return left === right ? 1 : 0;

  return (2 * Math.min(leftPairs, rightPairs)) / (leftPairs + rightPairs);
}

/**
 * Sørensen–Dice over adjacent character pairs: how much of two texts is built
 * from the same two-character sequences.
 *
 * Bigrams rather than characters because they carry a little word order — "甲
 * 方乙方" and "乙方甲方" share every character but few pairs. The count map is
 * consumed as it matches, so a pair occurring twice on one side and once on
 * the other is credited once rather than twice.
 */
function diceSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;
  if (left.length < 2 || right.length < 2) return 0;

  const counts = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index++) {
    const pair = left.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }

  let matches = 0;
  for (let index = 0; index < right.length - 1; index++) {
    const pair = right.slice(index, index + 2);
    const count = counts.get(pair) ?? 0;
    if (count <= 0) continue;
    matches++;
    counts.set(pair, count - 1);
  }

  return (matches * 2) / (left.length - 1 + (right.length - 1));
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
