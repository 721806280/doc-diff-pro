import { describe, expect, it } from 'vitest';
import { extractLayoutNoise, normalizeLayoutText, removeLayoutNoise } from './layoutNoise';

function bodyFromHtml(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body;
}

describe('layoutNoise', () => {
  it('extracts native header/footer hints and removes them from content html', () => {
    const body = bodyFromHtml('<header><p>公司保密页眉</p></header><p>正文</p><footer><p>第 1 页</p></footer>');
    const layoutNoise = extractLayoutNoise(body);

    expect(body.innerHTML).toBe('<p>正文</p>');
    expect(layoutNoise.hints.exact.map(normalizeLayoutText)).toEqual(
      expect.arrayContaining([normalizeLayoutText('公司保密页眉'), normalizeLayoutText('第 1 页')])
    );
    expect(layoutNoise.nativeItems).toEqual([
      { reason: 'hint', text: '公司保密页眉' },
      { reason: 'hint', text: '第 1 页' }
    ]);
  });

  it('extracts reusable footer fragments when page numbers vary', () => {
    const layoutNoise = extractLayoutNoise(
      bodyFromHtml(
        '<footer><p>第3/5页   示例联系人：张三；联系电话：13800000000；邮箱：review@example.com</p></footer><p>正文</p>'
      )
    );

    expect(layoutNoise.hints.exact.map(normalizeLayoutText)).toEqual(
      expect.arrayContaining([
        normalizeLayoutText('第3/5页   示例联系人：张三；联系电话：13800000000；邮箱：review@example.com'),
        normalizeLayoutText('示例联系人：张三；联系电话：13800000000；邮箱：review@example.com')
      ])
    );
    expect(layoutNoise.hints.fragments.map(normalizeLayoutText)).toContain(
      normalizeLayoutText('邮箱：review@example.com')
    );
    expect(layoutNoise.hints.exact.map(normalizeLayoutText)).not.toContain(
      normalizeLayoutText('邮箱：review@example.com')
    );
  });

  it('removes page numbers when layout filtering is enabled', () => {
    const root = new DOMParser().parseFromString('<p>正文</p><p>- 1 -</p>', 'text/html').body;
    const result = removeLayoutNoise(root, { hints: { exact: [], fragments: [] }, enabled: true });

    expect(result.filteredCount).toBe(1);
    expect(result.removedItems).toEqual([{ reason: 'page-number', text: '- 1 -' }]);
    expect(root.innerHTML).toBe('<p>正文</p>');
  });

  it('removes common WPS page number formats', () => {
    const samples = [
      '第 1/5 页',
      '第 1 页，共 5 页',
      '第1页/共5页',
      '共5页 第1页',
      '1 页 / 共 5 页',
      '1/5',
      'Page 1 of 5',
      'P. iv of x',
      '页码：1',
      '- 1 -',
      '— 1/5 —',
      '（第 1 页 共 5 页）'
    ];
    const root = new DOMParser().parseFromString(
      `<p>正文</p>${samples.map((sample) => `<p>${sample}</p>`).join('')}`,
      'text/html'
    ).body;
    const result = removeLayoutNoise(root, { hints: { exact: [], fragments: [] }, enabled: true });

    expect(result.filteredCount).toBe(samples.length);
    expect(result.removedItems).toEqual(samples.map((text) => ({ reason: 'page-number', text })));
    expect(root.innerHTML).toBe('<p>正文</p>');
  });

  it('keeps plain numeric content without a page marker', () => {
    const root = new DOMParser().parseFromString('<p>1</p><p>I</p><p>正文</p>', 'text/html').body;
    const result = removeLayoutNoise(root, { hints: { exact: [], fragments: [] }, enabled: true });

    expect(result.filteredCount).toBe(0);
    expect(root.innerHTML).toBe('<p>1</p><p>I</p><p>正文</p>');
  });

  it('keeps repeated content when layout filtering is disabled', () => {
    const root = new DOMParser().parseFromString('<p>内部资料</p><p>正文</p><p>内部资料</p>', 'text/html').body;
    const result = removeLayoutNoise(root, { hints: { exact: [], fragments: [] }, enabled: false });

    expect(result.filteredCount).toBe(0);
    expect(root.textContent).toContain('内部资料');
  });

  it('removes repeated keyword and contact lines as repeated layout text', () => {
    const root = new DOMParser().parseFromString(
      '<p>内部资料 请勿外传</p><p>第一章</p><p>内部资料 请勿外传</p>' +
        '<p>联系电话 010-1234</p><p>第二章</p><p>联系电话 010-1234</p>',
      'text/html'
    ).body;
    const result = removeLayoutNoise(root, { hints: { exact: [], fragments: [] }, enabled: true });

    expect(result.filteredCount).toBe(4);
    expect(result.removedItems.every((item) => item.reason === 'repeated-layout-text')).toBe(true);
    expect(root.textContent).toContain('第一章');
    expect(root.textContent).not.toContain('内部资料');
  });

  it('keeps repeated ordinary text and one-off keyword lines', () => {
    const root = new DOMParser().parseFromString(
      '<p>甲方应当按时付款</p><p>正文</p><p>甲方应当按时付款</p><p>内部资料 请勿外传</p>',
      'text/html'
    ).body;
    const result = removeLayoutNoise(root, { hints: { exact: [], fragments: [] }, enabled: true });

    expect(result.filteredCount).toBe(0);
    expect(root.textContent).toContain('甲方应当按时付款');
    expect(root.textContent).toContain('内部资料 请勿外传');
  });

  it('matches footer fragments only on lines that carry a page marker', () => {
    const hints = { exact: [], fragments: ['保密资料请勿对外传阅'] };
    const root = new DOMParser().parseFromString(
      '<p>第 2 页 保密资料请勿对外传阅</p><p>保密资料请勿对外传阅相关条款正文说明</p>',
      'text/html'
    ).body;
    const result = removeLayoutNoise(root, { hints, enabled: true });

    expect(result.filteredCount).toBe(1);
    expect(result.removedItems).toEqual([{ reason: 'hint', text: '第 2 页 保密资料请勿对外传阅' }]);
    expect(root.textContent).toContain('相关条款正文说明');
  });

  it('keeps long paragraphs and purely decorative separators', () => {
    const longText = '合同条款'.repeat(50);
    const root = new DOMParser().parseFromString(`<p>${longText}</p><p>* * *</p><p>正文</p>`, 'text/html').body;
    const result = removeLayoutNoise(root, { hints: { exact: ['页眉提示'], fragments: [] }, enabled: true });

    expect(result.filteredCount).toBe(0);
    expect(root.textContent).toContain(longText);
    expect(root.textContent).toContain('* * *');
  });
});
