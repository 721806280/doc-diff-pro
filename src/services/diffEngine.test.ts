import { describe, expect, it } from 'vitest';
import {
  compareDocuments,
  createEmptyLayoutNoiseBySide,
  type LayoutNoiseBySide,
  type CompareOptions
} from './diffEngine';
import type { LayoutNoiseHints } from '@/utils/layoutNoise';

const DEFAULT_OPTIONS: CompareOptions = {
  granularity: 'char',
  ignoreSpaces: true,
  ignoreFullHalfWidth: true,
  filterLayoutNoise: false,
  layoutNoise: createEmptyLayoutNoiseBySide()
};

describe('compareDocuments', () => {
  // Phases hand the main thread back between them, which is also where a
  // superseded run gets to stop instead of finishing work nobody will read.
  it('stops instead of comparing when the run has already been superseded', async () => {
    const compare = new AbortController();
    compare.abort();

    await expect(
      compareDocuments('<p>abc</p>', '<p>axc</p>', { ...DEFAULT_OPTIONS, signal: compare.signal })
    ).rejects.toThrow('Comparison superseded');
  });

  it('summarizes a replacement and reports normalized similarity', async () => {
    const result = await compareDocuments('<p>abc</p>', '<p>axc</p>', DEFAULT_OPTIONS);

    expect(result.summary).toMatchObject({
      total: 1,
      inserted: 0,
      deleted: 0,
      modified: 1
    });
    expect(result.summary.similarity).toBeCloseTo(2 / 3, 5);
    expect(result.originalHtml).toContain('<del data-diff-id="diff-1">b</del>');
    expect(result.revisedHtml).toContain('<ins data-diff-id="diff-1">x</ins>');
  });

  it('preserves insertion and deletion as one-sided review differences', async () => {
    const deleted = await compareDocuments('<p>before</p>', '<p></p>', DEFAULT_OPTIONS);
    const inserted = await compareDocuments('<p></p>', '<p>after</p>', DEFAULT_OPTIONS);

    expect(deleted.summary).toMatchObject({ total: 1, deleted: 1, inserted: 0, modified: 0 });
    expect(deleted.originalHtml).toContain('<del data-diff-id="diff-1">before</del>');
    expect(deleted.revisedHtml).not.toMatch(/<(?:ins|del)\b/);
    expect(inserted.summary).toMatchObject({ total: 1, deleted: 0, inserted: 1, modified: 0 });
    expect(inserted.revisedHtml).toContain('<ins data-diff-id="diff-1">after</ins>');
    expect(inserted.originalHtml).not.toMatch(/<(?:ins|del)\b/);
  });

  it('keeps table and body changes as separate review differences', async () => {
    const result = await compareDocuments(
      '<table><tr><td>旧表</td></tr></table><p>旧文</p>',
      '<table><tr><td>新表</td></tr></table><p>新文</p>',
      DEFAULT_OPTIONS
    );

    expect(result.summary).toMatchObject({
      total: 2,
      inserted: 0,
      deleted: 0,
      modified: 2
    });

    const originalIds = [...result.originalHtml.matchAll(/<del data-diff-id="(diff-\d+)">/g)].map((match) => match[1]);
    const revisedIds = [...result.revisedHtml.matchAll(/<ins data-diff-id="(diff-\d+)">/g)].map((match) => match[1]);

    expect(originalIds).toHaveLength(2);
    expect(revisedIds).toEqual(originalIds);
    expect(new Set(originalIds).size).toBe(2);
  });

  it('pairs a label moved by a table row split while keeping new cell text separate', async () => {
    const result = await compareDocuments(
      '<table><tr><td>行标签</td><td>值A</td></tr><tr><td>说明</td></tr></table>',
      '<table><tr><td></td><td>值A</td></tr><tr><td>行标签</td></tr><tr><td>说明新增内容</td></tr></table>',
      DEFAULT_OPTIONS
    );

    expect(result.summary).toMatchObject({
      total: 2,
      inserted: 1,
      deleted: 0,
      modified: 1
    });

    const originalMovedId = result.originalHtml.match(/<del data-diff-id="(diff-\d+)">行标签<\/del>/)?.[1];
    const revisedMovedId = result.revisedHtml.match(/<ins data-diff-id="(diff-\d+)">行标签<\/ins>/)?.[1];
    const insertedId = result.revisedHtml.match(/<ins data-diff-id="(diff-\d+)">新增内容<\/ins>/)?.[1];

    expect(originalMovedId).toBe(revisedMovedId);
    expect(insertedId).not.toBe(originalMovedId);
  });

  it.each([
    ['paragraphs', '<p>甲旧</p><p>乙旧</p>', '<p>甲新</p><p>乙新</p>'],
    ['list items', '<ol><li>甲旧</li><li>乙旧</li></ol>', '<ol><li>甲新</li><li>乙新</li></ol>'],
    ['headings', '<h2>甲旧</h2><h2>乙旧</h2>', '<h2>甲新</h2><h2>乙新</h2>'],
    ['direct divs', '<div>甲旧</div><div>乙旧</div>', '<div>甲新</div><div>乙新</div>']
  ])('keeps adjacent %s as separate review differences', async (_name, original, revised) => {
    const result = await compareDocuments(original, revised, DEFAULT_OPTIONS);

    expect(result.summary).toMatchObject({
      total: 2,
      inserted: 0,
      deleted: 0,
      modified: 2
    });
  });

  it('uses table rows as review boundaries while keeping cells in one row together', async () => {
    const separateRows = await compareDocuments(
      '<table><tr><td>甲旧</td></tr><tr><td>乙旧</td></tr></table>',
      '<table><tr><td>甲新</td></tr><tr><td>乙新</td></tr></table>',
      DEFAULT_OPTIONS
    );
    const sameRow = await compareDocuments(
      '<table><tr><td>甲旧</td><td>乙旧</td></tr></table>',
      '<table><tr><td>甲新</td><td>乙新</td></tr></table>',
      DEFAULT_OPTIONS
    );

    expect(separateRows.summary.total).toBe(2);
    expect(sameRow.summary.total).toBe(1);
  });

  it('does not report textless table layout changes as differences', async () => {
    const emptyRow = await compareDocuments(
      '<table><tr><td>内容A</td></tr></table>',
      '<table><tr><td>内容A</td></tr><tr><td></td></tr></table>',
      DEFAULT_OPTIONS
    );
    const mergedCells = await compareDocuments(
      '<table><tr><td>内容A</td><td>内容B</td></tr></table>',
      '<table><tr><td colspan="2">内容A内容B</td></tr></table>',
      DEFAULT_OPTIONS
    );
    const changedRowSpan = await compareDocuments(
      '<table><tr><td rowspan="2">内容A</td><td>内容B</td></tr><tr><td>内容C</td></tr></table>',
      '<table><tr><td>内容A</td><td>内容B</td></tr><tr><td>内容C</td></tr></table>',
      DEFAULT_OPTIONS
    );

    expect(emptyRow.summary.total).toBe(0);
    expect(mergedCells.summary.total).toBe(0);
    expect(changedRowSpan.summary.total).toBe(0);
    expect(emptyRow.revisedHtml).not.toMatch(/<(?:ins|del)\b/);
    expect(mergedCells.originalHtml).not.toMatch(/<(?:ins|del)\b/);
    expect(mergedCells.revisedHtml).not.toMatch(/<(?:ins|del)\b/);
  });

  it('does not report empty block insertion as a difference', async () => {
    const emptyParagraph = await compareDocuments('<p>内容A</p>', '<p>内容A</p><p></p>', DEFAULT_OPTIONS);
    const emptyTable = await compareDocuments('<p>内容A</p>', '<p>内容A</p><table></table>', DEFAULT_OPTIONS);

    expect(emptyParagraph.summary.total).toBe(0);
    expect(emptyTable.summary.total).toBe(0);
    expect(emptyParagraph.revisedHtml).not.toMatch(/<(?:ins|del)\b/);
    expect(emptyTable.revisedHtml).not.toMatch(/<(?:ins|del)\b/);
  });

  it('suppresses broad table-grid normalization when row text is stable', async () => {
    const originalRows = Array.from(
      { length: 5 },
      (_, index) => `<tr><td colspan="2">行${index}</td><td>值${index}</td></tr>`
    ).join('');
    const revisedRows = Array.from(
      { length: 5 },
      (_, index) => `<tr><td>行${index}</td><td colspan="2">值${index}</td></tr>`
    ).join('');

    const result = await compareDocuments(
      `<table>${originalRows}</table>`,
      `<table>${revisedRows}</table>`,
      DEFAULT_OPTIONS
    );

    expect(result.summary.total).toBe(0);
    expect(result.originalHtml).not.toMatch(/<(?:ins|del)\b/);
    expect(result.revisedHtml).not.toMatch(/<(?:ins|del)\b/);
  });

  it('treats one table split into multiple tables as layout normalization', async () => {
    const result = await compareDocuments(
      '<table><tr><td>行A</td></tr><tr><td>行B</td></tr><tr><td>行C</td></tr><tr><td>行D</td></tr></table>',
      '<table><tr><td>行A</td></tr><tr><td>行B</td></tr></table><table><tr><td>行C</td></tr><tr><td>行D</td></tr></table>',
      DEFAULT_OPTIONS
    );

    expect(result.summary.total).toBe(0);
    expect(result.originalHtml).not.toMatch(/<(?:ins|del)\b/);
    expect(result.revisedHtml).not.toMatch(/<(?:ins|del)\b/);
  });

  it('keeps an existing table aligned when another table is inserted before it', async () => {
    const result = await compareDocuments(
      '<table><tr><td>内容旧</td></tr></table>',
      '<table><tr><td>新增表</td></tr></table><table><tr><td>内容新</td></tr></table>',
      DEFAULT_OPTIONS
    );

    expect(result.summary).toMatchObject({
      total: 2,
      inserted: 1,
      deleted: 0,
      modified: 1
    });
    expect([...result.revisedHtml.matchAll(/data-diff-id="(diff-\d+)"/g)].map((match) => match[1])).toEqual([
      'diff-1',
      'diff-2'
    ]);
  });

  it('uses full-width normalization but keeps case differences', async () => {
    const sameWidth = await compareDocuments('<p>１２３</p>', '<p>123</p>', DEFAULT_OPTIONS);
    const differentCase = await compareDocuments('<p>ABC</p>', '<p>abc</p>', DEFAULT_OPTIONS);

    expect(sameWidth.summary.total).toBe(0);
    expect(sameWidth.summary.similarity).toBe(1);
    expect(differentCase.summary.total).toBe(1);
  });

  it('filters converted footer text when it matches layout hints', async () => {
    const result = await compareDocuments('<p>正文内容</p>', '<p>正文内容</p><p>示例公司保密页脚</p>', {
      ...DEFAULT_OPTIONS,
      filterLayoutNoise: true,
      layoutNoise: createLayoutNoiseWithHints({ exact: ['示例公司保密页脚'], fragments: [] })
    });

    expect(result.summary.total).toBe(0);
    expect(result.summary.layoutNoiseFiltered).toBe(1);
    expect(result.summary.layoutNoiseItems).toEqual([
      {
        side: 'revised',
        reason: 'hint',
        source: 'body',
        text: '示例公司保密页脚',
        count: 1
      }
    ]);
    expect(result.revisedHtml).not.toContain('公司保密页脚');
  });

  it('retains native header and footer hints from both documents in filter details', async () => {
    const layoutNoise = createEmptyLayoutNoiseBySide();
    layoutNoise.original.nativeItems = [
      { reason: 'hint', text: '基准保密页眉' },
      { reason: 'hint', text: '基准保密页眉' },
      { reason: 'hint', text: '第 1 页' }
    ];
    layoutNoise.revised.nativeItems = [{ reason: 'hint', text: '修订保密页脚' }];

    const result = await compareDocuments('<p>正文内容</p>', '<p>正文内容</p>', {
      ...DEFAULT_OPTIONS,
      filterLayoutNoise: true,
      layoutNoise
    });

    expect(result.summary.total).toBe(0);
    expect(result.summary.layoutNoiseFiltered).toBe(4);
    expect(result.summary.layoutNoiseItems).toEqual([
      { side: 'original', reason: 'hint', source: 'native', text: '基准保密页眉', count: 2 },
      { side: 'original', reason: 'hint', source: 'native', text: '第 1 页', count: 1 },
      { side: 'revised', reason: 'hint', source: 'native', text: '修订保密页脚', count: 1 }
    ]);
  });

  it('keeps native header and footer details in the summary when layout filtering is disabled', async () => {
    const layoutNoise = createEmptyLayoutNoiseBySide();
    layoutNoise.original.nativeItems = [{ reason: 'hint', text: '基准保密页眉' }];
    layoutNoise.revised.nativeItems = [{ reason: 'hint', text: '修订保密页脚' }];

    const result = await compareDocuments('<p>正文内容</p>', '<p>正文内容</p>', {
      ...DEFAULT_OPTIONS,
      layoutNoise
    });

    expect(result.summary.total).toBe(0);
    expect(result.summary.layoutNoiseFiltered).toBe(2);
    expect(result.summary.layoutNoiseItems).toEqual([
      { side: 'original', reason: 'hint', source: 'native', text: '基准保密页眉', count: 1 },
      { side: 'revised', reason: 'hint', source: 'native', text: '修订保密页脚', count: 1 }
    ]);
  });

  it('filters converted footer lines by stable hint fragments', async () => {
    const result = await compareDocuments(
      '<p>正文内容</p>',
      '<p>正文内容</p><p>第4/5页示例联系人:张三；联系电话:13800000000；邮箱:review@examp1e.com</p>',
      {
        ...DEFAULT_OPTIONS,
        filterLayoutNoise: true,
        layoutNoise: createLayoutNoiseWithHints({
          exact: ['第3/5页示例联系人：张三；联系电话：13800000000；邮箱：review@example.com'],
          fragments: ['示例联系人：张三', '联系电话：13800000000', '邮箱：review@example.com']
        })
      }
    );

    expect(result.summary.total).toBe(0);
    expect(result.summary.layoutNoiseFiltered).toBe(1);
    expect(result.summary.layoutNoiseItems[0]).toMatchObject({
      side: 'revised',
      reason: 'hint',
      source: 'body'
    });
  });

  it('keeps body contact lines that only share footer fragments', async () => {
    const bodyContact = '供应商:示例科技有限公司地址:示例市示例路1号联系人:张三邮箱:review@example.com电话:13800000000';
    const result = await compareDocuments(`<p>${bodyContact}</p>`, `<p>${bodyContact}</p>`, {
      ...DEFAULT_OPTIONS,
      filterLayoutNoise: true,
      layoutNoise: createLayoutNoiseWithHints({
        exact: ['第3/5页示例联系人：张三；联系电话：13800000000；邮箱：review@example.com'],
        fragments: ['示例联系人：张三', '联系电话：13800000000', '邮箱：review@example.com']
      })
    });

    expect(result.summary.total).toBe(0);
    expect(result.summary.layoutNoiseFiltered).toBe(0);
    expect(result.originalHtml).toContain('示例科技有限公司');
  });

  it('does not filter converted footer lines when layout filtering is disabled', async () => {
    const result = await compareDocuments(
      '<p>正文内容</p>',
      '<p>正文内容</p><p>第4/5页示例联系人:张三；联系电话:13800000000；邮箱:review@examp1e.com</p>',
      {
        ...DEFAULT_OPTIONS,
        layoutNoise: createLayoutNoiseWithHints({
          exact: ['第3/5页示例联系人：张三；联系电话：13800000000；邮箱：review@example.com'],
          fragments: ['示例联系人：张三', '联系电话：13800000000', '邮箱：review@example.com']
        })
      }
    );

    expect(result.summary.total).toBe(1);
    expect(result.summary.layoutNoiseFiltered).toBe(0);
  });

  it('filters repeated layout text when layout filtering is enabled', async () => {
    const result = await compareDocuments(
      '<p>第一段</p><p>第二段</p>',
      '<p>第一段</p><p>内部资料</p><p>第二段</p><p>内部资料</p>',
      {
        ...DEFAULT_OPTIONS,
        filterLayoutNoise: true
      }
    );

    expect(result.summary.total).toBe(0);
    expect(result.summary.layoutNoiseFiltered).toBe(2);
    expect(result.summary.layoutNoiseItems).toEqual([
      { side: 'revised', reason: 'repeated-layout-text', source: 'body', text: '内部资料', count: 2 }
    ]);
  });
});

