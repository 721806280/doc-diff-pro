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

  it('keeps a metafile figure for comparison while marking it undrawable', async () => {
    // Word stores OLE previews and equations as EMF, which no browser renders.
    // Stripping the payload here would mean the figure could never be compared
    // either, and an unreported change to a figure is worse than one that cannot
    // be shown. The parse takes the bytes and removes the source right after.
    const emf = 'data:image/x-emf;base64,AQAAAGwAAAA=';
    const body = new DOMParser().parseFromString(
      await sanitizeDocumentHtml(`<p><img src="${emf}" alt="公式"></p>`),
      'text/html'
    ).body;
    const image = body.querySelector('img');

    expect(image?.getAttribute('src')).toBe(emf);
    expect(image?.hasAttribute('data-ddv-unrenderable')).toBe(true);
  });

  it('keeps an SVG image source so OLE object icons remain visible', async () => {
    // The converter renders embedded-object icons (an inserted spreadsheet,
    // for example) as `data:image/svg+xml`. Browsers draw image-context SVG
    // without running any script it might carry, so it is safe to keep and
    // stripping it would erase every embedded file's icon.
    const svg = 'data:image/svg+xml;base64,PHN2Zy8+';
    const body = new DOMParser().parseFromString(
      await sanitizeDocumentHtml(`<p><img src="${svg}" alt="矢量"></p>`),
      'text/html'
    ).body;
    const image = body.querySelector('img');

    expect(image?.getAttribute('src')).toBe(svg);
    expect(image?.hasAttribute('data-ddv-unrenderable')).toBe(false);
  });

  it('still strips an image whose type is neither drawable nor comparable', async () => {
    const body = new DOMParser().parseFromString(
      await sanitizeDocumentHtml('<p><img src="data:image/x-unknown;base64,AAAA" alt="未知"></p>'),
      'text/html'
    ).body;
    const image = body.querySelector('img');

    expect(image?.hasAttribute('src')).toBe(false);
    expect(image?.hasAttribute('data-ddv-unrenderable')).toBe(false);
  });

  it('keeps document formatting styles but drops overlay and network-capable ones', async () => {
    const sanitized = await sanitizeDocumentHtml(
      '<p style="color: rgb(255, 0, 0); font-weight: 700; position: fixed; z-index: 9999">正文</p>' +
        '<p style="background-image: url(https://tracker.example/pixel.png)">追踪</p>' +
        '<table><tbody><tr><td style="text-align: center; border-top-width: 1px">单元格</td></tr></tbody></table>'
    );
    const body = new DOMParser().parseFromString(sanitized, 'text/html').body;
    const [formatted, tracked] = Array.from(body.querySelectorAll('p'));

    expect(formatted?.style.getPropertyValue('color')).not.toBe('');
    expect(formatted?.style.getPropertyValue('font-weight')).toBe('700');
    expect(formatted?.style.getPropertyValue('position')).toBe('');
    expect(formatted?.style.getPropertyValue('z-index')).toBe('');
    // Nothing survived, so the attribute goes with it.
    expect(tracked?.hasAttribute('style')).toBe(false);
    expect(body.querySelector('td')?.style.getPropertyValue('text-align')).toBe('center');
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
