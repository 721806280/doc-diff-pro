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

  it('uses full-width normalization but keeps case differences', async () => {
    const sameWidth = await compareDocuments('<p>１２３</p>', '<p>123</p>', DEFAULT_OPTIONS);
    const differentCase = await compareDocuments('<p>ABC</p>', '<p>abc</p>', DEFAULT_OPTIONS);

    expect(sameWidth.summary.total).toBe(0);
    expect(sameWidth.summary.similarity).toBe(1);
    expect(differentCase.summary.total).toBe(1);
  });

  it('filters converted footer text when it matches layout hints', async () => {
    const result = await compareDocuments(
      '<p>正文内容</p>',
      '<p>正文内容</p><p>示例公司保密页脚</p>',
      {
        ...DEFAULT_OPTIONS,
        filterLayoutNoise: true,
        layoutNoise: createLayoutNoiseWithHints({ exact: ['示例公司保密页脚'], fragments: [] })
      }
    );

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
    layoutNoise.revised.nativeItems = [
      { reason: 'hint', text: '修订保密页脚' }
    ];

    const result = await compareDocuments(
      '<p>正文内容</p>',
      '<p>正文内容</p>',
      {
        ...DEFAULT_OPTIONS,
        filterLayoutNoise: true,
        layoutNoise
      }
    );

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
    layoutNoise.original.nativeItems = [
      { reason: 'hint', text: '基准保密页眉' }
    ];
    layoutNoise.revised.nativeItems = [
      { reason: 'hint', text: '修订保密页脚' }
    ];

    const result = await compareDocuments(
      '<p>正文内容</p>',
      '<p>正文内容</p>',
      {
        ...DEFAULT_OPTIONS,
        layoutNoise
      }
    );

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
    const result = await compareDocuments(
      `<p>${bodyContact}</p>`,
      `<p>${bodyContact}</p>`,
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

function createLayoutNoiseWithHints(hints: LayoutNoiseHints): LayoutNoiseBySide {
  const layoutNoise = createEmptyLayoutNoiseBySide();
  layoutNoise.original.hints = hints;

  return layoutNoise;
}
