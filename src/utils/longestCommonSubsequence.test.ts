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

  it('preserves UTF-16 code-unit matching for astral characters', () => {
    expect(longestCommonSubsequenceLength('😀', '😀')).toBe(2);
    expect(longestCommonSubsequenceLength('😀', '😁')).toBe(1);
    expect(longestCommonSubsequenceLength('a😀b', '😀ab')).toBe(3);
  });

  it('handles strongly unequal lengths in either order', () => {
    const longer = `${'a'.repeat(10_000)}bc`;
    expect(longestCommonSubsequenceLength('abc', longer)).toBe(3);
    expect(longestCommonSubsequenceLength(longer, 'abc')).toBe(3);
  });

  it('agrees with exhaustive subsequence enumeration for mixed short strings', () => {
    const alphabet = ['a', 'b', '中', '\ud83d', '\ude00'];
    let seed = 0x6d2b79f5;
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    const randomText = () => {
      let text = '';
      for (let remaining = next() % 9; remaining > 0; remaining--) text += alphabet[next() % alphabet.length];
      return text;
    };

    for (let sample = 0; sample < 200; sample++) {
      const left = randomText();
      const right = randomText();
      let expected = 0;
      // Enumerate subsequences directly, independently of the scoring algorithm.
      for (let mask = 0; mask < 1 << left.length; mask++) {
        let cursor = 0;
        let length = 0;
        for (let index = 0; index < left.length; index++) {
          if ((mask & (1 << index)) === 0) continue;
          const position = right.indexOf(left[index]!, cursor);
          if (position < 0) {
            length = 0;
            break;
          }
          cursor = position + 1;
          length++;
        }
        expected = Math.max(expected, length);
      }
      expect(longestCommonSubsequenceLength(left, right), JSON.stringify({ left, right })).toBe(expected);
    }
  });

  it('does not overflow the call stack on long inputs', () => {
    // Unequal inputs exercise rolling state instead of the identical-text shortcut.
    const left = 'a'.repeat(4000);
    const right = `${'a'.repeat(3999)}b`;
    expect(longestCommonSubsequenceLength(left, right)).toBe(3999);
  });
});
