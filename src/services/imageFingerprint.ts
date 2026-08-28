import { readImageHeader } from '@/utils/imageHeader';
import {
  createImageVisualDescriptor,
  IMAGE_COLOR_SIZE,
  IMAGE_SAMPLE_SIZE,
  type ImageDescriptor,
  type ImageDescriptorTable,
  type ImageSample
} from '@/utils/imageDescriptor';

/**
 * Fingerprints the images a document carries, once, at parse time.
 *
 * Parse time is the only place the bytes are in hand: the markup that leaves
 * `parseDocx` points at object URLs, so by the time a comparison runs the
 * pixels are no longer reachable from it. The table produced here is keyed by
 * exactly the `src` those `<img>` elements carry, which is what lets the
 * comparison look a descriptor up from the DOM alone.
 *
 * Two properties are worth more than the speed of any of it:
 *
 * The exact hash is computed for every image, always. It is what decides
 * whether an image changed, it needs no decoding, and it is the answer in the
 * overwhelmingly common case — an untouched image is copied verbatim from one
 * document's package into the next.
 *
 * Which images get *decoded* is decided deterministically. A budget spent in
 * document order means the same document yields the same set of visual
 * descriptors on a slow machine as on a fast one; a wall-clock deadline would
 * have made the comparison's output depend on how loaded the reader's laptop
 * was, which is not a property a document comparison may have.
 */

/** Descriptors by the `src` of the element they were taken from. */
export type { ImageDescriptorTable };

export type ImageSourceEntry = {
  /** The `src` the markup will carry, used as the table key. */
  src: string;
  blob: Blob;
};

/**
 * Refuse to even hand these to a decoder. A .docx is untrusted input and an
 * image that declares dimensions like these is a decompression bomb, not a
 * figure: `createImageBitmap`'s resize options describe its output, and for
 * everything but JPEG the full surface is decoded before the resize happens.
 */
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

/**
 * Total pixels this document may have decoded on its behalf. Reached only by
 * documents that are mostly photographs, and the images past it still get their
 * exact hash — they lose the ability to be recognised as a revised version of
 * something, not the ability to be recognised at all.
 */
const TOTAL_PIXEL_BUDGET = 160_000_000;

/**
 * Side of the intermediate the decoder is asked for.
 *
 * The engine's own resampler is used only to bound the decode; the step down to
 * the sample grid is done here, by area average, so that the descriptor does
 * not inherit whichever filter and quality this browser happens to implement.
 * A fixed multiple of the sample grid keeps that second step identical
 * everywhere, and 4x1 area averaging is what keeps a one-pixel line in a
 * schematic from disappearing instead of merely fading.
 */
const DECODE_SIZE = IMAGE_SAMPLE_SIZE * 4;

/**
 * Decoding four images at once, not more. Each one in flight holds a decoded
 * surface, and the budget above bounds the total rather than the peak.
 */
const MAX_CONCURRENT_DECODES = 4;

export async function fingerprintDocumentImages(entries: readonly ImageSourceEntry[]): Promise<ImageDescriptorTable> {
  const table: ImageDescriptorTable = new Map();
  if (entries.length === 0) return table;

  const identified = await Promise.all(entries.map(identifyImage));
  // Grouped by content: the same logo in a header repeats on every page, so a
  // document routinely carries dozens of copies of a handful of images. They
  // share one descriptor and are decoded once.
  const groups = new Map<string, { descriptor: ImageDescriptor; blob: Blob }>();
  for (const entry of identified) {
    const existing = groups.get(entry.descriptor.hash);
    if (existing) {
      table.set(entry.src, existing.descriptor);
      continue;
    }

    groups.set(entry.descriptor.hash, { descriptor: entry.descriptor, blob: entry.blob });
    table.set(entry.src, entry.descriptor);
  }

  await decodeWithinBudget([...groups.values()]);
  return table;
}

type IdentifiedImage = { src: string; blob: Blob; descriptor: ImageDescriptor };

async function identifyImage(entry: ImageSourceEntry): Promise<IdentifiedImage> {
  const bytes = new Uint8Array(await entry.blob.arrayBuffer());
  const header = readImageHeader(bytes);

  return {
    src: entry.src,
    blob: entry.blob,
    descriptor: {
      hash: await contentHash(bytes),
      width: header?.width ?? 0,
      height: header?.height ?? 0,
      byteLength: bytes.byteLength
    }
  };
}

/**
 * Fills in the visual columns for as many distinct images as the budget allows,
 * in document order, mutating the descriptors in place.
 *
 * Admission is decided up front and in order, before any decoding starts, so
 * that which images end up with a visual descriptor does not depend on how the
 * decodes happened to interleave.
 */
async function decodeWithinBudget(groups: Array<{ descriptor: ImageDescriptor; blob: Blob }>): Promise<void> {
  if (!canDecodeImages()) return;

  const admitted: Array<{ descriptor: ImageDescriptor; blob: Blob }> = [];
  let spentPixels = 0;

  for (const group of groups) {
    const { width, height, byteLength } = group.descriptor;
    // An unreadable header means an unknown surface; the decoder is the wrong
    // place to find out how big it was going to be.
    if (width <= 0 || height <= 0) continue;
    const pixels = width * height;
    if (pixels > MAX_IMAGE_PIXELS || byteLength > MAX_IMAGE_BYTES) continue;
    if (spentPixels + pixels > TOTAL_PIXEL_BUDGET) continue;

    spentPixels += pixels;
    admitted.push(group);
  }

  let next = 0;
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT_DECODES, admitted.length) }, async () => {
    for (let index = next++; index < admitted.length; index = next++) {
      const group = admitted[index];
      if (!group) continue;

      const sample = await sampleImageBlob(group.blob);
      if (sample) group.descriptor.visual = createImageVisualDescriptor(sample);
    }
  });

  await Promise.all(workers);
}

