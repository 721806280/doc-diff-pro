/**
 * Sørensen–Dice over adjacent character pairs: how much of two texts is built
 * from the same two-character sequences.
 *
 * Bigrams rather than characters because they carry a little word order — "甲
 * 方乙方" and "乙方甲方" share every character but few pairs. A pair occurring
 * twice on one side and once on the other is credited once rather than twice.
 *
 * The alignments that use this score every item of one sequence against every
 * item of the other, so the pair counts are taken once per item as a profile
 * and the comparison itself touches only the counts. Rebuilding the counts
 * inside the comparison would make each alignment cell cost the text's length.
 */

export type BigramProfile = {
  readonly text: string;
  /** Number of adjacent pairs: one less than the length, never negative. */
  readonly pairs: number;
  readonly counts: ReadonlyMap<string, number>;
};

export function createBigramProfile(text: string): BigramProfile {
  const counts = new Map<string, number>();
  for (let index = 0; index < text.length - 1; index++) {
    const pair = text.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }

  return { text, pairs: Math.max(0, text.length - 1), counts };
}

export function diceSimilarityFromProfiles(left: BigramProfile, right: BigramProfile): number {
  if (left.text === right.text) return 1;
  if (left.pairs === 0 || right.pairs === 0) return 0;

  // Walk the smaller map: the shared count of a pair is the lesser of its two
  // counts, and a pair absent from either side contributes nothing.
  const [fewer, more] =
    left.counts.size <= right.counts.size ? [left.counts, right.counts] : [right.counts, left.counts];
  let matches = 0;
  for (const [pair, count] of fewer) {
    const other = more.get(pair);
    if (other) matches += Math.min(count, other);
  }

  return (matches * 2) / (left.pairs + right.pairs);
}

/** Largest similarity the two profiles could reach, from their lengths alone. */
export function maxDiceSimilarity(left: BigramProfile, right: BigramProfile): number {
  if (left.pairs === 0 || right.pairs === 0) return left.text === right.text ? 1 : 0;

  return (2 * Math.min(left.pairs, right.pairs)) / (left.pairs + right.pairs);
}

/** One-off comparison; callers scoring many pairs should keep profiles instead. */
export function diceSimilarity(left: string, right: string): number {
  return diceSimilarityFromProfiles(createBigramProfile(left), createBigramProfile(right));
}
