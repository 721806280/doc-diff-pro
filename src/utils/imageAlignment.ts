/**
 * Pairs the images of two documents against each other, and marks the ones that
 * changed.
 *
 * Images are invisible to the text diff and always have been: an `<img>`
 * contributes no characters, so flattening a document for comparison drops it
 * entirely and a figure that was replaced produces no difference at all. This
 * is the pass that gives them a voice.
 *
 * It is deliberately a separate pass rather than a sentinel character injected
 * into the diff text. Two reasons, both decisive. Character alignment can only
 * express equality, and image identity is a distance — "the same chart with one
 * bar moved" has no spelling. And diff-match-patch's cleanup passes eliminate
 * short equalities caught between edits, which is exactly what a one-character
 * image placeholder is: edit the paragraph above a figure and the caption below
 * it, and the untouched figure between them would be reported as replaced.
 *
 * Shape follows `tableAlignment`, down to sharing its alignment routine, because
 * the problem is the same one: line two sequences up end to end, allowing for
 * things added and removed, without an insertion near the top cascading into
 * every item below it.
 */

import type { ImageComparisonSummary } from '@/types/diff';
import {
  compareImageDescriptors,
  IMAGE_COSMETIC_THRESHOLD,
  IMAGE_PAIR_THRESHOLD,
  type ImageDescriptor,
  type ImageDescriptorTable
} from './imageDescriptor';
import { UNRENDERABLE_IMAGE_ATTRIBUTE } from './sanitizeDocumentHtml';
import { alignSequences } from './tableAlignment';
import {
  createEmptyImageComparisonSummary,
  IMAGE_CHANGE_ATTRIBUTE,
  IMAGE_DIFF_ATTRIBUTE,
  IMAGE_ID_ATTRIBUTE,
  IMAGE_PAIR_ATTRIBUTE,
  IMAGE_SIMILARITY_ATTRIBUTE
} from './textDiffCore';

/**
 * What leaving an image unpaired costs, charged once per side.
 *
 * Derived from the pairing threshold rather than chosen beside it: skipping both
 * sides costs twice this, so at exactly half the threshold the alignment prefers
 * to pair whenever the threshold allows it to and never otherwise. The two
 * constants cannot drift apart.
 */
const IMAGE_GAP_PENALTY = IMAGE_PAIR_THRESHOLD / 2;

/**
 * Bound similarity work in each gap between exact matches. Long documents
 * normally leave only a handful of changed figures after anchoring by hash.
 */
const MAX_IMAGE_ALIGNMENT_PAIRS = 250_000;

/**
 * What the alignment scores a pair at when it cannot see either image.
 *
 * High enough to pair, so that an image nobody could decode stays lined up with
 * its counterpart instead of cascading into a deletion plus an insertion, and
 * far enough below cosmetic that it is never mistaken for evidence.
 */
const UNKNOWN_PAIR_SCORE = 0.75;

export type ImageDifferenceKind = 'unchanged' | 'revised' | 'moved' | 'inserted' | 'deleted';

export type ImageAlignmentEntry = {
  original?: HTMLImageElement;
  revised?: HTMLImageElement;
  originalDescriptor?: ImageDescriptor;
  revisedDescriptor?: ImageDescriptor;
  kind: ImageDifferenceKind;
  /** How alike the pair is, or 1 for an image that only exists on one side. */
  similarity: number;
};

export type ImageDescriptorsBySide = {
  original: ImageDescriptorTable;
  revised: ImageDescriptorTable;
};

/**
 * Every figure that was fingerprinted, whether or not it can be drawn.
 *
 * Keyed off the stamped id rather than the `src`, so an EMF equation — which
 * loses its source because no browser renders it — is still compared. Its bytes
 * say whether it changed, which is the question, and a figure whose change goes
 * unreported is worse than one that cannot be shown.
 */
