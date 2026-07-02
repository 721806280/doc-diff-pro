import { describe, expect, it } from 'vitest';
import type { DiffTuple } from '@/types/diff';
import { buildTextMapping, collapseWhitespace } from './documentText';
import { applyDiffMarkup } from './diffMarkup';

function bodyFromHtml(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body;
}

function diff(operation: -1 | 0 | 1, text: string, groupId?: string): DiffTuple {
  const item = [operation, text] as DiffTuple;
  item.groupId = groupId;
  return item;
}

describe('applyDiffMarkup', () => {
  it('merges one diff group across inline text-node boundaries', () => {
    const dom = bodyFromHtml('<p>hello <strong>world</strong></p>');
    const mapping = buildTextMapping(dom).mapping;
    const diffs = [
      diff(0, 'hel'),
      diff(-1, 'lo wor', 'diff-1'),
      diff(0, 'ld\n')
    ];

    const html = applyDiffMarkup(dom, mapping, diffs, -1, 'del');

    expect(html).toBe(
      '<p>hel<del data-diff-id="diff-1">lo <strong>wor</strong></del><strong>ld</strong></p>'
    );
  });

  it('keeps adjacent diff groups separate within one text node', () => {
    const dom = bodyFromHtml('<p>abcdef</p>');
    const mapping = buildTextMapping(dom).mapping;
    const diffs = [
      diff(0, 'a'),
      diff(-1, 'bc', 'diff-1'),
      diff(-1, 'de', 'diff-2'),
      diff(0, 'f\n')
    ];

    const html = applyDiffMarkup(dom, mapping, diffs, -1, 'del');

    expect(html).toBe(
      '<p>a<del data-diff-id="diff-1">bc</del><del data-diff-id="diff-2">de</del>f</p>'
    );
  });

  it('merges same-group fragments separated by a short bridge', () => {
    const dom = bodyFromHtml(
      '<p><span>1.2. </span>Alpha</p>'
    );
    const mapping = collapseWhitespace(buildTextMapping(dom)).mapping;
    const diffs = [
      diff(-1, '1.2.Al', 'diff-1'),
      diff(0, 'pha\n')
    ];

    const html = applyDiffMarkup(dom, mapping, diffs, -1, 'del');

    expect(html).toBe(
      '<p><del data-diff-id="diff-1"><span>1.2. </span>Al</del>pha</p>'
    );
  });

  it('keeps same-group fragments separate when the bridge is meaningful text', () => {
    const dom = bodyFromHtml('<p>ab middle cd</p>');
    const mapping = buildTextMapping(dom).mapping;
    const diffs = [
      diff(-1, 'ab', 'diff-1'),
      diff(0, ' middle '),
      diff(-1, 'cd', 'diff-1'),
      diff(0, '\n')
    ];

    const html = applyDiffMarkup(dom, mapping, diffs, -1, 'del');

    expect(html).toBe(
      '<p><del data-diff-id="diff-1">ab</del> middle <del data-diff-id="diff-1">cd</del></p>'
    );
  });
});
