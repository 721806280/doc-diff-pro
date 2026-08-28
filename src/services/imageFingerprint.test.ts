import { afterEach, describe, expect, it, vi } from 'vitest';
import { fingerprintDocumentImages, sampleFromPixels, type ImageSourceEntry } from './imageFingerprint';
import { IMAGE_COLOR_SIZE, IMAGE_SAMPLE_SIZE } from '@/utils/imageDescriptor';

function ascii(text: string): number[] {
  return Array.from(text, (character) => character.charCodeAt(0));
}

function uint32BE(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/**
 * A PNG prefix that declares the given dimensions. The payload is absent on
 * purpose: nothing here decodes it, and what the admission logic acts on is
 * exactly this header.
 */
function pngOf(width: number, height: number, marker = 0): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...uint32BE(13),
    ...ascii('IHDR'),
    ...uint32BE(width),
    ...uint32BE(height),
    marker
  ]);
}

function entry(src: string, bytes: Uint8Array<ArrayBuffer>): ImageSourceEntry {
  return { src, blob: new Blob([bytes], { type: 'image/png' }) };
}

/** A decoder that reports every image as a flat mid-grey of the requested size. */
function stubDecoder(): { decoded: () => number } {
  let decoded = 0;

  vi.stubGlobal('createImageBitmap', (_blob: Blob, options?: { resizeWidth?: number; resizeHeight?: number }) => {
    decoded++;
    return Promise.resolve({
      width: options?.resizeWidth ?? 8,
      height: options?.resizeHeight ?? 8,
      close: () => undefined
    });
  });

  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        readonly width: number,
        readonly height: number
      ) {}

      getContext() {
        return {
          fillStyle: '',
          fillRect: () => undefined,
          drawImage: () => undefined,
          getImageData: (_x: number, _y: number, width: number, height: number) => ({
            data: new Uint8ClampedArray(width * height * 4).fill(128)
          })
        };
      }
    }
  );

  return { decoded: () => decoded };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fingerprintDocumentImages', () => {
  it('hashes every image and reads its dimensions from the container header', async () => {
    const table = await fingerprintDocumentImages([entry('blob:a', pngOf(1024, 768))]);
    const descriptor = table.get('blob:a');

    expect(descriptor?.width).toBe(1024);
    expect(descriptor?.height).toBe(768);
    expect(descriptor?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns an empty table for a document with no images', async () => {
    expect(await fingerprintDocumentImages([])).toEqual(new Map());
  });

  it('shares one descriptor between copies of the same image', async () => {
    // The case a document reaches by repeating a logo in its header: dozens of
    // elements, one image.
    const logo = pngOf(64, 64);
    const table = await fingerprintDocumentImages([
      entry('blob:first', logo),
      entry('blob:second', logo),
      entry('blob:other', pngOf(64, 64, 1))
    ]);

    expect(table.get('blob:first')).toBe(table.get('blob:second'));
    expect(table.get('blob:other')).not.toBe(table.get('blob:first'));
    expect(table.get('blob:other')?.hash).not.toBe(table.get('blob:first')?.hash);
  });

  it('still identifies an image whose header cannot be read', async () => {
    const table = await fingerprintDocumentImages([entry('blob:opaque', new Uint8Array([1, 2, 3, 4]))]);

    expect(table.get('blob:opaque')?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(table.get('blob:opaque')?.width).toBe(0);
    expect(table.get('blob:opaque')?.visual).toBeUndefined();
  });

  it('leaves the visual columns empty where the platform has no decoder', async () => {
    // jsdom has neither createImageBitmap nor OffscreenCanvas, which is the
    // same degraded path an older browser takes.
    const table = await fingerprintDocumentImages([entry('blob:a', pngOf(32, 32))]);

    expect(table.get('blob:a')?.visual).toBeUndefined();
    expect(table.get('blob:a')?.hash).toBeTruthy();
  });

  it('decodes images once a decoder is available', async () => {
    const decoder = stubDecoder();
    const table = await fingerprintDocumentImages([entry('blob:a', pngOf(32, 32))]);

    expect(decoder.decoded()).toBe(1);
    expect(table.get('blob:a')?.visual?.gradient).toHaveLength(8);
    expect(table.get('blob:a')?.visual?.ink).toHaveLength(256);
  });

  it('spends its decode budget in document order, not in completion order', async () => {
    stubDecoder();
    // Thirty megapixels each against a 160 megapixel budget: five fit and the
    // sixth does not, and which one misses out must not depend on how the
    // decodes happened to interleave.
    const table = await fingerprintDocumentImages(
      Array.from({ length: 6 }, (_unused, index) => entry(`blob:${index}`, pngOf(5000, 6000, index)))
    );

    for (let index = 0; index < 5; index++) {
      expect(table.get(`blob:${index}`)?.visual).toBeDefined();
    }
    expect(table.get('blob:5')?.visual).toBeUndefined();
    // The one that missed out is still identified, so it can still be found to
    // have changed — it just cannot be recognised as a revision of something.
    expect(table.get('blob:5')?.hash).toBeTruthy();
  });

  it('refuses a single image past the pixel ceiling with the budget untouched', async () => {
    const decoder = stubDecoder();
    // Sixty-four megapixels: well inside the document budget, well past what a
    // single decode may be trusted with.
    const table = await fingerprintDocumentImages([entry('blob:huge', pngOf(8000, 8000))]);

    expect(decoder.decoded()).toBe(0);
    expect(table.get('blob:huge')?.visual).toBeUndefined();
  });

  it('refuses to hand a decompression bomb to the decoder', async () => {
    const decoder = stubDecoder();
    const table = await fingerprintDocumentImages([entry('blob:bomb', pngOf(30000, 30000))]);

    expect(decoder.decoded()).toBe(0);
    expect(table.get('blob:bomb')?.visual).toBeUndefined();
    expect(table.get('blob:bomb')?.width).toBe(30000);
  });

  it('survives a decoder that rejects the payload', async () => {
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('unsupported')));
    vi.stubGlobal('OffscreenCanvas', class {});

    const table = await fingerprintDocumentImages([entry('blob:broken', pngOf(32, 32))]);

    expect(table.get('blob:broken')?.visual).toBeUndefined();
    expect(table.get('blob:broken')?.hash).toBeTruthy();
  });

  it('closes every decoded surface it opens', async () => {
    const closed: number[] = [];
    vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width: 8, height: 8, close: () => closed.push(1) }));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          // A context this browser will not give up is an ordinary outcome, and
          // the surface still has to be released.
          return null;
        }
      }
    );

    await fingerprintDocumentImages([entry('blob:a', pngOf(32, 32)), entry('blob:b', pngOf(32, 32, 1))]);

    expect(closed).toHaveLength(2);
  });

  it('still tells images apart where Web Crypto is unavailable', async () => {
    // An insecure context has no `crypto.subtle`. Nothing here defends against a
    // chosen collision — the question is only "are these the same bytes" — so a
    // content hash keeps the comparison working rather than failing it.
    vi.stubGlobal('crypto', {});

    const table = await fingerprintDocumentImages([
      entry('blob:a', pngOf(64, 64, 1)),
      entry('blob:b', pngOf(64, 64, 2)),
      entry('blob:same', pngOf(64, 64, 1))
    ]);

    expect(table.get('blob:a')?.hash).not.toBe(table.get('blob:b')?.hash);
    expect(table.get('blob:a')?.hash).toBe(table.get('blob:same')?.hash);
    expect(table.get('blob:a')?.hash).toMatch(/^len-\d+-[0-9a-f]+$/);
  });
});

