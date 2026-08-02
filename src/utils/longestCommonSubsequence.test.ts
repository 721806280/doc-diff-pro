import { describe, expect, it } from 'vitest';
import { longestCommonSubsequenceLength } from './longestCommonSubsequence';

describe('longestCommonSubsequenceLength', () => {
  it('returns the full length for identical strings', () => {
    expect(longestCommonSubsequenceLength('abcde', 'abcde')).toBe(5);
  });

  it('returns zero when nothing is shared', () => {
    expect(longestCommonSubsequenceLength('abc', 'xyz')).toBe(0);
  });

  it('returns zero when either side is empty', () => {
    expect(longestCommonSubsequenceLength('', 'abc')).toBe(0);
    expect(longestCommonSubsequenceLength('abc', '')).toBe(0);
    expect(longestCommonSubsequenceLength('', '')).toBe(0);
  });

  it('finds a non-contiguous subsequence', () => {
    // a-c-e survives in both, so the answer is 3 rather than the 1 a
    // longest-common-substring would report.
    expect(longestCommonSubsequenceLength('abcde', 'ace')).toBe(3);
  });

  it('is symmetric', () => {
    expect(longestCommonSubsequenceLength('AGGTAB', 'GXTXAYB')).toBe(4);
    expect(longestCommonSubsequenceLength('GXTXAYB', 'AGGTAB')).toBe(4);
  });

  it('handles a prefix and a suffix', () => {
    expect(longestCommonSubsequenceLength('abcdef', 'abc')).toBe(3);
    expect(longestCommonSubsequenceLength('abcdef', 'def')).toBe(3);
  });

  it('counts repeated characters only as often as both sides allow', () => {
    expect(longestCommonSubsequenceLength('aaaa', 'aa')).toBe(2);
  });

  it('works on CJK text', () => {
    expect(longestCommonSubsequenceLength('合同金额与服务期限', '合同金额及服务期限')).toBe(8);
  });

  it('does not overflow the call stack on long inputs', () => {
    // The rolling rows are swapped rather than spread into splice, so length
    // here is bounded by time, not by the argument limit.
    const left = 'a'.repeat(4000);
    const right = 'a'.repeat(4000);
    expect(longestCommonSubsequenceLength(left, right)).toBe(4000);
  });
});
