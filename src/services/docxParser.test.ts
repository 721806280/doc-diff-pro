import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { collectDocxMetadata, collectMammothWarnings, parseDocx } from './docxParser';

const convertToHtml = vi.fn();
const imgElement = vi.fn();

vi.mock('mammoth', () => ({
  convertToHtml,
  images: { imgElement }
}));

/** Only a container header is needed to exercise resource admission without decoding. */
function pngSource(width = 16, height = 16, marker = 0): string {
  const bytes = new Uint8Array(25);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = marker;
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

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
      droppedImageCount: 1,
      limitedImageCount: 0
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

  it('skips conversion when canceled before reading and does not report a parse failure', async () => {
    const controller = new AbortController();
    controller.abort();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(parseDocx(new File(['docx'], 'cancel.docx'), { signal: controller.signal })).rejects.toThrow(
      'Comparison superseded'
    );
    expect(convertToHtml).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('creates no loadable image URLs when canceled before image processing', async () => {
    const controller = new AbortController();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:canceled');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    convertToHtml.mockResolvedValueOnce({
      value: '<p><img src="data:image/png;base64,iVBORw0KGgo="></p>',
      messages: []
    });
    const phases: string[] = [];
    await expect(
      parseDocx(new File(['docx'], 'cancel.docx'), {
        signal: controller.signal,
        onProgress: (phase) => {
          phases.push(phase);
          if (phase === 'images') controller.abort();
        }
      })
    ).rejects.toThrow('Comparison superseded');
    expect(phases).toEqual(['reading', 'converting', 'images']);
    expect(create).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
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
      preserveAlignment: true,
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
      value: `<p><img src="${pngSource()}" alt="图"></p>`,
      messages: []
    });

    const parsed = await parseDocx(new File(['docx'], 'review.docx'));

    expect(parsed.html).toContain('src="blob:doc-diff/1"');
    expect(parsed.html).not.toContain('base64');
    expect(parsed.imageUrls).toEqual(['blob:doc-diff/1']);
    expect(parsed.imageCount).toBe(1);
    expect(parsed.html).toContain('loading="lazy"');
    expect(parsed.html).toContain('decoding="async"');
    expect(createObjectURL.mock.calls[0]![0]).toBeInstanceOf(Blob);
    expect((createObjectURL.mock.calls[0]![0] as Blob).type).toBe('image/png');
  });

  it('blocks oversized images before creating a loadable URL and keeps their fingerprints', async () => {
    const create = vi.spyOn(URL, 'createObjectURL');
    convertToHtml.mockResolvedValueOnce({
      value: `<p>正文<img src="${pngSource(10000, 4100)}" width="10000" height="4100" style="width: 10000px; height: 4100px" alt="图"></p>`
    });
    const parsed = await parseDocx(new File(['docx'], 'large.docx'), {
      imagePreviewUnavailableLabel: '无法预览，仍比较原始字节。'
    });
    const body = new DOMParser().parseFromString(parsed.html, 'text/html').body;
    const image = body.querySelector('img')!;
    expect(create).not.toHaveBeenCalled();
    expect(image.hasAttribute('src')).toBe(false);
    expect(image.hasAttribute('width')).toBe(false);
    expect(image.hasAttribute('height')).toBe(false);
    expect(image.style.width).toBe('');
    expect(image.style.height).toBe('');
    expect(image.getAttribute('data-ddv-image-resource-limit')).toBe('image-pixels');
    expect(image.alt).toContain('无法预览，仍比较原始字节。');
    expect(body.textContent).toBe('正文');
    expect(parsed).toMatchObject({
      textLength: 2,
      imageCount: 0,
      droppedImageCount: 0,
      limitedImageCount: 1,
      imageUrls: []
    });
    expect(parsed.imageDescriptors.get('figure-0')).toMatchObject({
      width: 10000,
      height: 4100,
      hash: expect.any(String)
    });
  });

  it('uses the same cumulative budget for displayed images as for fingerprints', async () => {
    const create = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => `blob:admitted-${create.mock.calls.length}`);
    convertToHtml.mockResolvedValueOnce({
      value: Array.from({ length: 6 }, (_, index) => `<p><img src="${pngSource(5000, 6000, index)}"></p>`).join('')
    });
    const parsed = await parseDocx(new File(['docx'], 'many-images.docx'));
    const images = new DOMParser().parseFromString(parsed.html, 'text/html').body.querySelectorAll('img');
    expect(create).toHaveBeenCalledTimes(5);
    expect(parsed).toMatchObject({ imageCount: 5, limitedImageCount: 1, droppedImageCount: 0 });
    expect(images[5]?.hasAttribute('src')).toBe(false);
    expect(images[5]?.getAttribute('data-ddv-image-resource-limit')).toBe('document-pixels');
    expect(parsed.imageDescriptors.size).toBe(6);
  });

  it('shares a source between repeated image copies without spending the budget twice', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:shared');
    convertToHtml.mockResolvedValueOnce({
      value: `<p>${Array.from({ length: 6 }, () => `<img src="${pngSource(5000, 6000)}">`).join('')}</p>`
    });
    const parsed = await parseDocx(new File(['docx'], 'repeated-images.docx'));
    expect(create).toHaveBeenCalledTimes(1);
    expect(parsed.imageUrls).toEqual(['blob:shared']);
    expect(parsed).toMatchObject({ imageCount: 6, limitedImageCount: 0 });
    expect(parsed.imageDescriptors.get('figure-0')).toBe(parsed.imageDescriptors.get('figure-5'));
  });

  it('keeps readable SVG object previews and blocks embedded oversized raster payloads', async () => {
    const svg = (source: string) => `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`;
    const small = svg('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="58"><text>附件</text></svg>');
    const nested = svg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="58"><image href="${pngSource(10000, 4100)}" width="128" height="58"/></svg>`
    );
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:svg');
    convertToHtml.mockResolvedValueOnce({ value: `<p><img src="${small}"><img src="${nested}"></p>` });
    const parsed = await parseDocx(new File(['docx'], 'svg-preview.docx'));
    expect(create).toHaveBeenCalledTimes(1);
    expect(parsed).toMatchObject({ imageCount: 1, limitedImageCount: 1 });
    expect(parsed.html).toContain('src="blob:svg"');
    expect(parsed.html).toContain('data-ddv-image-resource-limit="image-pixels"');
    expect(parsed.imageDescriptors.size).toBe(2);
  });

  it.each([
    [
      'filter image',
      (source: string) =>
        `<defs><filter id="preview"><feImage href="${source}"/></filter></defs><rect width="128" height="58" filter="url(#preview)"/>`
    ],
    [
      'HTML image',
      (source: string) =>
        `<foreignObject width="128" height="58"><img xmlns="http://www.w3.org/1999/xhtml" src="${source}"/></foreignObject>`
    ]
  ])('blocks oversized raster resources in an SVG %s before allocating its source', async (_name, content) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="58">${content(pngSource(10000, 4100))}</svg>`;
    const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    const create = vi.spyOn(URL, 'createObjectURL');
    convertToHtml.mockResolvedValueOnce({ value: `<p><img src="${source}"></p>` });
    const parsed = await parseDocx(new File(['docx'], 'svg-raster.docx'));
    expect(create).not.toHaveBeenCalled();
    expect(parsed).toMatchObject({ imageCount: 0, limitedImageCount: 1, imageUrls: [] });
    expect(parsed.imageDescriptors.get('figure-0')?.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifies scientific and fractional SVG dimensions before accepting a preview', async () => {
    const svgSource = (attributes: string) =>
      `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}><text>附件</text></svg>`).toString('base64')}`;
    const large = svgSource('width="1e4" height="4.1e3" viewBox="0 0 10 10"');
    const small = svgSource('width=".5in" height="1e1PT"');
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:small-svg');
    convertToHtml.mockResolvedValueOnce({ value: `<p><img src="${large}"><img src="${small}"></p>` });
    const parsed = await parseDocx(new File(['docx'], 'svg-dimensions.docx'));
    expect(create).toHaveBeenCalledTimes(1);
    expect(parsed.imageDescriptors.get('figure-0')).toMatchObject({ width: 10000, height: 4100 });
    expect(parsed.imageDescriptors.get('figure-1')).toMatchObject({ width: 48, height: 14 });
    const images = new DOMParser().parseFromString(parsed.html, 'text/html').body.querySelectorAll('img');
    expect(images[0]?.hasAttribute('src')).toBe(false);
    expect(images[0]?.getAttribute('data-ddv-image-resource-limit')).toBe('image-pixels');
    expect(images[1]?.getAttribute('src')).toBe('blob:small-svg');
  });

  it.each([
    ['font-relative dimensions', 'width="10000em" height="4100em"', ''],
    ['percentage dimensions', 'width="100%" height="100%"', ''],
    ['inline sizing', 'width="10" height="10" style="width:10000px;height:4100px"', ''],
    ['stylesheet sizing', 'width="10" height="10"', '<style>svg { width:10000px; height:4100px }</style>'],
    ['animated sizing', 'width="10" height="10"', '<set attributeName="width" to="10000"/>']
  ])('keeps SVG %s in byte comparison when its viewport cannot be verified', async (_name, attributes, content) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" ${attributes}>${content}</svg>`;
    const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    const create = vi.spyOn(URL, 'createObjectURL');
    convertToHtml.mockResolvedValueOnce({ value: `<p><img src="${source}"></p>` });
    const parsed = await parseDocx(new File(['docx'], 'svg-viewport.docx'));
    expect(create).not.toHaveBeenCalled();
    expect(parsed).toMatchObject({ imageCount: 0, limitedImageCount: 1, imageUrls: [] });
    expect(parsed.imageDescriptors.get('figure-0')).toMatchObject({
      hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      resourceLimit: 'unknown-dimensions'
    });
  });

  it('derives a missing SVG dimension from its viewport ratio before applying the budget', async () => {
    const svgSource = (attributes: string) =>
      `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}/>`).toString('base64')}`;
    const wide = svgSource('height="1000" viewBox="0 0 5000 10"');
    const tall = svgSource('width="1000" viewBox="0 0 10 5000"');
    const small = svgSource('width="100" viewBox="0 0 20 10"');
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:small-svg');
    convertToHtml.mockResolvedValueOnce({ value: `<p><img src="${wide}"><img src="${tall}"><img src="${small}"></p>` });
    const parsed = await parseDocx(new File(['docx'], 'svg-ratio.docx'));
    expect(create).toHaveBeenCalledTimes(1);
    expect(parsed).toMatchObject({ imageCount: 1, limitedImageCount: 2 });
    expect(parsed.imageDescriptors.get('figure-0')).toMatchObject({ width: 500000, height: 1000 });
    expect(parsed.imageDescriptors.get('figure-1')).toMatchObject({ width: 1000, height: 500000 });
    expect(parsed.imageDescriptors.get('figure-2')).toMatchObject({ width: 100, height: 50 });
    const images = new DOMParser().parseFromString(parsed.html, 'text/html').body.querySelectorAll('img');
    expect(images[0]?.hasAttribute('src')).toBe(false);
    expect(images[1]?.hasAttribute('src')).toBe(false);
    expect(images[2]?.getAttribute('src')).toBe('blob:small-svg');
  });

  it('reserves layout by stamping images with the dimensions read from their header', async () => {
    // A minimal PNG: 8-byte signature then an IHDR chunk declaring 120x80. The
    // header read never decodes it, so the bytes past IHDR need not be a real
    // image for the dimensions to come through.
    const png = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // signature
      0x00,
      0x00,
      0x00,
      0x0d,
      0x49,
      0x48,
      0x44,
      0x52, // IHDR length + type
      0x00,
      0x00,
      0x00,
      0x78,
      0x00,
      0x00,
      0x00,
      0x50, // width 120, height 80
      0x08,
      0x06,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00 // bit depth, colour type, CRC
    ]);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:doc-diff/sized');
    convertToHtml.mockResolvedValueOnce({
      value: `<p><img src="data:image/png;base64,${Buffer.from(png).toString('base64')}" alt="图"></p>`,
      messages: []
    });

    const parsed = await parseDocx(new File(['docx'], 'review.docx'));

    expect(parsed.html).toContain('width="120"');
    expect(parsed.html).toContain('height="80"');
    expect(parsed.imageDescriptors.get('figure-0')).toMatchObject({ width: 120, height: 80 });
  });

  it.each([true, false])('reports only equations absent from the converted output (rendered: %s)', async (rendered) => {
    convertToHtml.mockResolvedValueOnce({
      value: rendered ? '<p style="text-align: center"><math display="block"><mi>x</mi></math></p>' : '<p>正文</p>',
      messages: []
    });
    const source = new Uint8Array(readFileSync('public/samples/baseline.docx'));
    const parsed = await parseDocx(new File([source], 'baseline.docx'));

    expect(parsed.graphics.formulas).toBe(rendered ? 0 : 1);
    if (rendered) {
      expect(parsed.html).toContain('<math');
      expect(parsed.html).toContain('text-align: center');
    }
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

  it('preserves an empty body and uses configured image alt text', async () => {
    convertToHtml.mockResolvedValueOnce({ value: '', messages: [] });
    const parsed = await parseDocx(new File(['docx'], 'review.docx'), {
      embeddedImageAlt: 'Scanned page'
    });
    expect(parsed.html).toBe('');
    expect(parsed.textLength).toBe(0);

    const imageConverter = imgElement.mock.calls[0]![0] as (image: {
      read: (format: 'base64') => Promise<string>;
      contentType: string;
    }) => Promise<{ src: string; alt: string }>;
    await expect(imageConverter({ contentType: 'image/png', read: async () => 'AAAA' })).resolves.toEqual({
      src: 'data:image/png;base64,AAAA',
      alt: 'Scanned page'
    });
  });

  it('preserves a whitespace-only body as empty input', async () => {
    convertToHtml.mockResolvedValueOnce({ value: '   ', messages: [] });

    const parsed = await parseDocx(new File(['docx'], 'empty.docx'));

    expect(parsed.html).toBe('');
  });

  it('keeps empty input and uses default alt text and warnings when nothing is configured', async () => {
    convertToHtml.mockResolvedValueOnce({ value: '' });

    const parsed = await parseDocx(new File(['docx'], 'empty.docx'));

    expect(parsed.html).toBe('');
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
      value: `<p><img src="${pngSource()}"></p>`,
      get messages(): unknown[] {
        throw new Error('conversion collapsed');
      }
    });

    await expect(parseDocx(new File(['docx'], 'review.docx'))).rejects.toThrow('conversion collapsed');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:doc-diff/2');
  });

  it('releases earlier image URLs when adopting a later image fails', async () => {
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:doc-diff/partial')
      .mockImplementationOnce(() => {
        throw new Error('Image allocation failed');
      });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    convertToHtml.mockResolvedValueOnce({
      value: `<p><img src="${pngSource()}"><img src="${pngSource(16, 16, 1)}"></p>`
    });

    await expect(parseDocx(new File(['docx'], 'review.docx'))).rejects.toThrow('Image allocation failed');
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:doc-diff/partial');
  });
});
