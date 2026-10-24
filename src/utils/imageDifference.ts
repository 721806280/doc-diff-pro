import { throwIfAborted, yieldToBrowser } from './comparisonScheduling';
import type { ImageSize } from './imageViewport';

const NOISE_THRESHOLD = 16;
const MAX_PIXELS = 4_000_000;
const MAX_EDGE = 4096;
const PIXELS_PER_TASK = 65_536;

/** Bound working buffers and canvas dimensions, including very long diagrams. */
export function imageDifferenceRenderSize(size: ImageSize): ImageSize {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(
    1,
    MAX_EDGE / Math.max(size.width, size.height),
    Math.sqrt(MAX_PIXELS / (size.width * size.height))
  );
  return { width: Math.max(1, Math.floor(size.width * scale)), height: Math.max(1, Math.floor(size.height * scale)) };
}

/** Allow rounding in re-exports, but never stretch a crop to fill the other image. */
export function imageAspectMatches(left: ImageSize, right: ImageSize): boolean {
  const first = left.width * right.height;
  const second = right.width * left.height;
  return first > 0 && second > 0 && Math.abs(first - second) / Math.max(first, second) < 0.005;
}

/**
 * Highlights changes over the revised image. Proportional re-exports are scaled
 * uniformly; different shapes keep their original coordinates on a white page.
 * Processing yields between bounded batches so closing the dialog can cancel
 * both image loading and the mask, before anything is committed to the canvas.
 */
export async function renderImageDifference(
  left: string,
  right: string,
  size: ImageSize,
  canvas: HTMLCanvasElement,
  signal?: AbortSignal
): Promise<boolean> {
  const output = imageDifferenceRenderSize(size);
  if (!output.width || !output.height) return false;

  try {
    throwIfAborted(signal);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return false;
    const [leftImage, rightImage] = await Promise.all([loadImage(left, signal), loadImage(right, signal)]);
    throwIfAborted(signal);
    const normalize = imageAspectMatches(
      { width: leftImage.naturalWidth, height: leftImage.naturalHeight },
      { width: rightImage.naturalWidth, height: rightImage.naturalHeight }
    );
    // Compare proportional exports at the lower source resolution. Upsampling
    // the smaller copy invents interpolation edges that look like real edits.
    const raster = normalize
      ? imageDifferenceRenderSize({
          width: Math.min(leftImage.naturalWidth, rightImage.naturalWidth),
          height: Math.min(leftImage.naturalHeight, rightImage.naturalHeight)
        })
      : output;
    const leftPixels = readPixels(leftImage, size, raster, normalize);
    await yieldToBrowser(signal);
    const rightPixels = readPixels(rightImage, size, raster, normalize);
    if (!leftPixels || !rightPixels) return false;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = raster.width;
    maskCanvas.height = raster.height;
    const maskContext = maskCanvas.getContext('2d');
    if (!maskContext) return false;
    const mask = maskContext.createImageData(raster.width, raster.height);
    const { data } = mask;
    const batchSize = PIXELS_PER_TASK * 4;
    for (let start = 0; start < data.length; start += batchSize) {
      const end = Math.min(start + batchSize, data.length);
      for (let index = start; index < end; index += 4) {
        const difference = Math.max(
          Math.abs((leftPixels.data[index] ?? 0) - (rightPixels.data[index] ?? 0)),
          Math.abs((leftPixels.data[index + 1] ?? 0) - (rightPixels.data[index + 1] ?? 0)),
          Math.abs((leftPixels.data[index + 2] ?? 0) - (rightPixels.data[index + 2] ?? 0))
        );
        if (difference < NOISE_THRESHOLD) continue;
        const intensity = Math.min(1, (difference - NOISE_THRESHOLD) / (255 - NOISE_THRESHOLD));
        // Avoid allocating arrays for every changed pixel of a replaced image.
        data[index] = Math.round(254 - 101 * intensity);
        data[index + 1] = Math.round(202 - 175 * intensity);
        data[index + 2] = data[index + 1]!;
        data[index + 3] = Math.round(38 + intensity * 96);
      }
      await yieldToBrowser(signal);
    }
    maskContext.putImageData(mask, 0, 0);
    throwIfAborted(signal);
    canvas.width = output.width;
    canvas.height = output.height;
    drawOnPage(context, rightImage, size, output, normalize);
    context.filter = 'blur(0.7px)';
    context.drawImage(maskCanvas, 0, 0, output.width, output.height);
    context.filter = 'none';
    maskCanvas.width = maskCanvas.height = 0;
    return true;
  } catch {
    return false;
  }
}

function drawOnPage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  size: ImageSize,
  output: ImageSize,
  normalize: boolean
): void {
  const scale = normalize ? Math.min(size.width / image.naturalWidth, size.height / image.naturalHeight) : 1;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(
    image,
    0,
    0,
    image.naturalWidth * scale * (output.width / size.width),
    image.naturalHeight * scale * (output.height / size.height)
  );
}

function readPixels(image: HTMLImageElement, size: ImageSize, output: ImageSize, normalize: boolean): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  drawOnPage(context, image, size, output, normalize);
  const pixels = context.getImageData(0, 0, output.width, output.height);
  canvas.width = canvas.height = 0;
  return pixels;
}

function loadImage(src: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
      signal?.removeEventListener('abort', aborted);
    };
    const loaded = () => {
      cleanup();
      resolve(image);
    };
    const failed = () => {
      cleanup();
      reject(new Error('Image could not load'));
    };
    const aborted = () => {
      cleanup();
      image.src = '';
      reject(new Error('Image loading cancelled'));
    };
    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
    signal?.addEventListener('abort', aborted, { once: true });
    image.src = src;
  });
}