export function collectDocumentImages(root: HTMLElement): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>(`img[${IMAGE_ID_ATTRIBUTE}]`));
}

export function alignDocumentImages(
  originalRoot: HTMLElement,
  revisedRoot: HTMLElement,
  descriptors: ImageDescriptorsBySide
): ImageAlignmentEntry[] {
  const occurrences = (root: HTMLElement, table: ImageDescriptorTable): ImageOccurrence[] =>
    collectDocumentImages(root).map((image, index) => ({
      image,
      index,
      descriptor: table.get(image.getAttribute(IMAGE_ID_ATTRIBUTE) ?? '')
    }));
  const original = occurrences(originalRoot, descriptors.original);
  const revised = occurrences(revisedRoot, descriptors.revised);
  if (original.length === 0 && revised.length === 0) return [];

  const { anchors, moved, candidates } = exactImagePairs(original, revised);
  const movedOriginal = new Set(moved.map((pair) => pair.original));
  const movedRevised = new Set(moved.map((pair) => pair.revised));
  const exactOriginal = new Set(candidates.map((pair) => pair.original));
  const exactRevised = new Set(candidates.map((pair) => pair.revised));
  const similarity = (left: ImageOccurrence, right: ImageOccurrence) => {
    // Repeated exact figures can cross anchors without proving which copy
    // moved. They may pair by identity inside a gap, but cannot become a
    // revision of another figure just because that looks similar.
    if (left.descriptor?.hash !== right.descriptor?.hash && (exactOriginal.has(left) || exactRevised.has(right)))
      return 0;
    return pairScore(left.descriptor, right.descriptor);
  };
  const entries: ImageAlignmentEntry[] = [];
  let originalStart = 0;
  let revisedStart = 0;

  const appendGap = (originalEnd: number, revisedEnd: number) => {
    const left = original.slice(originalStart, originalEnd).filter((image) => !movedOriginal.has(image));
    const right = revised.slice(revisedStart, revisedEnd).filter((image) => !movedRevised.has(image));
    const pairs = alignSequences(left, right, similarity, {
      matchThreshold: IMAGE_PAIR_THRESHOLD,
      gapPenalty: IMAGE_GAP_PENALTY,
      maxPairs: MAX_IMAGE_ALIGNMENT_PAIRS
    });
    for (const pair of pairs) {
      // The bounded positional fallback still has to meet the visual threshold.
      if (pair.original && pair.revised && similarity(pair.original, pair.revised) < IMAGE_PAIR_THRESHOLD) {
        entries.push(imageEntry(pair.original), imageEntry(undefined, pair.revised));
      } else entries.push(imageEntry(pair.original, pair.revised));
    }
  };

  for (const anchor of anchors) {
    appendGap(anchor.original.index, anchor.revised.index);
    entries.push(imageEntry(anchor.original, anchor.revised));
    originalStart = anchor.original.index + 1;
    revisedStart = anchor.revised.index + 1;
  }
  appendGap(original.length, revised.length);
  // Moved figures are reserved before similarity matching so another figure
  // cannot steal either endpoint. Markup refinement restores document order.
  for (const pair of moved) entries.push({ ...imageEntry(pair.original, pair.revised), kind: 'moved' });
  return entries;
}

type ImageOccurrence = { image: HTMLImageElement; index: number; descriptor?: ImageDescriptor };
type ExactImagePair = { original: ImageOccurrence; revised: ImageOccurrence; unique: boolean };