describe('sampleFromPixels', () => {
  function solid(red: number, green: number, blue: number, size = 8): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(size * size * 4);
    for (let index = 0; index < size * size; index++) {
      pixels[index * 4] = red;
      pixels[index * 4 + 1] = green;
      pixels[index * 4 + 2] = blue;
      pixels[index * 4 + 3] = 255;
    }
    return pixels;
  }

  it('fills both planes to the sizes the descriptor expects', () => {
    const sample = sampleFromPixels(solid(255, 255, 255), 8, 8);

    expect(sample.gray).toHaveLength(IMAGE_SAMPLE_SIZE * IMAGE_SAMPLE_SIZE);
    expect(sample.color).toHaveLength(IMAGE_COLOR_SIZE * IMAGE_COLOR_SIZE * 3);
  });

  it('weights the channels by luminance rather than averaging them', () => {
    // Pure green reads far brighter than pure blue, which a flat mean would
    // report as the same grey.
    const green = sampleFromPixels(solid(0, 255, 0), 8, 8);
    const blue = sampleFromPixels(solid(0, 0, 255), 8, 8);

    expect(green.gray[0]).toBeCloseTo(0.7152, 3);
    expect(blue.gray[0]).toBeCloseTo(0.0722, 3);
  });

  it('keeps the colour planes per channel', () => {
    const sample = sampleFromPixels(solid(204, 0, 0), 8, 8);

    expect(sample.color[0]).toBeCloseTo(0.8, 2);
    expect(sample.color[1]).toBe(0);
    expect(sample.color[2]).toBe(0);
  });

  it('spreads a source smaller than the grid across the whole grid', () => {
    // Two pixels wide, half black and half white: every cell of the grid has to
    // land on one side or the other, and none may be left unset.
    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const sample = sampleFromPixels(pixels, 2, 1);

    expect(sample.gray[0]).toBeCloseTo(0, 5);
    expect(sample.gray[IMAGE_SAMPLE_SIZE - 1]).toBeCloseTo(1, 5);
    expect(Array.from(sample.gray).every((value) => value === 0 || value === 1)).toBe(true);
  });

  it('reads a wide source into the same square grid', () => {
    const pixels = new Uint8ClampedArray(16 * 4 * 4).fill(255);
    const sample = sampleFromPixels(pixels, 16, 4);

    expect(Array.from(sample.gray).every((value) => value === 1)).toBe(true);
  });
});
