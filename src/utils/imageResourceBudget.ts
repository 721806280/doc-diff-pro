/** Shared admission limits for fingerprinting, document rendering and previews. */
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
export const TOTAL_IMAGE_PIXEL_BUDGET = 160_000_000;
export const IMAGE_RESOURCE_LIMIT_ATTRIBUTE = 'data-ddv-image-resource-limit';

export type ImageResourceLimit = 'unknown-dimensions' | 'image-pixels' | 'image-bytes' | 'document-pixels';
export type ImageResourceInfo = {
  width: number;
  height: number;
  byteLength: number;
  /** Total pixels across the viewport and any embedded raster surfaces. */
  resourcePixels?: number;
  resourceLimit?: ImageResourceLimit;
};

/** Call once per distinct image in document order; rejected images spend nothing. */
export function createImageResourceBudget(): (image: ImageResourceInfo) => ImageResourceLimit | undefined {
  let spentPixels = 0;
  return (image) => {
    if (image.resourceLimit) return image.resourceLimit;
    if (image.byteLength > MAX_IMAGE_BYTES) return 'image-bytes';
    if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0)
      return 'unknown-dimensions';
    const viewportPixels = image.width * image.height;
    const pixels = image.resourcePixels ?? viewportPixels;
    if (!Number.isFinite(pixels) || pixels < viewportPixels) return 'unknown-dimensions';
    if (pixels > MAX_IMAGE_PIXELS) return 'image-pixels';
    if (spentPixels + pixels > TOTAL_IMAGE_PIXEL_BUDGET) return 'document-pixels';
    spentPixels += pixels;
    return undefined;
  };
}
