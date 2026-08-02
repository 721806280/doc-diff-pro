/**
 * Length of the longest common subsequence of two strings.
 *
 * Used as the similarity kernel for both difference grouping and table row
 * matching. Keeps two rolling rows instead of the full n*m matrix and swaps
 * them each pass, so memory is O(min side) and no per-row copy is made.
 *
 * Both rows are sized `right.length + 1` and every index below is derived from
 * the loop bounds, so the `?? 0` fallbacks never trigger at runtime.
 */
export function longestCommonSubsequenceLength(left: string, right: string): number {
  let previous = new Array<number>(right.length + 1).fill(0);
  let current = new Array<number>(right.length + 1).fill(0);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex++) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex++) {
      current[rightIndex + 1] =
        left[leftIndex] === right[rightIndex]
          ? (previous[rightIndex] ?? 0) + 1
          : Math.max(previous[rightIndex + 1] ?? 0, current[rightIndex] ?? 0);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }

  return previous[right.length] ?? 0;
}
