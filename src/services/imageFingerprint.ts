import { readImageHeader } from '@/utils/imageHeader';
import {
  createImageResourceBudget,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  type ImageResourceInfo
} from '@/utils/imageResourceBudget';
import { throwIfAborted } from '@/utils/comparisonScheduling';
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
 * `parseDocx` points at object URLs — or, for a figure nothing can draw, at
 * nothing at all — so by the time a comparison runs the pixels are no longer
 * reachable from it. The table is keyed by an id stamped on each element, which
 * is what lets the comparison look a descriptor up from the DOM alone.
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

/** Descriptors by the stable ID stamped on the image element. */
export type { ImageDescriptorTable };

export type ImageSourceEntry = {
  /** The id stamped on the element, used as the table key. */
  id: string;
  blob: Blob;
};

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

export async function fingerprintDocumentImages(
  entries: readonly ImageSourceEntry[],
  signal?: AbortSignal
): Promise<ImageDescriptorTable> {
  throwIfAborted(signal);
  const table: ImageDescriptorTable = new Map();
  if (entries.length === 0) return table;

  const identified: IdentifiedImage[] = [];
  // Bound in-flight byte copies as well as decodes, and stop starting batches
  // when the document has been replaced or the reader cancels its import.
  for (let offset = 0; offset < entries.length; offset += MAX_CONCURRENT_DECODES) {
    throwIfAborted(signal);
    identified.push(
      ...(await Promise.all(
        entries.slice(offset, offset + MAX_CONCURRENT_DECODES).map((entry) => identifyImage(entry, signal))
      ))
    );
  }
  // Grouped by content: the same logo in a header repeats on every page, so a
  // document routinely carries dozens of copies of a handful of images. They
  // share one descriptor and are decoded once.
  const groups = new Map<string, { descriptor: ImageDescriptor; blob: Blob }>();
  for (const entry of identified) {
    const existing = groups.get(entry.descriptor.hash);
    if (existing) {
      table.set(entry.id, existing.descriptor);
      continue;
    }

    groups.set(entry.descriptor.hash, { descriptor: entry.descriptor, blob: entry.blob });
    table.set(entry.id, entry.descriptor);
  }

  await decodeWithinBudget([...groups.values()], signal);
  throwIfAborted(signal);
  return table;
}

type IdentifiedImage = { id: string; blob: Blob; descriptor: ImageDescriptor };

async function identifyImage(entry: ImageSourceEntry, signal?: AbortSignal): Promise<IdentifiedImage> {
  const bytes = new Uint8Array(await entry.blob.arrayBuffer());
  throwIfAborted(signal);
  const header = readImageHeader(bytes);
  const resources = entry.blob.type === 'image/svg+xml' ? inspectSvgResources(bytes) : undefined;

  return {
    id: entry.id,
    blob: entry.blob,
    descriptor: {
      hash: await contentHash(bytes),
      width: header?.width ?? 0,
      height: header?.height ?? 0,
      byteLength: bytes.byteLength,
      ...resources
    }
  };
}

