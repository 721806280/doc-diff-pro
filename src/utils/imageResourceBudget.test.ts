import { describe, expect, it } from 'vitest';
import { createImageResourceBudget, MAX_IMAGE_BYTES } from './imageResourceBudget';

describe('shared image resource budget', () => {
  const small = { width: 10, height: 10, byteLength: 100 };
  it.each([
    [{ ...small, width: 0 }, 'unknown-dimensions'],
    [{ ...small, height: -1 }, 'unknown-dimensions'],
    [{ ...small, width: Infinity }, 'unknown-dimensions'],
    [{ ...small, width: Infinity, resourcePixels: 100 }, 'unknown-dimensions'],
    [{ ...small, resourcePixels: -1 }, 'unknown-dimensions'],
    [{ ...small, resourcePixels: 0 }, 'unknown-dimensions'],
    [{ ...small, resourcePixels: NaN }, 'unknown-dimensions'],
    [{ ...small, byteLength: MAX_IMAGE_BYTES + 1 }, 'image-bytes'],
    [{ ...small, width: 10000, height: 4100 }, 'image-pixels'],
    [{ ...small, resourceLimit: 'image-pixels' as const }, 'image-pixels'],
    [{ ...small, resourcePixels: 41_000_000 }, 'image-pixels']
  ])('rejects unverifiable or oversized resources without spending the document budget', (image, issue) => {
    const admit = createImageResourceBudget();
    expect(admit(image)).toBe(issue);
    for (let index = 0; index < 4; index++) expect(admit({ ...small, width: 8000, height: 5000 })).toBeUndefined();
  });

  it('allows the limits exactly and rejects images over the cumulative pixel budget', () => {
    const admit = createImageResourceBudget();
    for (let index = 0; index < 4; index++) {
      expect(admit({ width: 8000, height: 5000, byteLength: MAX_IMAGE_BYTES })).toBeUndefined();
    }
    expect(admit(small)).toBe('document-pixels');
  });
});
