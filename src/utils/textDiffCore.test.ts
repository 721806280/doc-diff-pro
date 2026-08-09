import { describe, expect, it } from 'vitest';
import { summarizeDiffs } from './textDiffCore';
import { createTextDiffs } from './textDiffCompute';

describe('textDiffCore', () => {
  it('creates grouped diffs and summary for replacements', () => {
    const diffs = createTextDiffs('abc', 'axc', 'char');
    const summary = summarizeDiffs(diffs, 'char', 3, 3);

    expect(summary).toMatchObject({
      total: 1,
      inserted: 0,
      deleted: 0,
      modified: 1
    });
    expect(summary.similarity).toBeCloseTo(2 / 3, 5);
    expect(diffs.some((diff) => diff.groupId === 'diff-1')).toBe(true);
  });

  it('bridges nearby changes for semantic grouping', () => {
    const diffs = createTextDiffs('ab12cd', 'ax12yd', 'semantic');
    const summary = summarizeDiffs(diffs, 'semantic', 6, 6);

    expect(summary.total).toBe(1);
    expect(summary.modified).toBe(1);
  });
});