/** Inspect SVG viewports and embedded raster images before any decoder sees them. */
function inspectSvgResources(bytes: Uint8Array): ImageResourceInfo {
  const unknown: ImageResourceInfo = {
    width: 0,
    height: 0,
    byteLength: bytes.byteLength,
    resourceLimit: 'unknown-dimensions'
  };
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ...unknown, resourceLimit: 'image-bytes' };
  const document = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'image/svg+xml');
  const root = document.documentElement;
  if (root.localName !== 'svg' || document.querySelector('parsererror')) return unknown;
  const viewBox = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const widthAttribute = root.getAttribute('width');
  const heightAttribute = root.getAttribute('height');
  let width = svgLength(widthAttribute);
  let height = svgLength(heightAttribute);
  // A relative or invalid explicit size cannot be replaced with viewBox units.
  if ((widthAttribute !== null && width <= 0) || (heightAttribute !== null && height <= 0)) return unknown;
  if (widthAttribute === null || heightAttribute === null) {
    const viewWidth = viewBox[2] ?? 0;
    const viewHeight = viewBox[3] ?? 0;
    if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewWidth <= 0 || viewHeight <= 0) return unknown;
    if (widthAttribute === null && heightAttribute === null) {
      width = viewWidth;
      height = viewHeight;
    } else if (widthAttribute === null) width = (height * viewWidth) / viewHeight;
    else height = (width * viewHeight) / viewWidth;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return unknown;
  const resources: ImageResourceInfo = {
    width: Math.ceil(width),
    height: Math.ceil(height),
    byteLength: bytes.byteLength
  };
  // HTML, stylesheets and animation can add resources or override the inspected
  // viewport. Keep their bytes without handing unverifiable sizes to a decoder.
  if (
    root.hasAttribute('style') ||
    root.querySelector('foreignObject, style, animate, animateColor, animateMotion, animateTransform, set')
  )
    return { ...resources, resourceLimit: 'unknown-dimensions' };
  let pixels = resources.width * resources.height;
  for (const image of root.querySelectorAll('image, feImage')) {
    const source = image.getAttribute('href') ?? image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '';
    if (!/^data:image\/(png|jpeg|gif|webp|bmp);base64,/i.test(source))
      return { ...resources, resourceLimit: 'unknown-dimensions' };
    let encoded: Uint8Array;
    try {
      encoded = Uint8Array.from(atob(source.slice(source.indexOf(',') + 1)), (character) => character.charCodeAt(0));
    } catch {
      return { ...resources, resourceLimit: 'unknown-dimensions' };
    }
    const header = readImageHeader(encoded);
    if (!header) return { ...resources, resourceLimit: 'unknown-dimensions' };
    if (encoded.byteLength > MAX_IMAGE_BYTES) return { ...resources, resourceLimit: 'image-bytes' };
    if (header.width * header.height > MAX_IMAGE_PIXELS) return { ...resources, resourceLimit: 'image-pixels' };
    pixels += header.width * header.height;
  }
  return { ...resources, resourcePixels: pixels };
}

const SVG_LENGTH_PATTERN = /^(\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(px|pt|pc|in|cm|mm)?$/i;
const SVG_LENGTH_SCALE: Record<string, number> = { px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };

function svgLength(value: string | null): number {
  const match = value?.trim().match(SVG_LENGTH_PATTERN);
  if (!match) return 0;
  return Number(match[1]) * SVG_LENGTH_SCALE[match[2]?.toLowerCase() ?? 'px']!;
}

/**
 * Fills in the visual columns for as many distinct images as the budget allows,
 * in document order, mutating the descriptors in place.
 *
 * Admission is decided up front and in order, before any decoding starts, so
 * that which images end up with a visual descriptor does not depend on how the
 * decodes happened to interleave.
 */
async function decodeWithinBudget(
  groups: Array<{ descriptor: ImageDescriptor; blob: Blob }>,
  signal?: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  if (!canDecodeImages()) return;

  const admitted: Array<{ descriptor: ImageDescriptor; blob: Blob }> = [];
  const admit = createImageResourceBudget();

  for (const group of groups) {
    if (admit(group.descriptor)) continue;
    admitted.push(group);
  }

  let next = 0;
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT_DECODES, admitted.length) }, async () => {
    for (let index = next++; index < admitted.length; index = next++) {
      throwIfAborted(signal);
      const group = admitted[index];
      if (!group) continue;

      const sample = await sampleImageBlob(group.blob);
      throwIfAborted(signal);
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
 * Use SHA-256 in every context. A short fallback hash can merge different
 * images and hide their differences. Load the software implementation only
 * when Web Crypto is unavailable or refuses the operation.
 */
async function contentHash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  let digest: ArrayBuffer | undefined;
  try {
    digest = await globalThis.crypto?.subtle?.digest('SHA-256', bytes);
  } catch {
    // An exposed API can still reject a digest. The software path must produce
    // the same identity so this cannot turn a readable image into a parse error.
  }

  const hash = digest ? new Uint8Array(digest) : (await import('@noble/hashes/sha2.js')).sha256(bytes);
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
