import { describe, expect, it } from 'vitest';
import { buildTextMapping, collapseWhitespace, normalizeText } from './documentText';

function bodyFromHtml(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body;
}

describe('documentText utilities', () => {
  it('collapses layout whitespace without removing ordinary English word spaces', () => {
    const track = buildTextMapping(bodyFromHtml('<p>邮箱： name@example. com</p><p>Example Corp Ltd</p>'));
    const collapsed = collapseWhitespace(track);

    expect(collapsed.text).toContain('邮箱：name@example.com');
    expect(collapsed.text).toContain('Example Corp Ltd');
  });

  it('keeps the space after a complete email so adjacent tokens stay separate', () => {
    const track = buildTextMapping(bodyFromHtml('<p>a@b.com c@d.com</p>'));
    const collapsed = collapseWhitespace(track);

    expect(collapsed.text).toContain('a@b.com c@d.com');
  });

  it('normalizes full-width characters, punctuation variants, and case', () => {
    expect(normalizeText('ＡＢＣ“Test”—１２３', true, true)).toBe('abc"test"-123');
  });
});
