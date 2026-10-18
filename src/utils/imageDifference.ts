import type { ImageSize } from './imageViewport';

const WEAK_COLOR = [254, 202, 202] as const;
const STRONG_COLOR = [153, 27, 27] as const;
const NOISE_THRESHOLD = 16;

/**
 * Draws the revised image with the changed pixels highlighted on top.
 *
 * The mask is computed from two clean pixel buffers, then applied to the
 * revised image. Keeping the baseline invisible lets ordinary content stay
 * readable while edits appear as a light annotation instead of a separate
 * ghosted comparison layer.
 */
export async function renderImageDifference(
  left: string,
  right: string,
  size: ImageSize,
  canvas: HTMLCanvasElement
): Promise<boolean> {
  if (size.width <= 0 || size.height <= 0) return false;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;

  try {
    const [leftImage, rightImage] = await Promise.all([loadImage(left), loadImage(right)]);
    const [leftPixels, rightPixels] = [readPixels(leftImage, size), readPixels(rightImage, size)];
    if (!leftPixels || !rightPixels) return false;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = size.width;
    maskCanvas.height = size.height;
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskContext) return false;

    const mask = maskContext.createImageData(size.width, size.height);
    const { data } = mask;
    for (let index = 0; index < data.length; index += 4) {
      const difference = Math.max(
        Math.abs((leftPixels.data[index] ?? 0) - (rightPixels.data[index] ?? 0)),
        Math.abs((leftPixels.data[index + 1] ?? 0) - (rightPixels.data[index + 1] ?? 0)),
        Math.abs((leftPixels.data[index + 2] ?? 0) - (rightPixels.data[index + 2] ?? 0))
      );
      if (difference < NOISE_THRESHOLD) continue;

      const intensity = Math.min(1, (difference - NOISE_THRESHOLD) / (255 - NOISE_THRESHOLD));
      const [red, green, blue] = mixColors(WEAK_COLOR, STRONG_COLOR, intensity);
      data[index] = red;
      data[index + 1] = green;
      data[index + 2] = blue;
      data[index + 3] = Math.round(38 + intensity * 96);
    }
    maskContext.putImageData(mask, 0, 0);

    canvas.width = size.width;
    canvas.height = size.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(rightImage, 0, 0, canvas.width, canvas.height);
    context.filter = 'blur(0.7px)';
    context.drawImage(maskCanvas, 0, 0);
    context.filter = 'none';
    return true;
  } catch {
    return false;
  }
}

function mixColors(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
  intensity: number
): readonly [number, number, number] {
  return [0, 1, 2].map((channel) => {
    const from = left[channel] ?? 0;
    const to = right[channel] ?? 0;
    return Math.round(from + (to - from) * intensity);
  }) as [number, number, number];
}

function readPixels(image: HTMLImageElement, size: ImageSize): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error('Image could not load')), { once: true });
    image.src = src;
  });
}
