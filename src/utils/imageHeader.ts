/**
 * Pixel dimensions read out of an image's container header, without decoding it.
 *
 * A .docx is untrusted input, and an embedded image that declares 30000x30000
 * costs hundreds of megabytes the moment anything decodes it — enough to take
 * the tab down. `createImageBitmap`'s resize options do not help: they describe
 * the output, and for everything but JPEG the full surface is decoded before
 * the resize happens. So the size has to be known *before* the decoder is
 * handed the bytes, which means reading it out of the container by hand.
 *
 * Every format here states its dimensions within the first few dozen bytes, so
 * this only ever walks a prefix. The one exception is JPEG, whose frame header
 * sits behind a chain of variable-length segments; that walk is bounded below.
 */

export type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp';

export type ImageHeader = {
  format: ImageFormat;
  width: number;
  height: number;
};

/**
 * How far into a JPEG the frame header is allowed to sit.
 *
 * Colour profiles and EXIF thumbnails legitimately push it back by tens of
 * kilobytes, so the ceiling is generous. It exists only so that a file which
 * is all segment headers and no frame cannot hold the loop indefinitely.
 */
const MAX_JPEG_SCAN_BYTES = 1 << 20;

export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  return (
    readPngHeader(bytes) ??
    readJpegHeader(bytes) ??
    readGifHeader(bytes) ??
    readWebpHeader(bytes) ??
    readBmpHeader(bytes)
  );
}

/** Whether every byte of `signature` appears at `offset`. */
function matchesSignature(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (offset + signature.length > bytes.length) return false;

  return signature.every((value, index) => bytes[offset + index] === value);
}

function matchesAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  return matchesSignature(
    bytes,
    offset,
    Array.from(text, (character) => character.charCodeAt(0))
  );
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

/**
 * Unsigned rather than `<<`-assembled: a width above 2^31 would come back
 * negative from a shift chain, and negative is exactly the value a caller
 * comparing against a ceiling would wave through.
 */
function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0)
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) +
    ((bytes[offset + 1] ?? 0) << 8) +
    ((bytes[offset + 2] ?? 0) << 16) +
    (bytes[offset + 3] ?? 0) * 0x1000000
  );
}

function readInt32LE(bytes: Uint8Array, offset: number): number {
  const value = readUint32LE(bytes, offset);
  return value >= 0x80000000 ? value - 0x100000000 : value;
}

function header(format: ImageFormat, width: number, height: number): ImageHeader | null {
  // A zero or fractional dimension means the prefix was truncated or is not
  // really this format; either way there is nothing here worth reporting.
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;

  return { format, width, height };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** IHDR is mandated to be the first chunk, so its offsets are fixed. */
function readPngHeader(bytes: Uint8Array): ImageHeader | null {
  if (!matchesSignature(bytes, 0, PNG_SIGNATURE)) return null;
  if (!matchesAscii(bytes, 12, 'IHDR')) return null;

  return header('png', readUint32BE(bytes, 16), readUint32BE(bytes, 20));
}

function readGifHeader(bytes: Uint8Array): ImageHeader | null {
  if (!matchesAscii(bytes, 0, 'GIF87a') && !matchesAscii(bytes, 0, 'GIF89a')) return null;

  return header('gif', readUint16LE(bytes, 6), readUint16LE(bytes, 8));
}

/**
 * Walks the segment chain to the frame header.
 *
 * Only the SOFn markers carry the dimensions, and which SOFn it is depends on
 * the coding — baseline, progressive, arithmetic, lossless. They are the
 * 0xC0-0xCF block minus three that reuse the range for other purposes: 0xC4
 * defines Huffman tables, 0xC8 is a JPEG extension, 0xCC defines arithmetic
 * conditioning.
 */
function readJpegHeader(bytes: Uint8Array): ImageHeader | null {
  if (!matchesSignature(bytes, 0, [0xff, 0xd8])) return null;

  const limit = Math.min(bytes.length, MAX_JPEG_SCAN_BYTES);
  let offset = 2;

  while (offset + 1 < limit) {
    if (bytes[offset] !== 0xff) {
      // Fill bytes between segments are legal; anything else means the chain is
      // broken and every offset past here is a guess.
      offset++;
      continue;
    }

    const marker = bytes[offset + 1] ?? 0;
    // 0xFF padding before a marker, and the standalone markers that carry no
    // payload to skip over.
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }

    if (isJpegFrameMarker(marker)) {
      // Segment layout: length (2), sample precision (1), height (2), width (2).
      return header('jpeg', readUint16BE(bytes, offset + 7), readUint16BE(bytes, offset + 5));
    }

    const segmentLength = readUint16BE(bytes, offset + 2);
    // A segment's length field counts itself, so anything under two bytes would
    // leave the offset standing still.
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }

  return null;
}

function isJpegFrameMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * WebP keeps the dimensions in whichever coding chunk comes first, and all
 * three spell them differently.
 */
function readWebpHeader(bytes: Uint8Array): ImageHeader | null {
  if (!matchesAscii(bytes, 0, 'RIFF') || !matchesAscii(bytes, 8, 'WEBP')) return null;

  if (matchesAscii(bytes, 12, 'VP8X')) {
    // Extended format: the canvas size, stored less one, 24 bits each.
    return header('webp', readUint24LE(bytes, 24) + 1, readUint24LE(bytes, 27) + 1);
  }

  if (matchesAscii(bytes, 12, 'VP8L')) {
    if (bytes[20] !== 0x2f) return null;
    // 14 bits of width-1 then 14 bits of height-1, packed little-endian across
    // the four bytes that follow the signature byte.
    const packed = readUint32LE(bytes, 21);
    return header('webp', (packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
  }

  if (matchesAscii(bytes, 12, 'VP8 ')) {
    // Lossy: a 3-byte frame tag, then the keyframe start code, then the
    // dimensions in the low 14 bits of each 16-bit field.
    if (!matchesSignature(bytes, 23, [0x9d, 0x01, 0x2a])) return null;
    return header('webp', readUint16LE(bytes, 26) & 0x3fff, readUint16LE(bytes, 28) & 0x3fff);
  }

  return null;
}

/**
 * BMP states its dimensions in the DIB header, whose own size says which
 * layout to expect: the 12-byte original uses 16-bit fields, everything since
 * uses 32-bit signed ones. A negative height means the rows are stored top
 * down, which says nothing about how large the image is.
 */
function readBmpHeader(bytes: Uint8Array): ImageHeader | null {
  if (!matchesAscii(bytes, 0, 'BM')) return null;

  const dibHeaderSize = readUint32LE(bytes, 14);
  if (dibHeaderSize === 12) {
    return header('bmp', readUint16LE(bytes, 18), readUint16LE(bytes, 20));
  }
  if (dibHeaderSize < 40) return null;

  return header('bmp', readInt32LE(bytes, 18), Math.abs(readInt32LE(bytes, 22)));
}
