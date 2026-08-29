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

  it('normalizes single-quote and low-quote variants to their ASCII forms', () => {
    expect(normalizeText('‚x‛ ‘y’ „z‟', true, false)).toBe(`'x' 'y' "z"`);
    expect(normalizeText('‚x‛', false, false)).toBe('‚x‛');
  });

  it('numbers ordered list items that the converter left unmarked', () => {
    const { text } = buildTextMapping(
      bodyFromHtml('<ol><li>First</li><li>Second</li></ol><ol start="9"><li>Ninth</li><li value="12">Twelfth</li></ol>')
    );

    expect(text).toContain('1. First');
    expect(text).toContain('2. Second');
    expect(text).toContain('9. Ninth');
    expect(text).toContain('12. Twelfth');
  });

  it('formats alphabetic and roman ordered list markers', () => {
    const { text } = buildTextMapping(
      bodyFromHtml(
        '<ol type="A" start="27"><li>Wide</li></ol>' +
          '<ol type="a"><li>Narrow</li></ol>' +
          '<ol type="I" start="49"><li>Late</li></ol>' +
          '<ol type="i" start="2"><li>Early</li></ol>'
      )
    );

    expect(text).toContain('AA. Wide');
    expect(text).toContain('a. Narrow');
    expect(text).toContain('XLIX. Late');
    expect(text).toContain('ii. Early');
  });

  it('starts a block at a row that follows a cell, where a separator already stands', () => {
    // A `<tr>` opening straight after a `</td>` finds the cell's own newline
    // already there. Skipping the boundary along with the newline meant no table
    // row ever started a block, so a whole table — and whatever followed it —
    // ran together into one, and an untouched footnote marker came out reported
    // as deleted on one side and inserted on the other.
    const { boundaries, text } = buildTextMapping(
      bodyFromHtml('<table><tr><td>甲</td><td>乙</td></tr><tr><td>丙</td></tr></table><p>丁</p>')
    );
    const blocks: string[] = [];
    let start = 0;
    for (const boundary of boundaries) {
      blocks.push(text.slice(start, boundary));
      start = boundary;
    }
    blocks.push(text.slice(start));

    // Cells stay together, rows do not, and the paragraph after the table is its
    // own block rather than part of the last row. The empties are the boundaries
    // that fall at the very start and end of the text.
    expect(blocks.map((block) => block.replace(/\n/g, '').trim()).filter(Boolean)).toEqual(['甲乙', '丙', '丁']);
  });

  it('keeps a list item whole, including the paragraph a converter wrapped it in', () => {
    // `resolveBodyBlock` picks the closest `li` ahead of any paragraph, so the
    // comparison has to cut at the same place: the item is the review unit, and
    // the number injected in front of it belongs to the item rather than to a
    // block of its own.
    const { boundaries, text } = buildTextMapping(
      bodyFromHtml('<ol><li><p>第一项</p></li><li><p>第二项</p></li></ol>')
    );
    const blocks: string[] = [];
    let start = 0;
    for (const boundary of boundaries) {
      blocks.push(text.slice(start, boundary));
      start = boundary;
    }
    blocks.push(text.slice(start));

    expect(blocks.map((block) => block.replace(/\n/g, '').trim()).filter(Boolean)).toEqual(['1. 第一项', '2. 第二项']);
  });

  it('leaves list items alone when a converted marker is already present', () => {
    const body = bodyFromHtml('<ol><li><span data-mammoth-list-number="true">1.</span> Kept</li></ol>');
    const { text } = buildTextMapping(body);

    expect(text).toContain('1. Kept');
    expect(body.querySelectorAll('.mammoth-list-number')).toHaveLength(0);
  });
});
