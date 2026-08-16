import { describe, expect, it } from 'vitest';
import type { DiffTuple } from '@/types/diff';
import { DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT, summarizeDiffs } from './textDiffCore';
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

  it('counts insertion-only and deletion-only groups separately', () => {
    const inserted: DiffTuple[] = [
      [DIFF_EQUAL, 'shared'],
      [DIFF_INSERT, 'added']
    ];
    const deleted: DiffTuple[] = [
      [DIFF_EQUAL, 'shared'],
      [DIFF_DELETE, 'gone']
    ];

    expect(summarizeDiffs(inserted, 'char', 6, 11)).toMatchObject({
      total: 1,
      inserted: 1,
      deleted: 0,
      modified: 0
    });
    expect(summarizeDiffs(deleted, 'char', 10, 6)).toMatchObject({
      total: 1,
      inserted: 0,
      deleted: 1,
      modified: 0
    });
  });

  it('reports identical empty documents as fully similar', () => {
    const summary = summarizeDiffs([], 'char', 0, 0);

    expect(summary.total).toBe(0);
    expect(summary.similarity).toBe(1);
  });

  it('bridges word-granularity edits across a short unchanged word only', () => {
    const shortGap: DiffTuple[] = [
      [DIFF_DELETE, 'old'],
      [DIFF_EQUAL, ' and '],
      [DIFF_INSERT, 'new']
    ];
    const longGap: DiffTuple[] = [
      [DIFF_DELETE, 'old'],
      [DIFF_EQUAL, ' between '],
      [DIFF_INSERT, 'new']
    ];

    expect(summarizeDiffs(shortGap, 'word', 8, 8)).toMatchObject({ total: 1, modified: 1 });
    expect(summarizeDiffs(longGap, 'word', 12, 12)).toMatchObject({
      total: 2,
      deleted: 1,
      inserted: 1,
      modified: 0
    });
  });

  it('charges a replacement run once when scoring similarity', () => {
    const diffs: DiffTuple[] = [
      [DIFF_DELETE, 'abcd'],
      [DIFF_INSERT, 'wx'],
      [DIFF_EQUAL, '1234']
    ];

    const summary = summarizeDiffs(diffs, 'char', 8, 6);

    expect(summary.similarity).toBeCloseTo(1 - 4 / 8, 5);
  });
});
