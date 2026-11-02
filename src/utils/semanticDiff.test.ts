import { describe, expect, it } from 'vitest';
import { buildTextMapping, collapseWhitespace } from './documentText';
import { DEFAULT_SEMANTIC_LABELS, enrichSemanticDiffs } from './semanticDiff';
import { createTextDiffs } from './textDiffCompute';

function track(html: string) {
  return collapseWhitespace(buildTextMapping(new DOMParser().parseFromString(html, 'text/html').body));
}

describe('semantic text differences', () => {
  it('preserves the raw text alignment and annotates both destinations', () => {
    const original = track('<p>付款：<a href="https://old.example"><b>入</b>口</a>。</p>');
    const revised = track('<p>付款：<a href="https://new.example">入口</a>。</p>');
    const raw = createTextDiffs(original, revised, 'char');
    const before = structuredClone(raw);
    const diffs = enrichSemanticDiffs(raw, original.mapping, revised.mapping);
    expect(raw).toEqual(before);
    expect(diffs.map((diff) => ({ operation: diff[0], text: diff[1], label: diff.semanticLabel }))).toEqual([
      { operation: 0, text: '付款：', label: undefined },
      { operation: -1, text: '入口', label: 'Link: https://old.example' },
      { operation: 1, text: '入口', label: 'Link: https://new.example' },
      { operation: 0, text: '。', label: undefined }
    ]);
  });

  it('reports link removal and script changes together on equal text', () => {
    const original = track('<p><a href="#definition"><sup>值</sup></a></p>');
    const revised = track('<p><sub>值</sub></p>');
    const diffs = enrichSemanticDiffs([[0, '值']], original.mapping, revised.mapping, {
      ...DEFAULT_SEMANTIC_LABELS,
      hyperlink: '链接',
      noHyperlink: '无链接',
      superscript: '上标',
      subscript: '下标'
    });
    expect(diffs[0]?.semanticLabel).toBe('链接: #definition; 上标');
    expect(diffs[1]?.semanticLabel).toBe('链接: 无链接; 下标');
  });

  it('leaves formatting and text edits to the existing text comparison', () => {
    const original = track('<p><strong>old</strong></p>');
    const revised = track('<p><em>new</em></p>');
    const raw = createTextDiffs(original, revised, 'char');
    expect(enrichSemanticDiffs(raw, original.mapping, revised.mapping)).toEqual(raw);
  });
});
