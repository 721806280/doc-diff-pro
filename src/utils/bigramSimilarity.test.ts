import { describe, expect, it } from 'vitest';
import { createBigramProfile, diceSimilarity, diceSimilarityFromProfiles, maxDiceSimilarity } from './bigramSimilarity';

describe('bigramSimilarity', () => {
  it('scores shared adjacent pairs and credits a repeated pair only as often as both sides have it', () => {
    // "aaaa" holds "aa" three times, "aa" holds it once: one shared pair over
    // 3 + 1 pairs in total.
    expect(diceSimilarity('aaaa', 'aa')).toBeCloseTo(0.5);
    // Word order matters: the same characters in another order lose the pairs
    // that straddled the reordering, where a character count would see no change.
    expect(diceSimilarity('甲方乙方', '乙方甲方')).toBeCloseTo(2 / 3);
    expect(diceSimilarity('第一条 合同标的', '第一条 合同价款')).toBeGreaterThan(0.5);
  });

  it('treats identical texts as the same and texts too short for a pair as unrelated', () => {
    expect(diceSimilarity('', '')).toBe(1);
    expect(diceSimilarity('a', 'a')).toBe(1);
    expect(diceSimilarity('a', 'b')).toBe(0);
    expect(diceSimilarity('', 'ab')).toBe(0);
    expect(diceSimilarity('abc', 'xyz')).toBe(0);
  });

  it('compares from profiles without touching the texts again', () => {
    const left = createBigramProfile('合同双方约定如下');
    const right = createBigramProfile('合同双方另行约定');

    expect(left.pairs).toBe(7);
    expect(diceSimilarityFromProfiles(left, right)).toBe(diceSimilarity('合同双方约定如下', '合同双方另行约定'));
    // Symmetric regardless of which side has fewer distinct pairs.
    expect(diceSimilarityFromProfiles(right, left)).toBe(diceSimilarityFromProfiles(left, right));
  });

  it('bounds the reachable similarity by pair counts alone', () => {
    const short = createBigramProfile('abc');
    const long = createBigramProfile('abcdefghij');

    expect(maxDiceSimilarity(short, long)).toBeCloseTo((2 * 2) / (2 + 9));
    expect(diceSimilarityFromProfiles(short, long)).toBeLessThanOrEqual(maxDiceSimilarity(short, long));
    expect(maxDiceSimilarity(createBigramProfile('a'), createBigramProfile('a'))).toBe(1);
    expect(maxDiceSimilarity(createBigramProfile('a'), createBigramProfile('ab'))).toBe(0);
  });
});
