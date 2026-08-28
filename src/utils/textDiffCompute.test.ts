import { describe, expect, it } from 'vitest';
import type { DiffSide, DiffTuple } from '@/types/diff';
import { DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT, summarizeDiffs } from './textDiffCore';
import { createTextDiffs, MAX_EXACT_DIFF_CHARS } from './textDiffCompute';

/**
 * One side of a comparison, built from its blocks.
 *
 * The separator is a parameter because the real pipeline produces both: a space
 * between two Latin paragraphs, and nothing at all between two CJK ones, where
 * whitespace collapsing drops it. The boundaries are what carry the structure in
 * the second case, which is the one worth testing.
 */
function sideOf(blocks: readonly string[], separator = '\n'): DiffSide {
  const boundaries: number[] = [];
  let offset = 0;

  blocks.forEach((block, index) => {
    if (index === blocks.length - 1) return;
    offset += block.length + separator.length;
    boundaries.push(offset);
  });

  return { text: blocks.join(separator), boundaries };
}

/**
 * The contract every consumer depends on: the deletions and equalities spell out
 * the original, and the insertions and equalities spell out the revision.
 * `diffMarkup` walks tuple offsets straight onto DOM text nodes through exactly
 * this correspondence, so a violation is not a worse diff — it is corrupted
 * markup.
 */
function reconstruct(diffs: readonly DiffTuple[]): { original: string; revised: string } {
  let original = '';
  let revised = '';

  for (const [operation, text] of diffs) {
    if (operation !== DIFF_INSERT) original += text;
    if (operation !== DIFF_DELETE) revised += text;
  }

  return { original, revised };
}

function expectReconstructs(original: DiffSide, revised: DiffSide, granularity: 'char' | 'word' | 'semantic'): void {
  const rebuilt = reconstruct(createTextDiffs(original, revised, granularity));

  expect(rebuilt.original).toBe(original.text);
  expect(rebuilt.revised).toBe(revised.text);
}

const PARAGRAPH = '甲方应当在合同签署后三十日内完成全部系统部署并提交验收报告';

describe('createTextDiffs contract', () => {
  it('reproduces both documents from its own output', () => {
    const cases: Array<[DiffSide, DiffSide]> = [
      [sideOf(['abc']), sideOf(['axc'])],
      [sideOf([]), sideOf([])],
      [sideOf(['']), sideOf(['x'])],
      [sideOf(['a', 'b', 'c']), sideOf(['c', 'b', 'a'])],
      [sideOf(['第一条', PARAGRAPH, '第二条']), sideOf(['第一条', `${PARAGRAPH}。`, '新增', '第二条'])],
      // Separator collapsed to nothing, which is what two CJK paragraphs give.
      [sideOf(['甲方义务', '乙方义务'], ''), sideOf(['甲方义务与责任', '乙方义务'], '')],
      // Separator collapsed to a space, which is what two Latin paragraphs give.
      [sideOf(['first clause', 'second clause'], ' '), sideOf(['first clause revised', 'second clause'], ' ')],
      [sideOf(['a'.repeat(500), 'b'.repeat(500)]), sideOf(['b'.repeat(500)])],
      // Astral characters, which must never be split across a tuple boundary.
      [sideOf(['前缀𝕏后缀']), sideOf(['前缀𝕐后缀'])],
      [sideOf(['🙂🙃', '尾段']), sideOf(['🙂🙂', '尾段'])]
    ];

    for (const [original, revised] of cases) {
      for (const granularity of ['char', 'word', 'semantic'] as const) {
        expectReconstructs(original, revised, granularity);
      }
    }
  });

  it('never ends its own shared prefix inside a surrogate pair', () => {
    // The shared ends this module strips are handed to nobody: whatever they
    // swallow, diff-match-patch never sees and can never re-match, so ending one
    // half way through an astral character would strand a lone surrogate for
    // good. Checked on the path where nothing else can move the boundary back.
    const size = MAX_EXACT_DIFF_CHARS + 100;
    const diffs = createTextDiffs(
      sideOf([`前缀🙂${'甲'.repeat(size)}`]),
      sideOf([`前缀🙃${'乙'.repeat(size)}`]),
      'char'
    );

    // Both emoji begin with the same high surrogate, so a naive scan would put
    // the shared prefix one unit too far and leave it there.
    expect(diffs[0]).toEqual([DIFF_EQUAL, '前缀']);
    expect(diffs[1]?.[1].startsWith('🙂')).toBe(true);
    expect(diffs[2]?.[1].startsWith('🙃')).toBe(true);
  });

  it('returns the same diff for the same input, every time', () => {
    const original = sideOf(
      Array.from({ length: 200 }, (_unused, index) => `第 ${index} 条 ${PARAGRAPH}`),
      ''
    );
    const revised = sideOf(
      Array.from({ length: 200 }, (_unused, index) =>
        index === 90 ? `第 ${index} 条 ${PARAGRAPH}（修订）` : `第 ${index} 条 ${PARAGRAPH}`
      ),
      ''
    );

    const first = JSON.stringify(createTextDiffs(original, revised, 'char'));
    const second = JSON.stringify(createTextDiffs(original, revised, 'char'));

    expect(first).toBe(second);
  });
});

