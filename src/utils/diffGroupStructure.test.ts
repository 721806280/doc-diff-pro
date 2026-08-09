import { describe, expect, it } from 'vitest';
import { refineDiffGroups } from './diffGroupStructure';
import { alignDocumentTables, type TableAlignmentEntry } from './tableAlignment';

function bodyFromHtml(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body;
}

describe('diffGroupStructure', () => {
  it('splits one text group at the table/body boundary', () => {
    const original = bodyFromHtml(
      '<table><tr><td><del data-diff-id="diff-1">旧表</del></td></tr></table><p><del data-diff-id="diff-1">旧文</del></p>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td><ins data-diff-id="diff-1">新表</ins></td></tr></table><p><ins data-diff-id="diff-1">新文</ins></p>'
    );

    const summary = refineDiffGroups(original, revised);
    const tableOriginalId = original.querySelector('table [data-diff-id]')?.getAttribute('data-diff-id');
    const bodyOriginalId = original.querySelector('p [data-diff-id]')?.getAttribute('data-diff-id');
    const tableRevisedId = revised.querySelector('table [data-diff-id]')?.getAttribute('data-diff-id');
    const bodyRevisedId = revised.querySelector('p [data-diff-id]')?.getAttribute('data-diff-id');

    expect(summary).toEqual({ total: 2, inserted: 0, deleted: 0, modified: 2 });
    expect(tableOriginalId).toBe(tableRevisedId);
    expect(bodyOriginalId).toBe(bodyRevisedId);
    expect(tableOriginalId).not.toBe(bodyOriginalId);
  });

  it('keeps body regions before and after a table separate', () => {
    const original = bodyFromHtml(
      '<p><del data-diff-id="diff-1">前</del></p><table><tr><td><del data-diff-id="diff-1">表</del></td></tr></table><p><del data-diff-id="diff-1">后</del></p>'
    );
    const revised = bodyFromHtml(
      '<p><ins data-diff-id="diff-1">前</ins></p><table><tr><td><ins data-diff-id="diff-1">表</ins></td></tr></table><p><ins data-diff-id="diff-1">后</ins></p>'
    );

    const summary = refineDiffGroups(original, revised);
    const ids = Array.from(original.querySelectorAll<HTMLElement>('[data-diff-id]')).map(
      (element) => element.dataset.diffId
    );

    expect(summary.total).toBe(3);
    expect(new Set(ids).size).toBe(3);
  });

  it('pairs identical text moved within the same table without absorbing other insertions', () => {
    const original = bodyFromHtml(
      '<table><tr><td><del data-diff-id="diff-1">行标签</del></td><td>值A</td></tr><tr><td>说明</td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td></td><td>值A</td></tr><tr><td><ins data-diff-id="diff-2">行标签</ins></td></tr><tr><td>说明<ins data-diff-id="diff-3">新增内容</ins></td></tr></table>'
    );

    const summary = refineDiffGroups(original, revised);
    const originalMovedId = original.querySelector<HTMLElement>('del')?.dataset.diffId;
    const revisedMovedId = revised.querySelector<HTMLElement>('tr:nth-child(2) ins')?.dataset.diffId;
    const insertedId = revised.querySelector<HTMLElement>('tr:nth-child(3) ins')?.dataset.diffId;

    expect(summary).toEqual({ total: 2, inserted: 1, deleted: 0, modified: 1 });
    expect(originalMovedId).toBe(revisedMovedId);
    expect(insertedId).not.toBe(originalMovedId);
  });

  it('keeps a normal edit paired when a preceding table row shifts its index', () => {
    const original = bodyFromHtml('<table><tr><td><del data-diff-id="diff-1">旧</del></td></tr></table>');
    const revised = bodyFromHtml(
      '<table><tr><td>新增行</td></tr><tr><td><ins data-diff-id="diff-1">新</ins></td></tr></table>'
    );

    const summary = refineDiffGroups(original, revised);

    expect(summary).toEqual({ total: 1, inserted: 0, deleted: 0, modified: 1 });
    expect(original.querySelector<HTMLElement>('del')?.dataset.diffId).toBe(
      revised.querySelector<HTMLElement>('ins')?.dataset.diffId
    );
  });

  it('repairs a cross-row match without restoring ignored spaces', () => {
    const original = bodyFromHtml('<table><tr><td>期限</td><td>10 个工作日</td></tr></table>');
    const revised = bodyFromHtml(
      '<table><tr><td>期限</td><td><ins data-diff-id="diff-1">7个工作日</ins></td></tr></table>'
    );

    refineDiffGroups(original, revised, {
      granularity: 'char',
      ignoreSpaces: true,
      ignoreFullHalfWidth: true
    });

    expect(original.querySelector('del')?.textContent).toBe('10');
    expect(revised.querySelector('ins')?.textContent).toBe('7');
  });

  it('keeps separate changes precise when repairing a short cell', () => {
    const original = bodyFromHtml('<table><tr><td>字段</td><td>A旧中旧Z</td></tr></table>');
    const revised = bodyFromHtml(
      '<table><tr><td>字段</td><td><ins data-diff-id="diff-1">A新中新Z</ins></td></tr></table>'
    );

    refineDiffGroups(original, revised);

    expect(Array.from(original.querySelectorAll('del')).map((node) => node.textContent)).toEqual(['旧', '旧']);
    expect(Array.from(revised.querySelectorAll('ins')).map((node) => node.textContent)).toEqual(['新', '新']);
  });

  it('does not pair ambiguous repeated table text moves', () => {
    const original = bodyFromHtml(
      '<table><tr><td><del data-diff-id="diff-1">重复值</del></td></tr><tr><td><del data-diff-id="diff-2">重复值</del></td></tr></table>'
    );
    const revised = bodyFromHtml(
      '<table><tr><td><ins data-diff-id="diff-3">重复值</ins></td></tr><tr><td><ins data-diff-id="diff-4">重复值</ins></td></tr></table>'
    );

    const summary = refineDiffGroups(original, revised);

    expect(summary).toEqual({ total: 4, inserted: 2, deleted: 2, modified: 0 });
  });

  it('does not pair a repeated table text move when only one side is unique', () => {
    const original = bodyFromHtml(
      '<table><tr><td><del data-diff-id="diff-1">重复值</del></td></tr><tr><td><del data-diff-id="diff-2">重复值</del></td></tr></table>'
    );
    const revised = bodyFromHtml('<table><tr><td><ins data-diff-id="diff-3">重复值</ins></td></tr></table>');

    expect(refineDiffGroups(original, revised)).toEqual({ total: 3, inserted: 1, deleted: 2, modified: 0 });
  });

  it('does not align unrelated same-shape tables when the table count changes', () => {
    const original = bodyFromHtml('<table><tr><td>甲甲</td></tr></table>');
    const revised = bodyFromHtml('<table><tr><td>乙乙</td></tr></table><table><tr><td>丙丙</td></tr></table>');

    expect(
      alignDocumentTables(original, revised).some((entry: TableAlignmentEntry) => entry.original && entry.revised)
    ).toBe(false);
  });

  it('refines a large block document without repeated full-tree scans', () => {
    const original = bodyFromHtml(
      Array.from({ length: 1000 }, (_, index) => `<p><del data-diff-id="diff-${index + 1}">旧${index}</del></p>`).join(
        ''
      )
    );
    const revised = bodyFromHtml(
      Array.from({ length: 1000 }, (_, index) => `<p><ins data-diff-id="diff-${index + 1}">新${index}</ins></p>`).join(
        ''
      )
    );

    expect(refineDiffGroups(original, revised).total).toBe(1000);
  }, 2000);
});