function canDecodeImages(): boolean {
  return typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function';
}

/**
 * Decodes one image down to the planes the descriptor is built from, or null if
 * the decoder rejects it.
 *
 * A failed decode is an ordinary outcome, not an error: the payload came out of
 * an untrusted document and may be truncated, mislabelled, or a format this
 * browser does not implement. Losing the visual columns for one image is worth
 * far less than failing the comparison it belongs to.
 */
async function sampleImageBlob(blob: Blob): Promise<ImageSample | null> {
  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(blob, {
      resizeWidth: DECODE_SIZE,
      resizeHeight: DECODE_SIZE,
      resizeQuality: 'medium'
    });

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    // Over white, because that is the page the image sits on. A logo with a
    // transparent background drawn onto a fresh canvas would otherwise read as
    // solid black — an image entirely of ink, and every such logo alike.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);

    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return sampleFromPixels(data, bitmap.width, bitmap.height);
  } catch {
    return null;
  } finally {
    // Explicitly, and not left to the collector: a decoded surface is megabytes
    // and the collector has no idea how much is riding on this handle.
    bitmap?.close();
  }
}

/**
 * Area-averages an RGBA buffer into the luminance and colour planes.
 *
 * Stretched to a square rather than letterboxed. Padding would spend most of a
 * wide figure's grid on blank margin, and proportions are already accounted for
 * separately, where they can damp a score rather than distort a descriptor.
 */
export function sampleFromPixels(pixels: Uint8ClampedArray, width: number, height: number): ImageSample {
  const gray = new Float32Array(IMAGE_SAMPLE_SIZE * IMAGE_SAMPLE_SIZE);
  const color = new Float32Array(IMAGE_COLOR_SIZE * IMAGE_COLOR_SIZE * 3);
  const colorTotals = new Float64Array(color.length);
  const colorCounts = new Uint32Array(IMAGE_COLOR_SIZE * IMAGE_COLOR_SIZE);
  const grayTotals = new Float64Array(gray.length);
  const grayCounts = new Uint32Array(gray.length);

  for (let row = 0; row < height; row++) {
    const grayRow = Math.min(IMAGE_SAMPLE_SIZE - 1, Math.floor((row * IMAGE_SAMPLE_SIZE) / height));
    const colorRow = Math.min(IMAGE_COLOR_SIZE - 1, Math.floor((row * IMAGE_COLOR_SIZE) / height));

    for (let column = 0; column < width; column++) {
      const source = (row * width + column) * 4;
      const red = (pixels[source] ?? 0) / 255;
      const green = (pixels[source + 1] ?? 0) / 255;
      const blue = (pixels[source + 2] ?? 0) / 255;

      const grayIndex =
        grayRow * IMAGE_SAMPLE_SIZE + Math.min(IMAGE_SAMPLE_SIZE - 1, Math.floor((column * IMAGE_SAMPLE_SIZE) / width));
      grayTotals[grayIndex] = (grayTotals[grayIndex] ?? 0) + 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      grayCounts[grayIndex] = (grayCounts[grayIndex] ?? 0) + 1;

      const colorCell =
        colorRow * IMAGE_COLOR_SIZE + Math.min(IMAGE_COLOR_SIZE - 1, Math.floor((column * IMAGE_COLOR_SIZE) / width));
      colorTotals[colorCell * 3] = (colorTotals[colorCell * 3] ?? 0) + red;
      colorTotals[colorCell * 3 + 1] = (colorTotals[colorCell * 3 + 1] ?? 0) + green;
      colorTotals[colorCell * 3 + 2] = (colorTotals[colorCell * 3 + 2] ?? 0) + blue;
      colorCounts[colorCell] = (colorCounts[colorCell] ?? 0) + 1;
    }
  }

  for (let index = 0; index < gray.length; index++) {
    const count = grayCounts[index] ?? 0;
    // An empty cell can only happen when the source is smaller than the grid,
    // in which case white is the same answer the page gives.
    gray[index] = count === 0 ? 1 : (grayTotals[index] ?? 0) / count;
  }

  for (let cell = 0; cell < colorCounts.length; cell++) {
    const count = colorCounts[cell] ?? 0;
    for (let channel = 0; channel < 3; channel++) {
      color[cell * 3 + channel] = count === 0 ? 1 : (colorTotals[cell * 3 + channel] ?? 0) / count;
    }
  }

  return { gray, color };
}

/**
 * SHA-256 where it is available, which is everywhere the app runs.
 *
 * The fallback is not a security boundary — nothing here defends against a
 * chosen collision, it only answers "are these the same bytes" — so a content
 * hash salted with the length is enough to keep two different images from
 * being reported as one.
 */
async function contentHash(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return `len-${bytes.byteLength}-${fnv1a(bytes).toString(16)}`;

  const digest = await subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fnv1a(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index++) {
    hash ^= bytes[index] ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash;
}
