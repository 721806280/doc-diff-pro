import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectDocxMetadata, collectMammothWarnings, parseDocx } from './docxParser';

const convertToHtml = vi.fn();
const imgElement = vi.fn();

vi.mock('mammoth', () => ({
  convertToHtml,
  images: { imgElement }
}));

describe('docxParser metadata helpers', () => {
  it('counts text characters, comparable images, and the graphics that were dropped', () => {
    const body = new DOMParser().parseFromString(
      '<p>合 同 A</p><img src="data:image/png;base64,iVBORw0KGgo="><img>',
      'text/html'
    ).body;
    const metadata = collectDocxMetadata(body);

    // The sourceless element is what a Word chart or vector graphic becomes once
    // the sanitizer has refused its content type. Counting it is the only reason
    // the reader ever hears that part of the document was not compared.
    expect(metadata).toEqual({
      textLength: 3,
      imageCount: 1,
      droppedImageCount: 1
    });
  });

  it('formats mammoth warnings defensively', () => {
    expect(
      collectMammothWarnings([
        { type: 'warning', message: 'Unrecognised paragraph style' },
        { message: 'Missing image alt text' },
        { type: 'warning' },
        'ignored'
      ])
    ).toEqual(['warning: Unrecognised paragraph style', 'Missing image alt text']);
    expect(collectMammothWarnings(null)).toEqual([]);
  });
});

describe('parseDocx', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
    const [input, config] = convertToHtml.mock.calls[0]!;

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

  it('rehosts embedded images on object URLs and reports them for release', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:doc-diff/1');
    convertToHtml.mockResolvedValueOnce({
      value: '<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="图"></p>',
      messages: []
    });

    const parsed = await parseDocx(new File(['docx'], 'review.docx'));

    expect(parsed.html).toContain('src="blob:doc-diff/1"');
    expect(parsed.html).not.toContain('base64');
    expect(parsed.imageUrls).toEqual(['blob:doc-diff/1']);
    expect(parsed.imageCount).toBe(1);
    expect(createObjectURL.mock.calls[0]![0]).toBeInstanceOf(Blob);
    expect((createObjectURL.mock.calls[0]![0] as Blob).type).toBe('image/png');
  });

  it('drops an image whose payload will not decode', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL');
    convertToHtml.mockResolvedValueOnce({
      value: '<p><img src="data:image/png;base64,!!not base64!!" alt="图"></p>',
      messages: []
    });

    const parsed = await parseDocx(new File(['docx'], 'review.docx'));

    expect(parsed.html).not.toContain('src=');
    expect(parsed.imageUrls).toEqual([]);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('uses configured empty markup and image alt text', async () => {
    convertToHtml.mockResolvedValueOnce({ value: '', messages: [] });
    const parsed = await parseDocx(new File(['docx'], 'review.docx'), {
      emptyDocumentHtml: '<p>Nothing here</p>',
      embeddedImageAlt: 'Scanned page'
    });
    expect(parsed.html).toBe('<p>Nothing here</p>');

    const imageConverter = imgElement.mock.calls[0]![0] as (image: {
      read: (format: 'base64') => Promise<string>;
      contentType: string;
    }) => Promise<{ src: string; alt: string }>;
    await expect(imageConverter({ contentType: 'image/png', read: async () => 'AAAA' })).resolves.toEqual({
      src: 'data:image/png;base64,AAAA',
      alt: 'Scanned page'
    });
  });

  it('falls back to the default empty markup', async () => {
    convertToHtml.mockResolvedValueOnce({ value: '   ', messages: [] });

    const parsed = await parseDocx(new File(['docx'], 'empty.docx'));

    expect(parsed.html).toBe('');
  });

  it('uses the default markup, alt text, and warning list when nothing is configured', async () => {
    convertToHtml.mockResolvedValueOnce({ value: '' });

    const parsed = await parseDocx(new File(['docx'], 'empty.docx'));

    expect(parsed.html).toBe('<p>(Empty document)</p>');
    expect(parsed.warnings).toEqual([]);

    const imageConverter = imgElement.mock.calls[0]![0] as (image: {
      read: (format: 'base64') => Promise<string>;
      contentType: string;
    }) => Promise<{ src: string; alt: string }>;
    await expect(imageConverter({ contentType: 'image/jpeg', read: async () => 'BBBB' })).resolves.toEqual({
      src: 'data:image/jpeg;base64,BBBB',
      alt: 'Embedded document image'
    });
  });

  it('releases object URLs it had already minted when parsing fails', async () => {
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:doc-diff/2');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    convertToHtml.mockResolvedValueOnce({
      // Reading `messages` after the images are rehosted is what blows up.
      value: '<p><img src="data:image/png;base64,iVBORw0KGgo="></p>',
      get messages(): unknown[] {
        throw new Error('conversion collapsed');
      }
    });

    await expect(parseDocx(new File(['docx'], 'review.docx'))).rejects.toThrow('conversion collapsed');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:doc-diff/2');
  });
});
