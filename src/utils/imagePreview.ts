import type { PaneSide } from '@/types/document';
import type { ImageDifferenceKind } from './imageAlignment';
import { IMAGE_CHANGE_ATTRIBUTE, IMAGE_PAIR_ATTRIBUTE, IMAGE_SIMILARITY_ATTRIBUTE } from './textDiffCore';

export type PreviewImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type ImagePreview = {
  side: PaneSide;
  compared: boolean;
  kind: ImageDifferenceKind | 'unmatched' | 'uncompared';
  /** An estimate from decoded visual features, not the fraction of unchanged pixels. */
  similarity?: number;
  images: Record<PaneSide, PreviewImage | null>;
};

/** Resolve the clicked occurrence, never its ordinal or a reused image source. */
export function resolveImagePreview(
  side: PaneSide,
  image: HTMLImageElement,
  otherPane: ParentNode | null,
  compared: boolean
): ImagePreview {
  const pairId = compared ? image.getAttribute(IMAGE_PAIR_ATTRIBUTE) : null;
  const counterpart = pairId
    ? Array.from(otherPane?.querySelectorAll<HTMLImageElement>(`img[${IMAGE_PAIR_ATTRIBUTE}]`) ?? []).find(
        (candidate) => candidate.getAttribute(IMAGE_PAIR_ATTRIBUTE) === pairId
      )
    : undefined;
  const marker = pairId ? image.getAttribute(IMAGE_CHANGE_ATTRIBUTE) : null;
  let kind: ImagePreview['kind'] = compared ? 'unmatched' : 'uncompared';
  if (marker === 'inserted' || marker === 'deleted') kind = marker;
  else if (counterpart) {
    kind = marker === 'unchanged' || marker === 'revised' || marker === 'moved' ? marker : 'uncompared';
  }

  const score = image.getAttribute(IMAGE_SIMILARITY_ATTRIBUTE);
  const similarity = score === null ? Number.NaN : Number(score);
  return {
    side,
    compared,
    kind,
    similarity:
      kind === 'revised' &&
      counterpart?.getAttribute('src') &&
      Number.isFinite(similarity) &&
      similarity >= 0 &&
      similarity <= 1
        ? similarity
        : undefined,
    images: {
      A: readImage(side === 'A' ? image : counterpart),
      B: readImage(side === 'B' ? image : counterpart)
    }
  };
}

function readImage(image: HTMLImageElement | undefined): PreviewImage | null {
  if (!image) return null;
  return {
    src: image.currentSrc || image.getAttribute('src') || '',
    alt: image.alt,
    width: image.naturalWidth || Number(image.getAttribute('width')) || 0,
    height: image.naturalHeight || Number(image.getAttribute('height')) || 0
  };
}
