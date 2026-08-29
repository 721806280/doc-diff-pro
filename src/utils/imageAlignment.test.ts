import { describe, expect, it } from 'vitest';
import {
  alignDocumentImages,
  collectDocumentImages,
  markImageDifferences,
  summarizeImageAlignment,
  type ImageDescriptorsBySide
} from './imageAlignment';
import {
  createImageVisualDescriptor,
  IMAGE_COLOR_SIZE,
  IMAGE_SAMPLE_SIZE,
  type ImageDescriptor
} from './imageDescriptor';

function bodyFromHtml(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body;
}

/**
 * Markup with one fingerprinted `<img>` per id, in the order given, as
 * `adoptInlineImages` leaves it.
 */
function documentWith(...ids: string[]): HTMLElement {
  return bodyFromHtml(ids.map((id) => `<p><img data-ddv-image-id="${id}" src="${id}" alt="figure"></p>`).join(''));
}

/**
 * A descriptor whose visual columns come from a plane with `ink` fraction of its
 * rows darkened, so two descriptors built from different fractions genuinely
 * look unlike each other rather than merely carrying different hashes.
 */
function descriptor(hash: string, ink: number, options: { width?: number; height?: number } = {}): ImageDescriptor {
  const gray = new Float32Array(IMAGE_SAMPLE_SIZE * IMAGE_SAMPLE_SIZE).fill(1);
  const inkRows = Math.round(ink * IMAGE_SAMPLE_SIZE);
  for (let row = 0; row < inkRows; row++) {
    for (let column = 0; column < IMAGE_SAMPLE_SIZE; column++) {
      gray[row * IMAGE_SAMPLE_SIZE + column] = 0.1;
    }
  }

  return {
    hash,
    width: options.width ?? 400,
    height: options.height ?? 400,
    byteLength: 1024,
    visual: createImageVisualDescriptor({
      gray,
      color: new Float32Array(IMAGE_COLOR_SIZE * IMAGE_COLOR_SIZE * 3).fill(1 - ink)
    })
  };
}

function sides(
  original: Record<string, ImageDescriptor>,
  revised: Record<string, ImageDescriptor>
): ImageDescriptorsBySide {
  return { original: new Map(Object.entries(original)), revised: new Map(Object.entries(revised)) };
}

describe('collectDocumentImages', () => {
  it('leaves out an image that was never fingerprinted', () => {
    // No stamped id means the parse could not read its bytes, so there is
    // nothing to compare it by.
    const body = bodyFromHtml('<p><img data-ddv-image-id="a" src="a"></p><p><img alt="unreadable"></p>');

    expect(collectDocumentImages(body)).toHaveLength(1);
  });

  it('includes a figure that has no source because nothing can draw it', () => {
    // An EMF equation keeps its fingerprint and loses its source. Comparing it is
    // the whole point: the bytes say whether it changed.
    const body = bodyFromHtml('<p><img data-ddv-image-id="a" data-ddv-unrenderable=""></p>');

    expect(collectDocumentImages(body)).toHaveLength(1);
  });
});

