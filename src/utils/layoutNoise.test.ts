import { describe, expect, it } from 'vitest';
import { extractLayoutNoiseHints, normalizeLayoutText, removeLayoutNoise } from './layoutNoise';

describe('layoutNoise', () => {
  it('extracts native header/footer hints and removes them from content html', () => {
    const result = extractLayoutNoiseHints(
      '<header><p>公司保密页眉</p></header><p>正文</p><footer><p>第 1 页</p></footer>'
    );

    expect(result.html).toBe('<p>正文</p>');
    expect(result.hints.exact.map(normalizeLayoutText)).toEqual(expect.arrayContaining([
      normalizeLayoutText('公司保密页眉'),
      normalizeLayoutText('第 1 页')
    ]));
  });

  it('extracts reusable footer fragments when page numbers vary', () => {
    const result = extractLayoutNoiseHints(
      '<footer><p>第3/5页   示例联系人：张三；联系电话：13800000000；邮箱：review@example.com</p></footer><p>正文</p>'
    );

    expect(result.hints.exact.map(normalizeLayoutText)).toEqual(expect.arrayContaining([
      normalizeLayoutText('第3/5页   示例联系人：张三；联系电话：13800000000；邮箱：review@example.com'),
      normalizeLayoutText('示例联系人：张三；联系电话：13800000000；邮箱：review@example.com')
    ]));
    expect(result.hints.fragments.map(normalizeLayoutText)).toContain(normalizeLayoutText('邮箱：review@example.com'));
    expect(result.hints.exact.map(normalizeLayoutText)).not.toContain(normalizeLayoutText('邮箱：review@example.com'));
  });

  it('removes page numbers when layout filtering is enabled', () => {
    const root = new DOMParser().parseFromString('<p>正文</p><p>- 1 -</p>', 'text/html').body;
    const result = removeLayoutNoise(root, { hints: { exact: [], fragments: [] }, enabled: true });

    expect(result.filteredCount).toBe(1);
    expect(result.items).toEqual([{ reason: 'page-number', text: '- 1 -' }]);
    expect(root.innerHTML).toBe('<p>正文</p>');
  });

  it('keeps plain numeric content without a page marker', () => {
    const root = new DOMParser().parseFromString('<p>1</p><p>正文</p>', 'text/html').body;
    const result = removeLayoutNoise(root, { hints: { exact: [], fragments: [] }, enabled: true });

    expect(result.filteredCount).toBe(0);
    expect(root.innerHTML).toBe('<p>1</p><p>正文</p>');
  });

  it('keeps repeated content when layout filtering is disabled', () => {
    const root = new DOMParser().parseFromString(
      '<p>内部资料</p><p>正文</p><p>内部资料</p>',
      'text/html'
    ).body;
    const result = removeLayoutNoise(root, { hints: { exact: [], fragments: [] }, enabled: false });

    expect(result.filteredCount).toBe(0);
    expect(root.textContent).toContain('内部资料');
  });
});
