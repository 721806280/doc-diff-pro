import { describe, expect, it } from 'vitest';
import {
  FIT_IMAGE_VIEW,
  MAX_IMAGE_SCALE,
  fitScale,
  linkImageViews,
  orientImageViews,
  orientedSize,
  panImageViews,
  resolveView,
  zoomImageViews,
  type ImageViews
} from './imageViewport';

const context = {
  images: { A: { width: 960, height: 600 }, B: { width: 1920, height: 1200 } },
  sizes: { A: { width: 528, height: 348 }, B: { width: 528, height: 348 } },
  linked: false
};

describe('image viewport transformations', () => {
  it.each([
    ['left', 'right'],
    ['right', 'left'],
    ['horizontal', 'horizontal'],
    ['vertical', 'vertical']
  ] as const)('restores the viewed point and orientation after %s followed by %s', (first, inverse) => {
    const views: ImageViews = {
      A: { ...FIT_IMAGE_VIEW, scale: 2, x: 0.625, y: 0.375, rotation: 90, flipX: true },
      B: FIT_IMAGE_VIEW
    };

    const changed = orientImageViews(views, context, 'A', first);
    const restored = orientImageViews(changed, context, 'A', inverse);

    expect(restored).toEqual(views);
    expect(changed.B).toBe(views.B);
  });

  it.each([0, 90])(
    'keeps the detail under the pointer fixed while zooming a mirrored image at %s degrees',
    (rotation) => {
      const views: ImageViews = {
        A: { ...FIT_IMAGE_VIEW, scale: 1, rotation, flipX: true },
        B: FIT_IMAGE_VIEW
      };
      const offset = { x: 75, y: -40 };
      const next = zoomImageViews(views, context, 'A', 2, offset);
      const before = resolveView(views.A, context.images.A, context.sizes.A);
      const after = resolveView(next.A, context.images.A, context.sizes.A);
      const frame = orientedSize(context.images.A, rotation);

      expect(after.x + offset.x / (frame.width * after.scale)).toBeCloseTo(
        before.x + offset.x / (frame.width * before.scale)
      );
      expect(after.y + offset.y / (frame.height * after.scale)).toBeCloseTo(
        before.y + offset.y / (frame.height * before.scale)
      );
      expect(next.B).toBe(views.B);
    }
  );

  it('does not change either linked view when the driver is at its zoom or pan limit', () => {
    const linked = { ...context, linked: true };
    const fitted = { A: FIT_IMAGE_VIEW, B: FIT_IMAGE_VIEW };
    const maximum = { ...fitted, A: { ...FIT_IMAGE_VIEW, scale: MAX_IMAGE_SCALE } };

    expect(zoomImageViews(fitted, linked, 'A', 0.8, { x: 0, y: 0 })).toBe(fitted);
    expect(panImageViews(fitted, linked, 'A', { x: 40, y: 20 })).toBe(fitted);
    expect(zoomImageViews(maximum, linked, 'A', 1.25, { x: 0, y: 0 })).toBe(maximum);
  });

  it('leaves the views unchanged while the source image has no dimensions', () => {
    const views = { A: FIT_IMAGE_VIEW, B: FIT_IMAGE_VIEW };
    for (const image of [null, { width: 0, height: 600 }, { width: 960, height: 0 }]) {
      const pending = { ...context, images: { ...context.images, A: image } };
      expect(zoomImageViews(views, pending, 'A', 2, { x: 0, y: 0 })).toBe(views);
      expect(panImageViews(views, pending, 'A', { x: 40, y: 20 })).toBe(views);
    }
  });

  it('relinks different resolutions at equal relative zoom while preserving their independent orientations', () => {
    const views: ImageViews = {
      A: { ...FIT_IMAGE_VIEW, scale: 1, x: 0.625, y: 0.375, rotation: 90, flipX: true },
      B: { ...FIT_IMAGE_VIEW, scale: 0.4, rotation: 180, flipY: true }
    };
    const linked = linkImageViews(views, context, 'A');
    const visibleSource = resolveView(views.A, context.images.A, context.sizes.A);
    const sourceFit = fitScale(context.images.A, context.sizes.A, linked.A.rotation);
    const peerFit = fitScale(context.images.B, context.sizes.B, linked.B.rotation);

    expect(linked.A).toBe(views.A);
    expect(linked.B.scale! / peerFit).toBeCloseTo(linked.A.scale! / sourceFit);
    expect(linked.B).toMatchObject({
      x: visibleSource.x,
      y: visibleSource.y,
      rotation: 180,
      flipX: false,
      flipY: true
    });
  });
});
