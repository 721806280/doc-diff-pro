/**
 * Length of the longest common subsequence, counted in UTF-16 code units.
 *
 * Shared by paragraph, table and difference matching. One rolling row is
 * sized to the shorter string; the saved diagonal retains the previous row's
 * value before that cell is overwritten.
 */
export function longestCommonSubsequenceLength(left: string, right: string): number {
  if (left === right) return left.length;
  if (left.length < right.length) [left, right] = [right, left];
  if (right.length === 0) return 0;

  const row = new Uint32Array(right.length + 1);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex++) {
    const character = left.charCodeAt(leftIndex);
    let diagonal = 0;
    for (let rightIndex = 0; rightIndex < right.length; rightIndex++) {
      const above = row[rightIndex + 1]!;
      row[rightIndex + 1] =
        character === right.charCodeAt(rightIndex) ? diagonal + 1 : Math.max(above, row[rightIndex]!);
      diagonal = above;
    }
  }

  return row[right.length]!;
}
