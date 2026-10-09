import type { PaneSide } from '@/types/document';

export type ImageSize = { width: number; height: number };
export type ImagePoint = { x: number; y: number };
/** A null scale follows the fitted size as the canvas resizes. Coordinates are normalized screen axes. */
export type ImageView = ImagePoint & { scale: number | null; rotation: number; flipX: boolean; flipY: boolean };
export type ResolvedImageView = ImageView & { scale: number };
export type ImageViews = Record<PaneSide, ImageView>;
export type OrientationAction = 'left' | 'right' | 'horizontal' | 'vertical';

type ViewportContext = {
  images: Record<PaneSide, ImageSize | null>;
  sizes: Record<PaneSide, ImageSize>;
  linked: boolean;
};

export const FIT_IMAGE_VIEW: ImageView = { scale: null, x: 0.5, y: 0.5, rotation: 0, flipX: false, flipY: false };
export const EMPTY_IMAGE_SIZE: ImageSize = { width: 0, height: 0 };
export const MAX_IMAGE_SCALE = 8;
const CANVAS_PADDING = 24;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function orientedSize(image: ImageSize | null, rotation: number): ImageSize {
  if (!image) return EMPTY_IMAGE_SIZE;
  return rotation % 180 === 0 ? image : { width: image.height, height: image.width };
}

export function fitScale(image: ImageSize | null, viewport: ImageSize, rotation: number): number {
  const { width, height } = orientedSize(image, rotation);
  if (!width || !height || !viewport.width || !viewport.height) return 1;
  return Math.max(
    0.001,
    Math.min(1, (viewport.width - CANVAS_PADDING * 2) / width, (viewport.height - CANVAS_PADDING * 2) / height)
  );
}

export function resolveView(view: ImageView, image: ImageSize | null, viewport: ImageSize): ResolvedImageView {
  const fit = fitScale(image, viewport, view.rotation);
  const scale = Math.max(fit, view.scale ?? fit);
  const { width, height } = orientedSize(image, view.rotation);
  const limit = (length: number, available: number) =>
    length > 0 ? Math.max(0, (length - available + CANVAS_PADDING * 2) / (2 * length)) : 0;
  const limitX = limit(width * scale, viewport.width);
  const limitY = limit(height * scale, viewport.height);
  return {
    ...view,
    scale,
    x: clamp(view.x, 0.5 - limitX, 0.5 + limitX),
    y: clamp(view.y, 0.5 - limitY, 0.5 + limitY)
  };
}

/** Zoom around an offset from the canvas center, sharing the applied ratio with a linked peer. */
export function zoomImageViews(
  views: ImageViews,
  { images, sizes, linked }: ViewportContext,
  side: PaneSide,
  factor: number,
  offset: ImagePoint
): ImageViews {
  const image = images[side];
  if (!image?.width || !image.height) return views;
  const current = resolveView(views[side], image, sizes[side]);
  const frame = orientedSize(image, current.rotation);
  const fit = fitScale(image, sizes[side], current.rotation);
  const scale = clamp(current.scale * factor, fit, MAX_IMAGE_SCALE);
  if (scale === current.scale) return views;
  const ratio = scale / current.scale;
  const next = resolveView(
    {
      ...current,
      scale,
      x: current.x + (offset.x / frame.width) * (1 / current.scale - 1 / scale),
      y: current.y + (offset.y / frame.height) * (1 / current.scale - 1 / scale)
    },
    image,
    sizes[side]
  );
  const result = { ...views, [side]: { ...next, scale: scale === fit ? null : scale } };
  const other = side === 'A' ? 'B' : 'A';
  if (linked) {
    const peer = resolveView(views[other], images[other], sizes[other]);
    const peerFit = fitScale(images[other], sizes[other], peer.rotation);
    const peerScale = clamp(peer.scale * ratio, peerFit, MAX_IMAGE_SCALE);
    result[other] = { ...views[other], x: next.x, y: next.y, scale: peerScale === peerFit ? null : peerScale };
  }
  return result;
}

export function panImageViews(
  views: ImageViews,
  { images, sizes, linked }: ViewportContext,
  side: PaneSide,
  delta: ImagePoint
): ImageViews {
  const image = images[side];
  if (!image?.width || !image.height) return views;
  const current = resolveView(views[side], image, sizes[side]);
  const frame = orientedSize(image, current.rotation);
  const next = resolveView(
    {
      ...current,
      x: current.x - delta.x / (frame.width * current.scale),
      y: current.y - delta.y / (frame.height * current.scale)
    },
    image,
    sizes[side]
  );
  if (next.x === current.x && next.y === current.y) return views;
  const result = { ...views, [side]: next };
  const other = side === 'A' ? 'B' : 'A';
  if (linked) result[other] = { ...views[other], x: next.x, y: next.y };
  return result;
}

export function orientImageViews(
  views: ImageViews,
  { images, sizes, linked }: ViewportContext,
  side: PaneSide,
  action: OrientationAction
): ImageViews {
  const result = { ...views };
  const targets: PaneSide[] = linked ? ['A', 'B'] : [side];
  for (const target of targets) {
    const current = resolveView(views[target], images[target], sizes[target]);
    const next = { ...current, scale: views[target].scale };
    if (action === 'left' || action === 'right') {
      const clockwise = action === 'right';
      next.rotation = (current.rotation + (clockwise ? 90 : 270)) % 360;
      // Flips use screen axes. Swap them so clockwise remains clockwise for a
      // mirrored image, while keeping the viewed point centered.
      next.flipX = current.flipY;
      next.flipY = current.flipX;
      next.x = clockwise ? 1 - current.y : current.y;
      next.y = clockwise ? current.x : 1 - current.x;
    } else if (action === 'horizontal') {
      next.flipX = !current.flipX;
      next.x = 1 - current.x;
    } else {
      next.flipY = !current.flipY;
      next.y = 1 - current.y;
    }
    result[target] = next;
  }
  return result;
}

/** Match relative zoom and center without discarding either image's orientation correction. */
export function linkImageViews(views: ImageViews, { images, sizes }: ViewportContext, side: PaneSide): ImageViews {
  const current = resolveView(views[side], images[side], sizes[side]);
  const other = side === 'A' ? 'B' : 'A';
  const sourceFit = fitScale(images[side], sizes[side], current.rotation);
  const peerFit = fitScale(images[other], sizes[other], views[other].rotation);
  return {
    ...views,
    [other]: {
      ...views[other],
      x: current.x,
      y: current.y,
      scale: views[side].scale === null ? null : clamp((current.scale / sourceFit) * peerFit, peerFit, MAX_IMAGE_SCALE)
    }
  };
}
