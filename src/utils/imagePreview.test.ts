import { describe, expect, it } from 'vitest';
import { resolveImagePreview } from './imagePreview';

function root(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body;
}

describe('resolveImagePreview', () => {
  it('uses the paired occurrence even when sources repeat or image positions differ', () => {
    const original = root('<img src="blob:shared" data-ddv-image-pair="pair-2" data-ddv-image-change="unchanged">');
    const revised = root(
      '<img src="blob:shared" data-ddv-image-pair="pair-1" alt="Earlier copy">' +
        '<img src="blob:inserted" data-ddv-image-pair="pair-new">' +
        '<img src="blob:shared" data-ddv-image-pair="pair-2" alt="Matching copy">'
    );
    const image = original.querySelector('img')!;
    const result = resolveImagePreview('A', image, revised, true);
    expect(result.kind).toBe('unchanged');
    expect(result.images.B?.alt).toBe('Matching copy');
    expect(resolveImagePreview('A', image, revised, false)).toMatchObject({
      compared: false,
      kind: 'uncompared',
      images: { B: null }
    });
  });

  it('leaves uncertain matches empty and keeps an unsupported counterpart distinguishable', () => {
    const original = root('<img src="blob:chart" data-ddv-image-pair="pair-1" data-ddv-image-change="revised">');
    const image = original.querySelector('img')!;
    expect(resolveImagePreview('A', image, root('<img src="blob:unrelated">'), true)).toMatchObject({
      kind: 'unmatched',
      images: { B: null }
    });
    const revised = root('<img data-ddv-image-pair="pair-1" data-ddv-unrenderable alt="Equation">');
    expect(resolveImagePreview('A', image, revised, true)).toMatchObject({
      kind: 'revised',
      images: { B: { src: '', alt: 'Equation' } }
    });
    image.setAttribute('data-ddv-image-similarity', '0.83');
    expect(resolveImagePreview('A', image, revised, true).similarity).toBeUndefined();
    revised.querySelector('img')!.setAttribute('src', 'blob:revised');
    expect(resolveImagePreview('A', image, revised, true).similarity).toBe(0.83);
    for (const invalid of ['NaN', 'Infinity', '-0.1', '1.1']) {
      image.setAttribute('data-ddv-image-similarity', invalid);
      expect(resolveImagePreview('A', image, revised, true).similarity).toBeUndefined();
    }
    image.setAttribute('data-ddv-image-change', 'deleted');
    expect(resolveImagePreview('A', image, null, true)).toMatchObject({
      kind: 'deleted',
      images: { B: null }
    });
  });
});