/**
 * Images reach the comparison as fingerprints because the markup only carries
 * object URLs by then. These check that they come out the far end as ordinary
 * differences — numbered, scoped and counted alongside the text ones.
 */
describe('compareDocuments with image fingerprints', () => {
  const figure = (source: string) => `<p><img src="${source}" alt="figure"></p>`;

  function descriptors(original: Record<string, string>, revised: Record<string, string>): CompareOptions['images'] {
    const table = (entries: Record<string, string>) =>
      new Map(Object.entries(entries).map(([src, hash]) => [src, { hash, width: 400, height: 300, byteLength: 2048 }]));

    return { original: table(original), revised: table(revised) };
  }

  it('reports nothing for an image whose bytes did not change', async () => {
    // Different object URLs on the two sides, as always: only the fingerprint
    // can say it is the same image.
    const result = await compareDocuments(figure('blob:a'), figure('blob:b'), {
      ...DEFAULT_OPTIONS,
      images: descriptors({ 'blob:a': 'same' }, { 'blob:b': 'same' })
    });

    expect(result.summary.total).toBe(0);
    expect(result.summary.images).toMatchObject({ paired: 1, revised: 0 });
  });

  it('reports a replaced figure as one difference on both sides', async () => {
    const result = await compareDocuments(figure('blob:a'), figure('blob:b'), {
      ...DEFAULT_OPTIONS,
      images: descriptors({ 'blob:a': 'before' }, { 'blob:b': 'after' }),
      imageLabel: '图片'
    });

    expect(result.summary).toMatchObject({ total: 1, modified: 1 });
    expect(result.summary.images).toMatchObject({ paired: 1, revised: 1 });
    // Renumbered into the text diff's own sequence, which is what lets the
    // reader step through both kinds of difference without knowing the
    // difference.
    expect(result.originalHtml).toContain('<del data-diff-id="diff-1" data-diff-image="图片 400×300">');
    expect(result.revisedHtml).toContain('<ins data-diff-id="diff-1" data-diff-image="图片 400×300">');
  });

  it('reports an added figure on the revised side alone', async () => {
    const result = await compareDocuments(figure('blob:a'), figure('blob:a2') + figure('blob:new'), {
      ...DEFAULT_OPTIONS,
      images: descriptors({ 'blob:a': 'kept' }, { 'blob:a2': 'kept', 'blob:new': 'added' })
    });

    expect(result.summary).toMatchObject({ total: 1, inserted: 1 });
    expect(result.summary.images).toMatchObject({ inserted: 1, revised: 0 });
    expect(result.originalHtml).not.toContain('<del');
  });

  it('numbers an image difference in document order among the text ones', async () => {
    const result = await compareDocuments(
      `<p>前言甲</p>${figure('blob:a')}<p>结语</p>`,
      `<p>前言乙</p>${figure('blob:b')}<p>结语</p>`,
      { ...DEFAULT_OPTIONS, images: descriptors({ 'blob:a': 'before' }, { 'blob:b': 'after' }) }
    );

    expect(result.summary.total).toBe(2);
    expect(result.originalHtml.indexOf('diff-1')).toBeLessThan(result.originalHtml.indexOf('diff-2'));
    expect(result.originalHtml).toContain('data-diff-id="diff-2" data-diff-image');
  });

  it('keeps a figure difference out of an adjacent text difference', async () => {
    // The merge pass bridges nearby edits across short gaps. An image
    // contributes no characters, so without `img` blocking the bridge the two
    // edits either side of this figure would swallow it into one difference.
    const result = await compareDocuments(`<p>甲${figure('blob:a')}乙</p>`, `<p>丙${figure('blob:b')}丁</p>`, {
      ...DEFAULT_OPTIONS,
      images: descriptors({ 'blob:a': 'before' }, { 'blob:b': 'after' })
    });

    expect(result.summary.images).toMatchObject({ revised: 1 });
    expect(result.originalHtml).toContain('data-diff-image');
  });

  it('leaves images alone when no fingerprints were taken', async () => {
    const result = await compareDocuments(figure('blob:a'), figure('blob:b'), DEFAULT_OPTIONS);

    expect(result.summary.total).toBe(0);
    expect(result.summary.images).toMatchObject({ paired: 0, revised: 0 });
  });
});

function createLayoutNoiseWithHints(hints: LayoutNoiseHints): LayoutNoiseBySide {
  const layoutNoise = createEmptyLayoutNoiseBySide();
  layoutNoise.original.hints = hints;

  return layoutNoise;
}
