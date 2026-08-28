import { describe, expect, it } from 'vitest';
import { alignLines, type LineAlignmentEntry } from './lineAlignment';

/** The alignment as a readable script, so failures name what moved. */
function script(original: readonly string[], revised: readonly string[]): string[] {
  return alignLines(original, revised).map((entry) => describeEntry(entry, original, revised));
}

function describeEntry(entry: LineAlignmentEntry, original: readonly string[], revised: readonly string[]): string {
  if (entry.original !== undefined && entry.revised !== undefined) {
    const left = original[entry.original] ?? '';
    const right = revised[entry.revised] ?? '';
    return left === right ? `= ${left}` : `~ ${left} -> ${right}`;
  }
  if (entry.original !== undefined) return `- ${original[entry.original] ?? ''}`;
  return `+ ${revised[entry.revised ?? 0] ?? ''}`;
}

/**
 * Every line of each side has to appear exactly once, in order. The diff built on
 * top of this alignment reconstructs both documents from it, so a dropped or
 * duplicated index is not a worse alignment — it is corrupted output.
 */
function expectTotalCoverage(original: readonly string[], revised: readonly string[]): void {
  const entries = alignLines(original, revised);
  const originalSeen = entries.flatMap((entry) => (entry.original === undefined ? [] : [entry.original]));
  const revisedSeen = entries.flatMap((entry) => (entry.revised === undefined ? [] : [entry.revised]));

  expect(originalSeen).toEqual([...originalSeen].sort((left, right) => left - right));
  expect(revisedSeen).toEqual([...revisedSeen].sort((left, right) => left - right));
  expect(originalSeen).toEqual(original.map((_line, index) => index));
  expect(revisedSeen).toEqual(revised.map((_line, index) => index));
}

