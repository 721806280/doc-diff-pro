import { describe, expect, it } from 'vitest';
import { sanitizeDocumentHtml } from './sanitizeDocumentHtml';

describe('sanitizeDocumentHtml', () => {
  it('removes executable markup and unsafe URLs', async () => {
    const sanitized = await sanitizeDocumentHtml(
      '<p onclick="alert(1)">正文<script>alert(1)</script></p>' +
        '<a href="javascript:alert(1)">链接</a>' +
        '<img src="https://tracker.example/pixel.png" onerror="alert(1)">'
    );
    const body = new DOMParser().parseFromString(sanitized, 'text/html').body;

    expect(body.querySelector('script')).toBeNull();
    expect(body.querySelector('p')?.hasAttribute('onclick')).toBe(false);
    expect(body.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(body.querySelector('a')?.rel).toBe('noopener noreferrer');
    expect(body.querySelector('img')?.hasAttribute('src')).toBe(false);
    expect(body.querySelector('img')?.hasAttribute('onerror')).toBe(false);
  });

  it('keeps document structure and embedded raster images', async () => {
    const imageSource = 'data:image/png;base64,iVBORw0KGgo=';
    const sanitized = await sanitizeDocumentHtml(
      `<h2>标题</h2><table><tbody><tr><td>内容</td></tr></tbody></table><img src="${imageSource}" alt="图">`
    );
    const body = new DOMParser().parseFromString(sanitized, 'text/html').body;

    expect(body.querySelector('h2')?.textContent).toBe('标题');
    expect(body.querySelector('td')?.textContent).toBe('内容');
    expect(body.querySelector('img')?.getAttribute('src')).toBe(imageSource);
  });

  it('keeps safe links with noopener but removes non-html active content', async () => {
    const sanitized = await sanitizeDocumentHtml(
      '<a href="https://example.com/report">报告</a>' +
        '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>' +
        '<math><mtext>formula</mtext></math>'
    );
    const body = new DOMParser().parseFromString(sanitized, 'text/html').body;

    expect(body.querySelector('a')?.getAttribute('href')).toBe('https://example.com/report');
    expect(body.querySelector('a')?.rel).toBe('noopener noreferrer');
    expect(body.querySelector('svg')).toBeNull();
    expect(body.querySelector('math')).toBeNull();
  });
});
