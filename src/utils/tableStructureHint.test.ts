import { describe, expect, it } from 'vitest';
import { resolveTableStructureHint } from './tableStructureHint';

const DEFAULT_OPTIONS = {
  ignoreSpaces: true,
  ignoreFullHalfWidth: true
};

function bodyFromHtml(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body;
}

describe('resolveTableStructureHint', () => {
  it('detects a high-confidence inserted row candidate', () => {
    const original = bodyFromHtml(
      '<table><tr><td>行A</td><td>值1</td></tr><tr><td>行C</td><td>值3</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td>行A</td><td>值1</td></tr><tr><td><ins data-diff-id="diff-1">行B</ins></td><td>值2</td></tr><tr><td>行C</td><td>值3</td></tr></table>'
    );
    const insight = resolveTableStructureHint(
      original,
      revised,
      [],
      Array.from(revised.querySelectorAll<HTMLElement>('ins')),
      DEFAULT_OPTIONS
    );

    expect(insight?.hint).toMatchObject({
      kind: 'single-row-inserted',
      confidence: 'high',
      candidateSide: 'revised',
      candidateRow: 2,
      candidatePreview: '行B | 值2'
    });
    expect(insight?.hint.rowPreviews?.revised[0]).toMatchObject({
      row: 2,
      preview: '行B | 值2',
      cellCount: 2,
      role: 'candidate'
    });
    expect(insight?.hint.rowPreviews?.original[0]).toMatchObject({
      row: 2,
      missing: true,
      role: 'missing'
    });
    expect(insight?.candidateRows[0].textContent).toContain('行B');
  });

  it('keeps the existing table paired when another table is inserted before it', () => {
    const original = bodyFromHtml(
      '<table><tr><td>行A</td><td>值1</td></tr><tr><td>行C</td><td>值3</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td>其他A</td><td>其他1</td></tr><tr><td>其他B</td><td>其他2</td></tr></table>' +
      '<table><tr><td>行A</td><td>值1</td></tr><tr><td><ins data-diff-id="diff-1">行B</ins></td><td>值2</td></tr><tr><td>行C</td><td>值3</td></tr></table>'
    );
    const insight = resolveTableStructureHint(
      original,
      revised,
      [],
      Array.from(revised.querySelectorAll<HTMLElement>('ins')),
      DEFAULT_OPTIONS
    );

    expect(insight?.hint).toMatchObject({
      kind: 'single-row-inserted',
      tableNumber: 1,
      candidateRow: 2
    });
  });

  it('does not compare an unpaired inserted table with an unrelated ordinal table', () => {
    const original = bodyFromHtml(
      '<table><tr><td>保留行</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td>保留行</td></tr><tr><td><ins data-diff-id="diff-1">新增行</ins></td></tr></table>' +
      '<table><tr><td>保留行</td></tr></table>'
    );

    expect(resolveTableStructureHint(
      original,
      revised,
      [],
      Array.from(revised.querySelectorAll<HTMLElement>('ins')),
      DEFAULT_OPTIONS
    )).toBeNull();
  });

  it('detects a high-confidence deleted row candidate', () => {
    const original = bodyFromHtml(
      '<table><tr><td>行A</td><td>值1</td></tr><tr><td><del data-diff-id="diff-1">行B</del></td><td>值2</td></tr><tr><td>行C</td><td>值3</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td>行A</td><td>值1</td></tr><tr><td>行C</td><td>值3</td></tr></table>'
    );
    const insight = resolveTableStructureHint(
      original,
      revised,
      Array.from(original.querySelectorAll<HTMLElement>('del')),
      [],
      DEFAULT_OPTIONS
    );

    expect(insight?.hint).toMatchObject({
      kind: 'single-row-deleted',
      confidence: 'high',
      candidateSide: 'original',
      candidateRow: 2,
      candidatePreview: '行B | 值2'
    });
    expect(insight?.candidateRows[0].textContent).toContain('行B');
  });

  it('does not show a generic table hint when the structure change cannot be localized', () => {
    const original = bodyFromHtml(
      '<table><tr><td>行A</td></tr><tr><td>行C</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td><ins data-diff-id="diff-1">行A修订</ins></td></tr><tr><td>行B</td></tr><tr><td>行D</td></tr></table>'
    );
    const insight = resolveTableStructureHint(
      original,
      revised,
      [],
      Array.from(revised.querySelectorAll<HTMLElement>('ins')),
      DEFAULT_OPTIONS
    );

    expect(insight).toBeNull();
  });

  it('detects adjacent row content split around the active table difference', () => {
    const original = bodyFromHtml(
      '<table><tr><td><del data-diff-id="diff-1">行标签</del></td><td>值1</td><td>值2</td><td>值3</td></tr><tr><td>汇总行</td><td>值1</td><td>值2</td><td>值3</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td></td><td>值1</td><td>值2</td><td>值3</td></tr><tr><td><ins data-diff-id="diff-1">行标签</ins></td></tr><tr><td>汇总行</td><td>值1</td><td>值2</td><td>值3</td></tr></table>'
    );
    const insight = resolveTableStructureHint(
      original,
      revised,
      Array.from(original.querySelectorAll<HTMLElement>('del')),
      Array.from(revised.querySelectorAll<HTMLElement>('ins')),
      DEFAULT_OPTIONS
    );

    expect(insight?.hint).toMatchObject({
      kind: 'row-content-shift',
      confidence: 'high',
      candidateSide: 'revised',
      candidateRow: 1,
      candidateRowEnd: 2,
      candidatePreview: '值1 | 值2 | 值3 / 行标签'
    });
    expect(insight?.hint.rowPreviews?.original[0]).toMatchObject({
      row: 1,
      preview: '行标签 | 值1 | 值2 | 值3',
      cellCount: 4,
      role: 'focus'
    });
    expect(insight?.hint.rowPreviews?.revised[0]).toMatchObject({
      row: 1,
      rowEnd: 2,
      preview: '值1 | 值2 | 值3 / 行标签',
      cellCount: 5,
      role: 'candidate'
    });
    expect(insight?.candidateRows).toHaveLength(2);
  });

  it('detects fuzzy adjacent row split when the moved label is lightly edited', () => {
    const original = bodyFromHtml(
      '<table><tr><td><del data-diff-id="diff-1">行标签汇总</del></td><td>值1</td><td>值2</td></tr><tr><td>汇总行</td><td>值1</td><td>值2</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td></td><td>值1</td><td>值2</td></tr><tr><td><ins data-diff-id="diff-1">行标签汇总调整</ins></td></tr><tr><td>汇总行</td><td>值1</td><td>值2</td></tr></table>'
    );
    const insight = resolveTableStructureHint(
      original,
      revised,
      Array.from(original.querySelectorAll<HTMLElement>('del')),
      Array.from(revised.querySelectorAll<HTMLElement>('ins')),
      DEFAULT_OPTIONS
    );

    expect(insight?.hint).toMatchObject({
      kind: 'row-content-shift',
      confidence: 'medium',
      candidateSide: 'revised',
      candidateRow: 1,
      candidateRowEnd: 2
    });
  });

  it('detects cell count mismatch in the active row even when table row counts match', () => {
    const original = bodyFromHtml(
      '<table><tr><td>字段A</td><td>字段B</td></tr><tr><td><del data-diff-id="diff-1">内容A</del></td><td>值1</td><td>值2</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td>字段A</td><td>字段B</td></tr><tr><td><ins data-diff-id="diff-1">内容A 值1 值2</ins></td></tr></table>'
    );
    const insight = resolveTableStructureHint(
      original,
      revised,
      Array.from(original.querySelectorAll<HTMLElement>('del')),
      Array.from(revised.querySelectorAll<HTMLElement>('ins')),
      DEFAULT_OPTIONS
    );

    expect(insight?.hint).toMatchObject({
      kind: 'cell-count-mismatch',
      confidence: 'high',
      candidateSide: 'revised',
      candidateRow: 2,
      originalCells: 3,
      revisedCells: 1
    });
    expect(insight?.candidateRows).toHaveLength(2);
  });

  it('does not report a table structure hint for normal same-row text edits', () => {
    const original = bodyFromHtml(
      '<table><tr><td><del data-diff-id="diff-1">内容A</del></td><td>值1</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td><ins data-diff-id="diff-1">内容B</ins></td><td>值1</td></tr></table>'
    );

    expect(resolveTableStructureHint(
      original,
      revised,
      Array.from(original.querySelectorAll<HTMLElement>('del')),
      Array.from(revised.querySelectorAll<HTMLElement>('ins')),
      DEFAULT_OPTIONS
    )).toBeNull();
  });

  it('does not show a row-inserted hint for an unrelated text diff elsewhere in the same table', () => {
    const original = bodyFromHtml(
      '<table><tr><td><del data-diff-id="diff-1">行A</del></td><td>值1</td></tr><tr><td>行C</td><td>值3</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td><ins data-diff-id="diff-1">行A调整</ins></td><td>值1</td></tr><tr><td>行B</td><td>值2</td></tr><tr><td>行C</td><td>值3</td></tr></table>'
    );

    expect(resolveTableStructureHint(
      original,
      revised,
      Array.from(original.querySelectorAll<HTMLElement>('del')),
      Array.from(revised.querySelectorAll<HTMLElement>('ins')),
      DEFAULT_OPTIONS
    )).toBeNull();
  });

  it('does not treat spacing-only table edits as structure hints when formatting diffs are visible', () => {
    const original = bodyFromHtml(
      '<table><tr><td><del data-diff-id="diff-1">内容A</del></td><td>值1</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td><ins data-diff-id="diff-1">内容 A</ins></td><td>值1</td></tr></table>'
    );

    expect(resolveTableStructureHint(
      original,
      revised,
      Array.from(original.querySelectorAll<HTMLElement>('del')),
      Array.from(revised.querySelectorAll<HTMLElement>('ins')),
      {
        ignoreSpaces: false,
        ignoreFullHalfWidth: false
      }
    )).toBeNull();
  });

  it('suppresses structure hints for same-cell table diffs when formatting toggles are off', () => {
    const original = bodyFromHtml(
      '<table><tr><td><del data-diff-id="diff-1">内容A</del></td><td>值1</td><td>值2</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td><ins data-diff-id="diff-1">内容 A 值1 值2</ins></td></tr></table>'
    );

    expect(resolveTableStructureHint(
      original,
      revised,
      Array.from(original.querySelectorAll<HTMLElement>('del')),
      Array.from(revised.querySelectorAll<HTMLElement>('ins')),
      {
        ignoreSpaces: false,
        ignoreFullHalfWidth: false
      }
    )).toBeNull();
  });

  it('does not report context for non-table differences', () => {
    const original = bodyFromHtml('<p><del data-diff-id="diff-1">a</del></p>');
    const revised = bodyFromHtml('<p><ins data-diff-id="diff-1">b</ins></p>');

    expect(resolveTableStructureHint(
      original,
      revised,
      Array.from(original.querySelectorAll<HTMLElement>('del')),
      Array.from(revised.querySelectorAll<HTMLElement>('ins')),
      DEFAULT_OPTIONS
    )).toBeNull();
  });
});
