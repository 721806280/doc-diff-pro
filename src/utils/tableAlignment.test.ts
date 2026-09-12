import { describe, expect, it, vi } from 'vitest';
import {
  alignDocumentTables,
  alignSequences,
  directRowCells,
  directTableRows,
  normalizeStructureText
} from './tableAlignment';

function bodyFromHtml(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body;
}

function tableHtml(text: string): string {
  return `<table><tbody><tr><td>${text}</td></tr></tbody></table>`;
}

describe('alignSequences', () => {
  const options = { matchThreshold: 0.35, gapPenalty: 0.175, maxPairs: 1000 };

  it('keeps null and undefined entries as sequence values', () => {
    const removed = { label: 'removed' };
    expect(
      alignSequences([null, removed, undefined], [null, undefined], (left, right) => (left === right ? 1 : 0), options)
    ).toStrictEqual([
      { original: null, revised: null },
      { original: removed },
      { original: undefined, revised: undefined }
    ]);
  });

  it('pairs the earliest candidates when all similarities tie', () => {
    expect(alignSequences([0], [0, 1, 2], () => 1, options)).toStrictEqual([
      { original: 0, revised: 0 },
      { revised: 1 },
      { revised: 2 }
    ]);
    expect(alignSequences([0, 1, 2], [0], () => 1, options)).toStrictEqual([
      { original: 0, revised: 0 },
      { original: 1 },
      { original: 2 }
    ]);
  });

  it('preserves the score tolerance while accepting a better pairing', () => {
    const align = (bonus: number) =>
      alignSequences([0], [0, 1, 2], (_left, right) => 1 + (right === 2 ? bonus : 0), options);

    expect(align(5e-10)).toStrictEqual([{ original: 0, revised: 0 }, { revised: 1 }, { revised: 2 }]);
    expect(align(2e-9)).toStrictEqual([{ revised: 0 }, { revised: 1 }, { original: 0, revised: 2 }]);
  });

  it('scores pairs in order at the size limit and falls back only above it', () => {
    const similarity = vi.fn(() => 0);
    expect(alignSequences([0, 1], [2, 3], similarity, { ...options, maxPairs: 4 })).toStrictEqual([
      { revised: 2 },
      { revised: 3 },
      { original: 0 },
      { original: 1 }
    ]);
    expect(similarity.mock.calls).toEqual([
      [0, 2, options.matchThreshold],
      [0, 3, options.matchThreshold],
      [1, 2, options.matchThreshold],
      [1, 3, options.matchThreshold]
    ]);
    similarity.mockClear();
    expect(alignSequences([0, 1], [2, 3], similarity, { ...options, maxPairs: 3 })).toStrictEqual([
      { original: 0, revised: 2 },
      { original: 1, revised: 3 }
    ]);
    expect(similarity).not.toHaveBeenCalled();
  });

  it('handles empty inputs without evaluating similarity', () => {
    const similarity = vi.fn(() => 1);
    expect(alignSequences([], [0, 1], similarity, options)).toStrictEqual([{ revised: 0 }, { revised: 1 }]);
    expect(alignSequences([0, 1], [], similarity, options)).toStrictEqual([{ original: 0 }, { original: 1 }]);
    expect(alignSequences([], [], similarity, options)).toStrictEqual([]);
    expect(similarity).not.toHaveBeenCalled();
  });
});

describe('tableAlignment', () => {
  it('keeps a moved table paired and reports the inserted table as one-sided', () => {
    const original = bodyFromHtml(tableHtml('甲方权利义务条款') + tableHtml('乙方付款约定条款'));
    const revised = bodyFromHtml(
      tableHtml('全新插入的说明内容') + tableHtml('甲方权利义务条款') + tableHtml('乙方付款约定条款修订')
    );

    const entries = alignDocumentTables(original, revised);
    const originalTables = Array.from(original.querySelectorAll('table'));
    const revisedTables = Array.from(revised.querySelectorAll('table'));

    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.id)).toEqual(['table-0', 'table-1', 'table-2']);
    const inserted = entries.find((entry) => !entry.original)!;
    expect(inserted.revised).toBe(revisedTables[0]);
    const moved = entries.find((entry) => entry.original === originalTables[0])!;
    expect(moved.revised).toBe(revisedTables[1]);
    expect(entries.find((entry) => entry.original === originalTables[1])?.revised).toBe(revisedTables[2]);
  });

  it('pairs empty tables on shape alone when the table counts match', () => {
    const original = bodyFromHtml('<table><tbody><tr><td></td></tr></tbody></table>');
    const revised = bodyFromHtml('<table><tbody><tr><td></td></tr></tbody></table>');

    const entries = alignDocumentTables(original, revised);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.original).toBeTruthy();
    expect(entries[0]?.revised).toBeTruthy();
  });

  it('refuses shape-only pairings once the table count has changed', () => {
    const original = bodyFromHtml(tableHtml('aaaa'));
    const revised = bodyFromHtml(tableHtml('zzzz') + tableHtml('qqqq'));

    const entries = alignDocumentTables(original, revised);

    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => !entry.original !== !entry.revised)).toBe(true);
  });

  it('falls back to positional pairing when the alignment would be too large', () => {
    const original = bodyFromHtml('<table></table>'.repeat(1001));
    const revised = bodyFromHtml('<table></table>'.repeat(1000));

    const entries = alignDocumentTables(original, revised);

    expect(entries).toHaveLength(1001);
    expect(entries[0]?.original).toBeTruthy();
    expect(entries[0]?.revised).toBeTruthy();
    expect(entries[1000]?.original).toBeTruthy();
    expect(entries[1000]?.revised).toBeUndefined();

    const swapped = alignDocumentTables(revised, original);
    expect(swapped).toHaveLength(1001);
    expect(swapped[1000]?.original).toBeUndefined();
    expect(swapped[1000]?.revised).toBeTruthy();
  });

  it('normalizes structure text and reads only direct rows and cells', () => {
    expect(normalizeStructureText('Ａ Ｂ​ C')).toBe('abc');

    const nested = bodyFromHtml(
      '<table><tbody><tr><td><table><tbody><tr><td>inner</td></tr></tbody></table></td></tr></tbody></table>'
    );
    const outerTable = nested.querySelector('table')!;
    expect(directTableRows(outerTable)).toHaveLength(1);

    const row = document.createElement('tr');
    row.append(document.createElement('td'), document.createElement('span'), document.createElement('th'));
    expect(directRowCells(row)).toHaveLength(2);
  });
});