/** Exact identity takes precedence over any number of approximate matches. */
function exactImagePairs(original: ImageOccurrence[], revised: ImageOccurrence[]) {
  const byHash = (images: ImageOccurrence[]) => {
    const groups = new Map<string, ImageOccurrence[]>();
    for (const image of images) {
      if (!image.descriptor) continue;
      const hash = image.descriptor.hash;
      const group = groups.get(hash);
      if (group) group.push(image);
      else groups.set(hash, [image]);
    }
    return groups;
  };
  const left = byHash(original);
  const right = byHash(revised);
  const offsets = new Map<string, number>();
  const candidates: ExactImagePair[] = [];
  for (const image of original) {
    const hash = image.descriptor?.hash;
    if (hash === undefined) continue;
    const index = offsets.get(hash) ?? 0;
    const peer = right.get(hash)?.[index];
    if (!peer) continue;
    offsets.set(hash, index + 1);
    candidates.push({
      original: image,
      revised: peer,
      unique: left.get(hash)?.length === 1 && right.get(hash)?.length === 1
    });
  }

  // Length of the increasing run starting at each candidate, in O(n log n).
  // Recovering forwards preserves the earliest occurrence when runs tie.
  const lengths = new Uint32Array(candidates.length);
  const tails: number[] = [];
  for (let index = candidates.length - 1; index >= 0; index--) {
    const value = -candidates[index]!.revised.index;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (tails[middle]! < value) low = middle + 1;
      else high = middle;
    }
    tails[low] = value;
    lengths[index] = low + 1;
  }
  const anchors: ExactImagePair[] = [];
  const moved: ExactImagePair[] = [];
  let remaining = tails.length;
  let previous = -1;
  candidates.forEach((pair, index) => {
    if (remaining > 0 && pair.revised.index > previous && lengths[index]! >= remaining) {
      anchors.push(pair);
      previous = pair.revised.index;
      remaining--;
    } else if (pair.unique) moved.push(pair);
  });
  return { anchors, moved, candidates };
}

function imageEntry(original?: ImageOccurrence, revised?: ImageOccurrence): ImageAlignmentEntry {
  return {
    original: original?.image,
    revised: revised?.image,
    originalDescriptor: original?.descriptor,
    revisedDescriptor: revised?.descriptor,
    kind: classifyPair(original?.image, revised?.image, original?.descriptor, revised?.descriptor),
    similarity: original && revised ? pairScore(original.descriptor, revised.descriptor) : 1
  };
}

function pairScore(left: ImageDescriptor | undefined, right: ImageDescriptor | undefined): number {
  if (!left || !right) return UNKNOWN_PAIR_SCORE;

  return compareImageDescriptors(left, right);
}

/**
 * Whether a paired image changed is decided by its hash, not by the similarity
 * score. The hash is exact, and it is the answer in the common case: an image
 * nobody touched is copied byte for byte from one document's package into the
 * next. The score only says how much a change is likely to matter.
 *
 * A pair missing a descriptor is reported as unchanged rather than as revised.
 * Without a fingerprint there is no evidence either way, and a diff tool that
 * invents differences it cannot substantiate is worse than one that misses them.
 */
function classifyPair(
  original: HTMLImageElement | undefined,
  revised: HTMLImageElement | undefined,
  originalDescriptor: ImageDescriptor | undefined,
  revisedDescriptor: ImageDescriptor | undefined
): ImageDifferenceKind {
  if (!original) return 'inserted';
  if (!revised) return 'deleted';
  if (!originalDescriptor || !revisedDescriptor) return 'unchanged';

  return originalDescriptor.hash === revisedDescriptor.hash ? 'unchanged' : 'revised';
}

export type ImageMarkupOptions = {
  /** Localized word for an image, prefixed to the label review lists show. */
  label?: string;
  /** Localized note for a figure that changed but cannot be drawn. */
  unrenderableLabel?: string;
  /** First group number to hand out; ids must not collide with the text diff's. */
  startIndex?: number;
};

/**
 * Wraps every changed image in `<del>` or `<ins>`, the same elements the text
 * diff produces.
 *
 * Reusing those tags is what lets the whole downstream — group refinement,
 * navigation, the difference map, the review list, the report — treat an image
 * difference as just another difference, without one of them learning a new
 * selector. The group ids handed out here are provisional: `refineDiffGroups`
 * renumbers every difference in document order once the markup is complete.
 */
