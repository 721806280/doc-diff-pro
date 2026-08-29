import { expect, test } from '@playwright/test';

/**
 * The one part of image comparison unit tests cannot reach.
 *
 * jsdom has neither `createImageBitmap` nor `OffscreenCanvas`, so every unit test
 * of the fingerprinter either stubs the decoder or exercises the degraded
 * hash-only path. This drives the real one: a real PNG encoder, a real decode
 * with the browser's own downscaling, a real `getImageData`, and the luminance
 * arithmetic on top of it.
 */

type FingerprintModule = typeof import('../src/services/imageFingerprint');
type DescriptorModule = typeof import('../src/utils/imageDescriptor');

type FingerprintResult = {
  decoded: boolean;
  sameHash: boolean;
  editedScore: number;
  unrelatedScore: number;
  pairThreshold: number;
  cosmeticThreshold: number;
};

test('fingerprints real images through the browser decoder', async ({ page }) => {
  await page.goto('./');

  const result = await page.evaluate<FingerprintResult>(async () => {
    const canvasBlob = (draw: (context: CanvasRenderingContext2D, size: number) => void): Promise<Blob> => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d context');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      draw(context, size);

      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
      });
    };

    const barChart = (heights: readonly number[]) => (context: CanvasRenderingContext2D, size: number) => {
      context.fillStyle = '#1f2937';
      context.fillRect(0, size - 16, size, 8);
      heights.forEach((height, index) => {
        const barHeight = Math.round(height * size);
        context.fillRect(16 + index * 48, size - 16 - barHeight, 32, barHeight);
      });
    };

    const rings = (context: CanvasRenderingContext2D, size: number) => {
      context.strokeStyle = '#1f2937';
      context.lineWidth = 6;
      for (let radius = 20; radius < size / 2; radius += 24) {
        context.beginPath();
        context.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
        context.stroke();
      }
    };

    // Source paths rather than the bundle: the dev server transforms these on
    // demand, and the deploy base is configurable, so it is derived from the
    // page rather than written out. A computed specifier gives back `any`, so
    // the module shapes are restated here.
    const sourceBase = new URL('.', location.href).href;
    const [fingerprint, descriptor] = (await Promise.all([
      import(`${sourceBase}src/services/imageFingerprint.ts`),
      import(`${sourceBase}src/utils/imageDescriptor.ts`)
    ])) as [FingerprintModule, DescriptorModule];

    const original = await canvasBlob(barChart([0.3, 0.55, 0.4, 0.7, 0.5]));
    const edited = await canvasBlob(barChart([0.3, 0.55, 0.4, 0.25, 0.5]));
    const unrelated = await canvasBlob(rings);
    // Re-encoding the same drawing in the same browser reproduces the same
    // bytes, which is the shape an untouched image arrives in.
    const untouched = await canvasBlob(barChart([0.3, 0.55, 0.4, 0.7, 0.5]));

    const table = await fingerprint.fingerprintDocumentImages([
      { id: 'blob:original', blob: original },
      { id: 'blob:edited', blob: edited },
      { id: 'blob:unrelated', blob: unrelated },
      { id: 'blob:untouched', blob: untouched }
    ]);

    const get = (key: string) => {
      const value = table.get(key);
      if (!value) throw new Error(`missing descriptor for ${key}`);
      return value;
    };

    return {
      decoded: Boolean(get('blob:original').visual && get('blob:edited').visual),
      sameHash: get('blob:original').hash === get('blob:untouched').hash,
      editedScore: descriptor.compareImageDescriptors(get('blob:original'), get('blob:edited')),
      unrelatedScore: descriptor.compareImageDescriptors(get('blob:original'), get('blob:unrelated')),
      pairThreshold: descriptor.IMAGE_PAIR_THRESHOLD,
      cosmeticThreshold: descriptor.IMAGE_COSMETIC_THRESHOLD
    };
  });

  // The decoder actually ran, rather than the whole thing degrading to hashes.
  expect(result.decoded).toBe(true);
  expect(result.sameHash).toBe(true);

  // The same chart with one bar moved is still the same figure, and changed.
  expect(result.editedScore).toBeGreaterThan(result.pairThreshold);
  expect(result.editedScore).toBeLessThan(result.cosmeticThreshold);

  // An unrelated figure is not a revision of it.
  expect(result.unrelatedScore).toBeLessThan(result.pairThreshold);
});