describe('createTextDiffs on documents too large to diff whole', () => {
  /** Roughly a 400-page contract: past where a whole-document search gave up. */
  const BLOCK_COUNT = 6000;

  function contract(edits: Record<number, string> = {}): string[] {
    return Array.from({ length: BLOCK_COUNT }, (_unused, index) => edits[index] ?? `第 ${index} 条 ${PARAGRAPH}`);
  }

  it('finds exactly the planted edits and nothing else', () => {
    // The property a wall-clock budget cannot offer. `diff_main` bounds its
    // bisect by elapsed time, so on an input this size it abandons the exact
    // search and splits the remainder coarsely — reporting thousands of
    // differences where there are three, and reporting different ones on a
    // slower machine.
    const original = sideOf(contract(), '');
    const revised = sideOf(
      contract({
        1000: `第 1000 条 ${PARAGRAPH}（甲方确认）`,
        3000: `第 3000 条 ${PARAGRAPH}（乙方确认）`,
        5000: `第 5000 条 ${PARAGRAPH}（双方确认）`
      }),
      ''
    );

    const started = performance.now();
    const diffs = createTextDiffs(original, revised, 'char');
    const elapsed = performance.now() - started;

    const summary = summarizeDiffs(diffs, 'char', original.text.length, revised.text.length);
    expect(summary.total).toBe(3);
    expect(summary.inserted).toBe(3);
    expect(diffs.filter(([operation]) => operation !== DIFF_EQUAL).map(([, changed]) => changed)).toEqual([
      '（甲方确认）',
      '（乙方确认）',
      '（双方确认）'
    ]);
    expect(reconstruct(diffs).original).toBe(original.text);
    expect(reconstruct(diffs).revised).toBe(revised.text);
    // Generous, and still far under the worker's own 15 second backstop: the
    // point is that a future change reintroducing whole-document search fails
    // here rather than only in production.
    expect(elapsed).toBeLessThan(4000);
  });

  it('keeps an untouched paragraph untouched between two edited ones', () => {
    // What whole-document cleanup got wrong: `diff_cleanupSemantic` and
    // `diff_cleanupEfficiency` eliminate short equalities caught between edits,
    // so a paragraph nobody edited was reported as replaced whenever both of its
    // neighbours were.
    const original = sideOf(['第一段原文', '中间段落保持不变', '第三段原文'], '');
    const revised = sideOf(['第一段改写', '中间段落保持不变', '第三段改写'], '');

    const diffs = createTextDiffs(original, revised, 'char');
    const untouched = diffs.filter(([operation, text]) => operation === DIFF_EQUAL && text.includes('中间段落'));

    expect(untouched).toHaveLength(1);
    expect(diffs.some(([operation, text]) => operation !== DIFF_EQUAL && text.includes('中间段落'))).toBe(false);
  });

  it('adds one paragraph without disturbing the thousands below it', () => {
    const original = sideOf(contract(), '');
    const revisedBlocks = contract();
    revisedBlocks.splice(10, 0, '插入的新条款');
    const revised = sideOf(revisedBlocks, '');

    const diffs = createTextDiffs(original, revised, 'char');
    const summary = summarizeDiffs(diffs, 'char', original.text.length, revised.text.length);

    expect(summary.total).toBe(1);
    expect(summary.inserted).toBe(1);
  });
});

describe('createTextDiffs on a single oversized paragraph', () => {
  it('reports one replacement rather than searching without a bound', () => {
    // Only a converter that merged a whole section into one paragraph reaches
    // this. The cap is a size, not a deadline, so which documents reach it is a
    // property of the documents.
    const middle = MAX_EXACT_DIFF_CHARS + 1000;
    const original = sideOf([`开头${'甲'.repeat(middle)}结尾`]);
    const revised = sideOf([`开头${'乙'.repeat(middle)}结尾`]);

    const diffs = createTextDiffs(original, revised, 'char');

    expect(diffs.map(([operation]) => operation)).toEqual([DIFF_EQUAL, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL]);
    expect(reconstruct(diffs).original).toBe(original.text);
    expect(reconstruct(diffs).revised).toBe(revised.text);
  });

  it('still compares an oversized paragraph exactly when the edit inside it is small', () => {
    // Stripping the shared ends first is what makes this the common case rather
    // than the exception: a huge paragraph with one word changed leaves a middle
    // small enough to search exactly.
    const filler = '甲'.repeat(MAX_EXACT_DIFF_CHARS * 2);
    const original = sideOf([`${filler}旧${filler}`]);
    const revised = sideOf([`${filler}新${filler}`]);

    const diffs = createTextDiffs(original, revised, 'char');

    expect(diffs).toEqual([
      [DIFF_EQUAL, filler],
      [DIFF_DELETE, '旧'],
      [DIFF_INSERT, '新'],
      [DIFF_EQUAL, filler]
    ]);
  });
});
