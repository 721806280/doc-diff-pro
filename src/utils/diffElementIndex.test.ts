import { describe, expect, it } from 'vitest';
import { buildDiffElementIndex } from './diffElementIndex';

function elementFromHtml(html: string): HTMLElement {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element;
}

describe('buildDiffElementIndex', () => {
  it('groups all diff fragments by id and pane', () => {
    const paneA = elementFromHtml(
      '<del data-diff-id="diff-1">a</del><strong><del data-diff-id="diff-1">b</del></strong>'
    );
    const paneB = elementFromHtml(
      '<ins data-diff-id="diff-1">c</ins><ins data-diff-id="diff-2">d</ins>'
    );

    const index = buildDiffElementIndex(paneA, paneB);

    expect(index.get('diff-1')?.A).toHaveLength(2);
    expect(index.get('diff-1')?.B).toHaveLength(1);
    expect(index.get('diff-2')?.A).toHaveLength(0);
    expect(index.get('diff-2')?.B[0]!.textContent).toBe('d');
  });

  it('ignores empty ids and unrelated elements', () => {
    const paneA = elementFromHtml(
      '<del data-diff-id="">empty</del><span data-diff-id="diff-1">not a diff</span>'
    );

    expect(buildDiffElementIndex(paneA, null).size).toBe(0);
  });
});
