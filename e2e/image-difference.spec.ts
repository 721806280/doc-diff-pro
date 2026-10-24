import { expect, test } from '@playwright/test';

type DifferenceModule = typeof import('../src/utils/imageDifference');

test('keeps crop coordinates, normalizes proportional sizes and bounds large overlays', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const base = new URL('.', location.href).href;
    const { renderImageDifference, imageDifferenceRenderSize } = (await import(
      `${base}src/utils/imageDifference.ts`
    )) as DifferenceModule;
    const drawing = (width: number, height: number, scale = 1, transparent = false) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      if (!transparent) {
        context.fillStyle = '#fff';
        context.fillRect(0, 0, width, height);
      }
      context.fillStyle = '#111';
      context.fillRect(40 * scale, 30 * scale, 20 * scale, 20 * scale);
      return canvas;
    };
    const compare = async (left: HTMLCanvasElement, right: HTMLCanvasElement) => {
      const canvas = document.createElement('canvas');
      const rendered = await renderImageDifference(
        left.toDataURL(),
        right.toDataURL(),
        {
          width: Math.max(left.width, right.width),
          height: Math.max(left.height, right.height)
        },
        canvas
      );
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      let transparent = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index]! > data[index + 1]! + 12 && data[index]! > data[index + 2]! + 12) red++;
        if (data[index + 3] !== 255) transparent++;
      }
      return { rendered, red, transparent };
    };
    const original = drawing(120, 100);
    const cropped = await compare(original, drawing(100, 100));
    const reexported = await compare(original, drawing(240, 200, 2));
    const transparent = await compare(original, drawing(120, 100, 1, true));
    const revised = drawing(120, 100);
    revised.getContext('2d')!.fillRect(80, 70, 10, 10);
    const changed = await compare(original, revised);
    const largeSource = drawing(4096, 1200).toDataURL();
    const largeCanvas = document.createElement('canvas');
    const largeRendered = await renderImageDifference(
      largeSource,
      largeSource,
      { width: 4096, height: 1200 },
      largeCanvas
    );

    const controller = new AbortController();
    const target = document.createElement('canvas');
    target.width = target.height = 1;
    const context = target.getContext('2d')!;
    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, 1, 1);
    const source = original.toDataURL();
    const pending = renderImageDifference(source, source, { width: 4000, height: 4000 }, target, controller.signal);
    controller.abort();
    const aborted = await pending;
    return {
      cropped,
      reexported,
      transparent,
      changed,
      largeRendered,
      largeOutput: { width: largeCanvas.width, height: largeCanvas.height },
      aborted,
      unchangedTarget: Array.from(context.getImageData(0, 0, 1, 1).data),
      large: imageDifferenceRenderSize({ width: 8000, height: 8000 }),
      panoramic: imageDifferenceRenderSize({ width: 80_000, height: 200 })
    };
  });
  expect(result.cropped).toEqual({ rendered: true, red: 0, transparent: 0 });
  expect(result.reexported).toEqual({ rendered: true, red: 0, transparent: 0 });
  expect(result.transparent).toEqual({ rendered: true, red: 0, transparent: 0 });
  expect(result.changed.rendered).toBe(true);
  expect(result.changed.red).toBeGreaterThan(50);
  expect(result.largeRendered).toBe(true);
  expect(result.largeOutput.width * result.largeOutput.height).toBeLessThanOrEqual(4_000_000);
  expect(result.largeOutput.width).toBeLessThan(4096);
  expect(result.aborted).toBe(false);
  expect(result.unchangedTarget).toEqual([0, 255, 0, 255]);
  expect(result.large.width * result.large.height).toBeLessThanOrEqual(4_000_000);
  expect(Math.max(result.panoramic.width, result.panoramic.height)).toBeLessThanOrEqual(4096);
});