describe('alignDocumentImages', () => {
  it('reports nothing for two documents with no images', () => {
    expect(alignDocumentImages(bodyFromHtml('<p>text</p>'), bodyFromHtml('<p>text</p>'), sides({}, {}))).toEqual([]);
  });

  it('calls an image with unchanged bytes unchanged, whatever its source url', () => {
    // Object URLs never match across two parses, so byte identity is the only
    // thing that can carry "this is the same image".
    const entries = alignDocumentImages(
      documentWith('blob:left'),
      documentWith('blob:right'),
      sides({ 'blob:left': descriptor('same', 0.4) }, { 'blob:right': descriptor('same', 0.4) })
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('unchanged');
  });

  it('calls a paired image with different bytes revised, and scores it', () => {
    const entries = alignDocumentImages(
      documentWith('blob:left'),
      documentWith('blob:right'),
      sides({ 'blob:left': descriptor('before', 0.4) }, { 'blob:right': descriptor('after', 0.42) })
    );

    expect(entries[0]?.kind).toBe('revised');
    expect(entries[0]?.similarity).toBeLessThan(1);
    expect(entries[0]?.similarity).toBeGreaterThan(0);
  });

  it('does not let an inserted image cascade into every figure below it', () => {
    // The failure that pairing by index would produce: insert a figure near the
    // top and every figure after it reads as replaced.
    const entries = alignDocumentImages(
      documentWith('blob:a', 'blob:b', 'blob:c'),
      documentWith('blob:new', 'blob:a2', 'blob:b2', 'blob:c2'),
      sides(
        { 'blob:a': descriptor('a', 0.2), 'blob:b': descriptor('b', 0.5), 'blob:c': descriptor('c', 0.8) },
        {
          'blob:new': descriptor('new', 0.35),
          'blob:a2': descriptor('a', 0.2),
          'blob:b2': descriptor('b', 0.5),
          'blob:c2': descriptor('c', 0.8)
        }
      )
    );

    expect(entries.map((entry) => entry.kind)).toEqual(['inserted', 'unchanged', 'unchanged', 'unchanged']);
  });

  it('reports a deleted figure on the original side alone', () => {
    const entries = alignDocumentImages(
      documentWith('blob:a', 'blob:b'),
      documentWith('blob:b2'),
      sides({ 'blob:a': descriptor('a', 0.2), 'blob:b': descriptor('b', 0.7) }, { 'blob:b2': descriptor('b', 0.7) })
    );

    expect(entries.map((entry) => entry.kind)).toEqual(['deleted', 'unchanged']);
    expect(entries[0]?.revised).toBeUndefined();
  });

  it('refuses to pair two figures with nothing in common', () => {
    const entries = alignDocumentImages(
      documentWith('blob:chart'),
      documentWith('blob:photo'),
      sides({ 'blob:chart': descriptor('chart', 0.08) }, { 'blob:photo': descriptor('photo', 0.92) })
    );

    // One gone and one arrived rather than one revised. Which of the two the
    // traceback reports first is not meaningful — they are unrelated images at
    // the same position, and document order is restored downstream.
    expect(entries.map((entry) => entry.kind).sort()).toEqual(['deleted', 'inserted']);
  });

  it('keeps an undecoded image paired rather than reporting it twice', () => {
    const undecoded = (hash: string): ImageDescriptor => ({ hash, width: 400, height: 400, byteLength: 10 });
    const entries = alignDocumentImages(
      documentWith('blob:left'),
      documentWith('blob:right'),
      sides({ 'blob:left': undecoded('before') }, { 'blob:right': undecoded('after') })
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('revised');
  });

  it('says nothing about a pair it has no fingerprint for', () => {
    // No evidence either way, so no claim: inventing a difference here would put
    // a marker on every image in documents the fingerprinter could not read.
    const entries = alignDocumentImages(documentWith('blob:left'), documentWith('blob:right'), sides({}, {}));

    expect(entries[0]?.kind).toBe('unchanged');
  });
});

describe('markImageDifferences', () => {
  it('wraps changed images in the same elements the text diff uses', () => {
    const original = documentWith('blob:left');
    const revised = documentWith('blob:right');
    const entries = alignDocumentImages(
      original,
      revised,
      sides({ 'blob:left': descriptor('before', 0.4) }, { 'blob:right': descriptor('after', 0.45) })
    );

    markImageDifferences(entries, { label: '图片' });

    expect(original.querySelector('del[data-diff-id] img')).toBeTruthy();
    expect(revised.querySelector('ins[data-diff-id] img')).toBeTruthy();
    // One difference, so both sides carry the same group id.
    expect(original.querySelector('del')?.dataset.diffId).toBe(revised.querySelector('ins')?.dataset.diffId);
  });

  it('labels the wrapper so a review list has something to show', () => {
    const original = documentWith('blob:left');
    const entries = alignDocumentImages(
      original,
      documentWith('blob:right'),
      sides(
        { 'blob:left': descriptor('before', 0.4, { width: 1024, height: 768 }) },
        { 'blob:right': descriptor('after', 0.45, { width: 800, height: 600 }) }
      )
    );

    markImageDifferences(entries, { label: '图片' });

    expect(original.querySelector('del')?.getAttribute('data-diff-image')).toBe('图片 1024×768');
  });

  it('leaves unchanged images untouched', () => {
    const original = documentWith('blob:left');
    const entries = alignDocumentImages(
      original,
      documentWith('blob:right'),
      sides({ 'blob:left': descriptor('same', 0.4) }, { 'blob:right': descriptor('same', 0.4) })
    );

    expect(markImageDifferences(entries)).toBe(0);
    expect(original.querySelector('del, ins')).toBeNull();
  });

  it('numbers each difference separately from the group before it', () => {
    const original = documentWith('blob:a', 'blob:b');
    const entries = alignDocumentImages(
      original,
      documentWith('blob:a2', 'blob:b2'),
      sides(
        { 'blob:a': descriptor('a', 0.2), 'blob:b': descriptor('b', 0.7) },
        { 'blob:a2': descriptor('a-new', 0.22), 'blob:b2': descriptor('b-new', 0.72) }
      )
    );

    expect(markImageDifferences(entries, { startIndex: 5 })).toBe(2);
    const ids = Array.from(original.querySelectorAll('del'), (element) => element.dataset.diffId);
    expect(ids).toEqual(['image-5', 'image-6']);
  });
});

describe('moved figures', () => {
  it('rejoins a figure that moved past its neighbours', () => {
    // The alignment preserves order, so a figure that crossed another can only
    // come out of it as gone from one place and arrived in another. This is the
    // second pass that recovers it.
    const entries = alignDocumentImages(
      documentWith('blob:chart', 'blob:logo'),
      documentWith('blob:logo2', 'blob:chart2'),
      sides(
        { 'blob:chart': descriptor('chart', 0.2), 'blob:logo': descriptor('logo', 0.85) },
        { 'blob:logo2': descriptor('logo', 0.85), 'blob:chart2': descriptor('chart', 0.2) }
      )
    );

    const moved = entries.filter((entry) => entry.kind === 'moved');
    expect(moved).toHaveLength(1);
    expect(moved[0]?.original).toBeTruthy();
    expect(moved[0]?.revised).toBeTruthy();
    // One difference rather than a removal beside an addition.
    expect(entries.some((entry) => entry.kind === 'deleted' || entry.kind === 'inserted')).toBe(false);
  });

  it('marks a moved figure on both sides under one difference', () => {
    const original = documentWith('blob:chart', 'blob:logo');
    const revised = documentWith('blob:logo2', 'blob:chart2');
    const entries = alignDocumentImages(
      original,
      revised,
      sides(
        { 'blob:chart': descriptor('chart', 0.2), 'blob:logo': descriptor('logo', 0.85) },
        { 'blob:logo2': descriptor('logo', 0.85), 'blob:chart2': descriptor('chart', 0.2) }
      )
    );

    markImageDifferences(entries);

    expect(original.querySelector('del')?.dataset.diffId).toBe(revised.querySelector('ins')?.dataset.diffId);
  });

  it('does not call a deleted duplicate a move', () => {
    // Three figures down to one: a copy of the repeated figure and the unrelated
    // one are genuinely gone. Neither has a counterpart that arrived, so neither
    // is a move — the pass needs an addition to rejoin, not just a hash it has
    // seen before.
    const entries = alignDocumentImages(
      documentWith('blob:a', 'blob:b', 'blob:c'),
      documentWith('blob:c2'),
      sides(
        {
          'blob:a': descriptor('twin', 0.3),
          'blob:b': descriptor('twin', 0.3),
          'blob:c': descriptor('other', 0.9)
        },
        { 'blob:c2': descriptor('twin', 0.3) }
      )
    );

    expect(entries.some((entry) => entry.kind === 'moved')).toBe(false);
    expect(entries.filter((entry) => entry.kind === 'deleted')).toHaveLength(2);
  });

  it('counts a move separately from a revision', () => {
    const entries = alignDocumentImages(
      documentWith('blob:chart', 'blob:logo'),
      documentWith('blob:logo2', 'blob:chart2'),
      sides(
        { 'blob:chart': descriptor('chart', 0.2), 'blob:logo': descriptor('logo', 0.85) },
        { 'blob:logo2': descriptor('logo', 0.85), 'blob:chart2': descriptor('chart', 0.2) }
      )
    );

    const summary = summarizeImageAlignment(entries);
    expect(summary.moved).toBe(1);
    expect(summary.revised).toBe(0);
    expect(summary.deleted).toBe(0);
    expect(summary.inserted).toBe(0);
  });
});

describe('summarizeImageAlignment', () => {
  it('counts each outcome, and how many revisions are only cosmetic', () => {
    const entries = alignDocumentImages(
      documentWith('blob:a', 'blob:b', 'blob:gone'),
      documentWith('blob:a2', 'blob:b2', 'blob:new'),
      sides(
        {
          'blob:a': descriptor('a', 0.4),
          'blob:b': descriptor('b', 0.4),
          'blob:gone': descriptor('gone', 0.05)
        },
        {
          'blob:a2': descriptor('a', 0.4),
          // Same figure, different bytes, and visually indistinguishable: the
          // shape a converter's re-encode takes.
          'blob:b2': descriptor('b-reencoded', 0.4),
          'blob:new': descriptor('new', 0.95)
        }
      )
    );

    const summary = summarizeImageAlignment(entries);

    expect(summary.paired).toBe(2);
    expect(summary.revised).toBe(1);
    expect(summary.cosmetic).toBe(1);
    expect(summary.deleted).toBe(1);
    expect(summary.inserted).toBe(1);
  });
});
