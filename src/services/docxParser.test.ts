import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectDocxMetadata, collectMammothWarnings, parseDocx } from './docxParser';

const convertToHtml = vi.fn();
const imgElement = vi.fn();

vi.mock('mammoth', () => ({
  convertToHtml,
  images: { imgElement }
}));

describe('docxParser metadata helpers', () => {
  it('counts text characters and sanitized embedded images', () => {
    const metadata = collectDocxMetadata(
      '<p>合 同 A</p><img src="data:image/png;base64,iVBORw0KGgo="><img>'
    );

    expect(metadata).toEqual({
      textLength: 3,
      imageCount: 1
    });
  });

  it('formats mammoth warnings defensively', () => {
    expect(collectMammothWarnings([
      { type: 'warning', message: 'Unrecognised paragraph style' },
      { message: 'Missing image alt text' },
      { type: 'warning' },
      'ignored'
    ])).toEqual([
      'warning: Unrecognised paragraph style',
      'Missing image alt text'
    ]);
    expect(collectMammothWarnings(null)).toEqual([]);
  });
});

describe('parseDocx', () => {
  beforeEach(() => {
    convertToHtml.mockReset();
    imgElement.mockReset();
    imgElement.mockReturnValue('image-converter');
  });

  it('includes native headers and footers as layout noise', async () => {
    convertToHtml.mockResolvedValueOnce({
      value: '<header><p>内部资料</p></header><p onclick="alert(1)">正文</p><footer><p>第 1 页</p></footer>',
      messages: []
    });

    const parsed = await parseDocx(new File(['docx'], 'review.docx'));
    const [input, config] = convertToHtml.mock.calls[0];

    expect(input.arrayBuffer.byteLength).toBe(4);
    expect(config).toEqual({
      includeHeadersAndFooters: true,
      convertImage: 'image-converter'
    });
    expect(parsed.html).toBe('<p>正文</p>');
    expect(parsed.layoutNoise.nativeItems).toEqual([
      { reason: 'hint', text: '内部资料' },
      { reason: 'hint', text: '第 1 页' }
    ]);
    expect(parsed.warnings).toEqual([]);
  });
});
