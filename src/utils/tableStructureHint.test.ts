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
      '<table><tr><td>第一年</td><td>100</td></tr><tr><td>第三年</td><td>300</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td>第一年</td><td>100</td></tr><tr><td><ins data-diff-id="diff-1">第二年</ins></td><td>200</td></tr><tr><td>第三年</td><td>300</td></tr></table>'
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
      candidatePreview: '第二年 | 200'
    });
    expect(insight?.hint.rowPreviews?.revised[0]).toMatchObject({
      row: 2,
      preview: '第二年 | 200',
      cellCount: 2,
      role: 'candidate'
    });
    expect(insight?.hint.rowPreviews?.original[0]).toMatchObject({
      row: 2,
      missing: true,
      role: 'missing'
    });
    expect(insight?.candidateRows[0].textContent).toContain('第二年');
  });

  it('detects a high-confidence deleted row candidate', () => {
    const original = bodyFromHtml(
      '<table><tr><td>第一年</td><td>100</td></tr><tr><td><del data-diff-id="diff-1">第二年</del></td><td>200</td></tr><tr><td>第三年</td><td>300</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td>第一年</td><td>100</td></tr><tr><td>第三年</td><td>300</td></tr></table>'
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
      candidatePreview: '第二年 | 200'
    });
    expect(insight?.candidateRows[0].textContent).toContain('第二年');
  });

  it('does not show a generic table hint when the structure change cannot be localized', () => {
    const original = bodyFromHtml(
      '<table><tr><td>第一年</td></tr><tr><td>第三年</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td><ins data-diff-id="diff-1">第一年修订</ins></td></tr><tr><td>第二年</td></tr><tr><td>第四年</td></tr></table>'
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
      '<table><tr><td><del data-diff-id="diff-1">第一年</del></td><td>169,811.32</td><td>10,188.68</td><td>180,000.00</td></tr><tr><td>总计</td><td>169,811.32</td><td>10,188.68</td><td>180,000.00</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td></td><td>169,811.32</td><td>10,188.68</td><td>180,000.00</td></tr><tr><td><ins data-diff-id="diff-1">第一年</ins></td></tr><tr><td>总计</td><td>169,811.32</td><td>10,188.68</td><td>180,000.00</td></tr></table>'
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
      candidatePreview: '169,811.32 | 10,188.68 | 180,000.00 / 第一年'
    });
    expect(insight?.hint.rowPreviews?.original[0]).toMatchObject({
      row: 1,
      preview: '第一年 | 169,811.32 | 10,188.68 | 180,000.00',
      cellCount: 4,
      role: 'focus'
    });
    expect(insight?.hint.rowPreviews?.revised[0]).toMatchObject({
      row: 1,
      rowEnd: 2,
      preview: '169,811.32 | 10,188.68 | 180,000.00 / 第一年',
      cellCount: 5,
      role: 'candidate'
    });
    expect(insight?.candidateRows).toHaveLength(2);
  });

  it('detects fuzzy adjacent row split when the moved label is lightly edited', () => {
    const original = bodyFromHtml(
      '<table><tr><td><del data-diff-id="diff-1">第一年合计</del></td><td>100</td><td>200</td></tr><tr><td>总计</td><td>100</td><td>200</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td></td><td>100</td><td>200</td></tr><tr><td><ins data-diff-id="diff-1">第一年合计调整</ins></td></tr><tr><td>总计</td><td>100</td><td>200</td></tr></table>'
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
      '<table><tr><td>产品</td><td>金额</td></tr><tr><td><del data-diff-id="diff-1">服务A</del></td><td>100</td><td>200</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td>产品</td><td>金额</td></tr><tr><td><ins data-diff-id="diff-1">服务A 100 200</ins></td></tr></table>'
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
      '<table><tr><td><del data-diff-id="diff-1">服务A</del></td><td>100</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td><ins data-diff-id="diff-1">服务B</ins></td><td>100</td></tr></table>'
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
      '<table><tr><td><del data-diff-id="diff-1">第一年</del></td><td>100</td></tr><tr><td>第三年</td><td>300</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td><ins data-diff-id="diff-1">第一年调整</ins></td><td>100</td></tr><tr><td>第二年</td><td>200</td></tr><tr><td>第三年</td><td>300</td></tr></table>'
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
      '<table><tr><td><del data-diff-id="diff-1">服务A</del></td><td>100</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td><ins data-diff-id="diff-1">服务 A</ins></td><td>100</td></tr></table>'
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
      '<table><tr><td><del data-diff-id="diff-1">服务A</del></td><td>100</td><td>200</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td><ins data-diff-id="diff-1">服务 A 100 200</ins></td></tr></table>'
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