describe('alignLines', () => {
  it('pairs two identical documents line for line', () => {
    const lines = ['第一条', '甲方应当交付', '第二条', '乙方应当付款'];

    expect(script(lines, lines)).toEqual(['= 第一条', '= 甲方应当交付', '= 第二条', '= 乙方应当付款']);
  });

  it('handles either side being empty', () => {
    expect(script(['甲'], [])).toEqual(['- 甲']);
    expect(script([], ['乙'])).toEqual(['+ 乙']);
    expect(script([], [])).toEqual([]);
  });

  it('reports an inserted paragraph without disturbing the ones around it', () => {
    const original = ['第一条', '甲方应当交付', '第二条'];
    const revised = ['第一条', '甲方应当交付', '新增一句', '第二条'];

    expect(script(original, revised)).toEqual(['= 第一条', '= 甲方应当交付', '+ 新增一句', '= 第二条']);
  });

  it('recognizes a reworded paragraph as the same paragraph', () => {
    const original = ['第一条', '甲方应当在三十日内交付全部成果', '第二条'];
    const revised = ['第一条', '甲方应当在四十五日内交付全部成果', '第二条'];

    expect(script(original, revised)).toEqual([
      '= 第一条',
      '~ 甲方应当在三十日内交付全部成果 -> 甲方应当在四十五日内交付全部成果',
      '= 第二条'
    ]);
  });

  it('pairs a sole candidate outright, however little the two still share', () => {
    // With everything around them matched there is no ambiguity for a threshold
    // to resolve: one paragraph became the other, and showing what changed inside
    // it beats reporting a removal beside an addition.
    const original = ['第一条', '甲方应当在三十日内交付全部成果'];
    const revised = ['第一条', '本协议自双方签字之日起生效并适用中国法律'];

    expect(script(original, revised)).toEqual([
      '= 第一条',
      '~ 甲方应当在三十日内交付全部成果 -> 本协议自双方签字之日起生效并适用中国法律'
    ]);
  });

  it('refuses to pair unrelated paragraphs once there is a choice between them', () => {
    // Two on each side, so the threshold has a job to do again.
    const original = ['甲方应当在三十日内交付全部成果', '乙方应当在验收后开具发票'];
    const revised = ['附件一 服务级别协议', '联系人张三电话13800000000'];

    const result = script(original, revised);
    expect(result.filter((line) => line.startsWith('~'))).toHaveLength(0);
    expect(result.filter((line) => line.startsWith('-'))).toHaveLength(2);
    expect(result.filter((line) => line.startsWith('+'))).toHaveLength(2);
  });

  it('does not let an insertion near the top cascade through the document', () => {
    // What pairing by position would produce: insert one line and every line
    // below it reads as rewritten.
    const original = Array.from({ length: 40 }, (_unused, index) => `条款 ${index} 的正文内容`);
    const revised = ['插入的前言', ...original];

    const result = script(original, revised);
    expect(result[0]).toBe('+ 插入的前言');
    expect(result.filter((line) => line.startsWith('='))).toHaveLength(40);
  });

  it('anchors on distinctive lines rather than on repeated boilerplate', () => {
    // The blank and the repeated separator carry no identity; the headings do.
    const original = ['—', '第一章 总则', '—', '甲方义务', '—', '第二章 附则', '—'];
    const revised = ['—', '第一章 总则', '—', '甲方义务与责任', '—', '新增章节', '—', '第二章 附则', '—'];

    const result = script(original, revised);
    expect(result).toContain('= 第一章 总则');
    expect(result).toContain('= 第二章 附则');
    expect(result).toContain('~ 甲方义务 -> 甲方义务与责任');
    expectTotalCoverage(original, revised);
  });

  it('keeps every line of both sides exactly once, in order', () => {
    const cases: Array<[string[], string[]]> = [
      [
        ['a', 'b', 'c'],
        ['c', 'b', 'a']
      ],
      [
        ['a', 'a', 'a'],
        ['a', 'a']
      ],
      [
        ['', '', 'x', ''],
        ['', 'x', '', '']
      ],
      [
        ['甲', '乙', '丙', '丁'],
        ['乙', '戊', '丁']
      ],
      [
        Array.from({ length: 30 }, (_u, index) => `line ${index % 3}`),
        Array.from({ length: 25 }, (_u, index) => `line ${index % 4}`)
      ]
    ];

    for (const [original, revised] of cases) {
      expectTotalCoverage(original, revised);
    }
  });

  it('is order preserving, so a swapped pair is a removal and an addition', () => {
    // Two lines that traded places cannot both be paired without crossing, and
    // crossing is what would let a moved paragraph corrupt everything after it.
    const result = script(['甲方条款', '乙方条款'], ['乙方条款', '甲方条款']);

    expect(result.filter((line) => line.startsWith('='))).toHaveLength(1);
    expect(result.filter((line) => line.startsWith('-'))).toHaveLength(1);
    expect(result.filter((line) => line.startsWith('+'))).toHaveLength(1);
  });

  it('aligns a document of thousands of lines with a handful of edits', () => {
    // The size at which a whole-document character diff gives up. Anchoring makes
    // it a few short gaps instead.
    const original = Array.from({ length: 4000 }, (_unused, index) => `第 ${index} 条 关于交付与验收的约定`);
    const revised = original.map((line, index) => (index === 2000 ? `${line}（修订）` : line));
    revised.splice(500, 0, '插入的新条款');
    revised.splice(3000, 1);

    const entries = alignLines(original, revised);
    const changed = entries.filter((entry) => {
      if (entry.original === undefined || entry.revised === undefined) return true;
      return original[entry.original] !== revised[entry.revised];
    });

    expect(changed).toHaveLength(3);
    expectTotalCoverage(original, revised);
  });

  it('still covers both sides when no line anchors anything', () => {
    // Every line repeats, so there is nothing unambiguous to anchor on and the
    // whole range falls through to the similarity pass.
    const original = Array.from({ length: 12 }, () => 'x');
    const revised = Array.from({ length: 9 }, () => 'x');

    expectTotalCoverage(original, revised);
  });

  it('falls back to position when one unanchored stretch is too wide to weigh', () => {
    // Past the matrix ceiling the alignment pairs off in order rather than
    // allocating for it. Reached only by a document with no distinctive line in
    // it at all, and it still has to account for every line.
    const original = Array.from({ length: 220 }, () => 'x');
    const revised = Array.from({ length: 200 }, () => 'x');

    expectTotalCoverage(original, revised);
  });
});
