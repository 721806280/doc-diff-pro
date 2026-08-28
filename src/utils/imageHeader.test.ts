import { describe, expect, it } from 'vitest';
import { readImageHeader } from './imageHeader';

function ascii(text: string): number[] {
  return Array.from(text, (character) => character.charCodeAt(0));
}

function uint16BE(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function uint16LE(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint24LE(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff];
}

// `>>> 24` rather than a division for the top byte: it is the only form that is
// right for both a value past the signed range and a negative one, and BMP
// stores its top-down heights as the latter.
function uint32BE(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint32LE(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function png(width: number, height: number): Uint8Array {
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
    ...uint32BE(height)
  ]);
}

/** A baseline frame behind one skippable application segment. */
function jpeg(width: number, height: number, frameMarker = 0xc0): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    ...uint16BE(6),
    ...ascii('JF'),
    0x00,
    0x00,
    0xff,
    frameMarker,
    ...uint16BE(11),
    8,
    ...uint16BE(height),
    ...uint16BE(width)
  ]);
}

function gif(width: number, height: number, signature = 'GIF89a'): Uint8Array {
  return new Uint8Array([...ascii(signature), ...uint16LE(width), ...uint16LE(height)]);
}

function webpExtended(width: number, height: number): Uint8Array {
  return new Uint8Array([
    ...ascii('RIFF'),
    ...uint32LE(30),
    ...ascii('WEBP'),
    ...ascii('VP8X'),
    ...uint32LE(10),
    0x10,
    0x00,
    0x00,
    0x00,
    ...uint24LE(width - 1),
    ...uint24LE(height - 1)
  ]);
}

function webpLossless(width: number, height: number, signatureByte = 0x2f): Uint8Array {
  const packed = (width - 1) | ((height - 1) << 14);
  return new Uint8Array([
    ...ascii('RIFF'),
    ...uint32LE(20),
    ...ascii('WEBP'),
    ...ascii('VP8L'),
    ...uint32LE(12),
    signatureByte,
    ...uint32LE(packed)
  ]);
}

function webpLossy(width: number, height: number, startCode = [0x9d, 0x01, 0x2a]): Uint8Array {
  return new Uint8Array([
    ...ascii('RIFF'),
    ...uint32LE(26),
    ...ascii('WEBP'),
    ...ascii('VP8 '),
    ...uint32LE(18),
    0x00,
    0x00,
    0x00,
    ...startCode,
    ...uint16LE(width),
    ...uint16LE(height)
  ]);
}

function bmp(width: number, height: number, dibHeaderSize = 40): Uint8Array {
  const dimensions =
    dibHeaderSize === 12 ? [...uint16LE(width), ...uint16LE(height)] : [...uint32LE(width), ...uint32LE(height)];

  return new Uint8Array([
    ...ascii('BM'),
    ...uint32LE(0),
    ...uint32LE(0),
    ...uint32LE(0),
    ...uint32LE(dibHeaderSize),
    ...dimensions
  ]);
}

describe('readImageHeader', () => {
  it('reads PNG dimensions from the IHDR chunk', () => {
    expect(readImageHeader(png(1024, 768))).toEqual({ format: 'png', width: 1024, height: 768 });
  });

  it('reads JPEG dimensions past a skippable segment, for every frame coding', () => {
    expect(readImageHeader(jpeg(640, 480))).toEqual({ format: 'jpeg', width: 640, height: 480 });
    // Progressive, arithmetic and lossless frames all state their size the same
    // way; only the marker differs.
    expect(readImageHeader(jpeg(640, 480, 0xc2))?.width).toBe(640);
    expect(readImageHeader(jpeg(640, 480, 0xcf))?.height).toBe(480);
  });

  it('skips JPEG fill bytes and standalone markers while walking to the frame', () => {
    const withPadding = new Uint8Array([0xff, 0xd8, 0xff, 0xff, 0xff, 0xd0, ...jpeg(320, 200).slice(2)]);

    expect(readImageHeader(withPadding)).toEqual({ format: 'jpeg', width: 320, height: 200 });
  });

  it('reads GIF dimensions for both signature versions', () => {
    expect(readImageHeader(gif(16, 32))).toEqual({ format: 'gif', width: 16, height: 32 });
    expect(readImageHeader(gif(16, 32, 'GIF87a'))?.format).toBe('gif');
  });

  it('reads WebP dimensions from extended, lossless and lossy chunks', () => {
    expect(readImageHeader(webpExtended(4000, 3000))).toEqual({ format: 'webp', width: 4000, height: 3000 });
    expect(readImageHeader(webpLossless(300, 200))).toEqual({ format: 'webp', width: 300, height: 200 });
    expect(readImageHeader(webpLossy(96, 64))).toEqual({ format: 'webp', width: 96, height: 64 });
  });

  it('reads BMP dimensions from both DIB header layouts and normalizes top-down rows', () => {
    expect(readImageHeader(bmp(200, 100))).toEqual({ format: 'bmp', width: 200, height: 100 });
    expect(readImageHeader(bmp(20, 10, 12))).toEqual({ format: 'bmp', width: 20, height: 10 });
    // A negative height means the rows are stored top down, not that the image
    // is smaller than nothing.
    expect(readImageHeader(bmp(200, -100))).toEqual({ format: 'bmp', width: 200, height: 100 });
  });

  it('reports dimensions above the signed 32-bit range as the positive values they are', () => {
    // The value a bomb check has to see: assembled with shifts this would come
    // back negative and slip under any ceiling comparison.
    expect(readImageHeader(png(0x7fffffff, 0x7fffffff))).toEqual({
      format: 'png',
      width: 0x7fffffff,
      height: 0x7fffffff
    });
  });

  it('rejects payloads that are not images, or are truncated before the dimensions', () => {
    expect(readImageHeader(new Uint8Array(0))).toBeNull();
    expect(readImageHeader(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
    expect(readImageHeader(png(1024, 768).slice(0, 18))).toBeNull();
    expect(readImageHeader(gif(16, 32).slice(0, 7))).toBeNull();
  });

  it('rejects a PNG whose first chunk is not IHDR', () => {
    const reordered = png(8, 8);
    reordered.set(
      Array.from('IDAT', (character) => character.charCodeAt(0)),
      12
    );

    expect(readImageHeader(reordered)).toBeNull();
  });

  it('rejects zero dimensions rather than reporting an image of no size', () => {
    expect(readImageHeader(png(0, 10))).toBeNull();
    expect(readImageHeader(bmp(10, 0))).toBeNull();
  });

  it('gives up on a JPEG with no frame header instead of scanning forever', () => {
    // A segment whose length counts only itself would leave the walk standing
    // still, which is the one shape that could hang it.
    expect(readImageHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...uint16BE(1), 0x00]))).toBeNull();
    expect(readImageHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...uint16BE(4), 0x00, 0x00]))).toBeNull();
  });

  it('rejects WebP chunks whose own signature does not check out', () => {
    expect(readImageHeader(webpLossless(300, 200, 0x00))).toBeNull();
    expect(readImageHeader(webpLossy(96, 64, [0x00, 0x00, 0x00]))).toBeNull();
    expect(
      readImageHeader(new Uint8Array([...ascii('RIFF'), ...uint32LE(4), ...ascii('WEBP'), ...ascii('XXXX')]))
    ).toBeNull();
  });

  it('rejects a BMP whose DIB header is too small to hold 32-bit dimensions', () => {
    expect(readImageHeader(bmp(200, 100, 30))).toBeNull();
  });
});