export function markImageDifferences(
  entries: readonly ImageAlignmentEntry[],
  options: ImageMarkupOptions = {}
): number {
  let group = options.startIndex ?? 1;
  let pair = 0;

  for (const entry of entries) {
    const pairId = `image-pair-${++pair}`;
    const visualSimilarity =
      entry.originalDescriptor?.visual && entry.revisedDescriptor?.visual ? entry.similarity : undefined;
    for (const image of [entry.original, entry.revised]) {
      image?.setAttribute(IMAGE_PAIR_ATTRIBUTE, pairId);
      // Missing fingerprints are not evidence that two images are unchanged.
      image?.setAttribute(
        IMAGE_CHANGE_ATTRIBUTE,
        entry.original && entry.revised && (!entry.originalDescriptor || !entry.revisedDescriptor)
          ? 'uncompared'
          : entry.kind
      );
      if (visualSimilarity !== undefined) image?.setAttribute(IMAGE_SIMILARITY_ATTRIBUTE, String(visualSimilarity));
      else image?.removeAttribute(IMAGE_SIMILARITY_ATTRIBUTE);
    }
    if (entry.kind === 'unchanged') continue;

    const groupId = `image-${group++}`;
    if (entry.original) wrapImage(entry.original, 'del', groupId, entry, options);
    if (entry.revised) wrapImage(entry.revised, 'ins', groupId, entry, options);
  }

  return group - (options.startIndex ?? 1);
}

function wrapImage(
  image: HTMLImageElement,
  tag: 'del' | 'ins',
  groupId: string,
  entry: ImageAlignmentEntry,
  options: ImageMarkupOptions
): void {
  const wrapper = image.ownerDocument.createElement(tag);
  wrapper.dataset.diffId = groupId;
  wrapper.setAttribute(IMAGE_DIFF_ATTRIBUTE, describeImage(entry, tag, image, options));

  image.parentNode?.insertBefore(wrapper, image);
  wrapper.appendChild(image);
}

/**
 * The text a review list shows in place of the image, since an image group has
 * no text of its own to preview.
 *
 * A figure nothing can draw has no dimensions either — the container header a
 * metafile carries is not one this reader parses — so it is named for what it is
 * instead. Saying "cannot be previewed" is the difference between a reader
 * knowing a figure changed and wondering why the row is blank.
 */
function describeImage(
  entry: ImageAlignmentEntry,
  tag: 'del' | 'ins',
  image: HTMLImageElement,
  options: ImageMarkupOptions
): string {
  const descriptor = tag === 'del' ? entry.originalDescriptor : entry.revisedDescriptor;
  const size = descriptor && descriptor.width > 0 ? `${descriptor.width}×${descriptor.height}` : '';
  const note = image.hasAttribute(UNRENDERABLE_IMAGE_ATTRIBUTE) ? options.unrenderableLabel : '';

  return [options.label, size, note].filter(Boolean).join(' ');
}

/**
 * Legacy summary heuristic for high visual similarity. It cannot establish
 * that an image was only re-encoded, and must never hide a difference or imply
 * that a small edit is unimportant.
 */
export function isCosmeticImageChange(entry: ImageAlignmentEntry): boolean {
  return entry.kind === 'revised' && entry.similarity >= IMAGE_COSMETIC_THRESHOLD;
}

export function summarizeImageAlignment(entries: readonly ImageAlignmentEntry[]): ImageComparisonSummary {
  const summary = createEmptyImageComparisonSummary();

  for (const entry of entries) {
    if (entry.original && entry.revised) summary.paired++;
    if (entry.kind === 'inserted') summary.inserted++;
    if (entry.kind === 'deleted') summary.deleted++;
    if (entry.kind === 'revised') summary.revised++;
    if (entry.kind === 'moved') summary.moved++;
    if (isCosmeticImageChange(entry)) summary.cosmetic++;
  }

  return summary;
}
