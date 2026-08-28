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
import { alignSequences } from './tableAlignment';
import { createEmptyImageComparisonSummary, IMAGE_DIFF_ATTRIBUTE } from './textDiffCore';

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
 * Above this many candidate pairs the alignment falls back to position. Lower
 * than the table ceiling because the per-pair comparison here reads a few
 * hundred bytes of descriptor rather than two integers.
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
 * Only images the reader can actually see.
 *
 * An `<img>` without a `src` is one the sanitizer rejected — a vector graphic
 * Word supplied as EMF, most often. There is nothing to compare and nothing on
 * the page, so it is counted elsewhere and left out here.
 */
export function collectDocumentImages(root: HTMLElement): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>('img[src]'));
}

export function alignDocumentImages(
  originalRoot: HTMLElement,
  revisedRoot: HTMLElement,
  descriptors: ImageDescriptorsBySide
): ImageAlignmentEntry[] {
  const original = collectDocumentImages(originalRoot);
  const revised = collectDocumentImages(revisedRoot);
  if (original.length === 0 && revised.length === 0) return [];

  const descriptorOf = (image: HTMLImageElement, side: keyof ImageDescriptorsBySide) =>
    descriptors[side].get(image.getAttribute('src') ?? '');

  const aligned = alignSequences(
    original,
    revised,
    (left, right) => pairScore(descriptorOf(left, 'original'), descriptorOf(right, 'revised')),
    { matchThreshold: IMAGE_PAIR_THRESHOLD, gapPenalty: IMAGE_GAP_PENALTY, maxPairs: MAX_IMAGE_ALIGNMENT_PAIRS }
  ).map((pair) => {
    const originalDescriptor = pair.original ? descriptorOf(pair.original, 'original') : undefined;
    const revisedDescriptor = pair.revised ? descriptorOf(pair.revised, 'revised') : undefined;

    return {
      ...pair,
      originalDescriptor,
      revisedDescriptor,
      kind: classifyPair(pair.original, pair.revised, originalDescriptor, revisedDescriptor),
      similarity: pair.original && pair.revised ? pairScore(originalDescriptor, revisedDescriptor) : 1
    };
  });

  return mergeMovedImages(aligned);
}

/**
 * Rejoins a figure that moved past another one.
 *
 * The alignment preserves order, which is what stops one inserted figure from
 * cascading — and is also why it cannot see a move: a figure that crossed its
 * neighbours can only be reported as gone from one place and arrived in another.
 * A second pass over what stayed unpaired recovers it, exactly as
 * `mergeMovedTableGroups` recovers a table row that moved.
 *
 * Only where the bytes are identical and unique on both sides. Two copies of the
 * same figure give no evidence about which became which, and this pass would
 * rather report a removal beside an addition than guess.
 */
function mergeMovedImages(entries: ImageAlignmentEntry[]): ImageAlignmentEntry[] {
  const byHash = (kind: ImageDifferenceKind, side: 'originalDescriptor' | 'revisedDescriptor') => {
    const found = new Map<string, number[]>();
    entries.forEach((entry, index) => {
      const hash = entry.kind === kind ? entry[side]?.hash : undefined;
      if (hash) found.set(hash, [...(found.get(hash) ?? []), index]);
    });
    return found;
  };

  const removed = byHash('deleted', 'originalDescriptor');
  const added = byHash('inserted', 'revisedDescriptor');
  const merged = new Set<number>();

  for (const [hash, removedIndices] of removed) {
    const addedIndices = added.get(hash);
    if (removedIndices.length !== 1 || addedIndices?.length !== 1) continue;

    const from = entries[removedIndices[0] ?? -1];
    const to = entries[addedIndices[0] ?? -1];
    if (!from?.original || !to?.revised) continue;

    from.revised = to.revised;
    from.revisedDescriptor = to.revisedDescriptor;
    from.kind = 'moved';
    merged.add(addedIndices[0] ?? -1);
  }

  return merged.size === 0 ? entries : entries.filter((_entry, index) => !merged.has(index));
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

  for (const entry of entries) {
    if (entry.kind === 'unchanged') continue;

    const groupId = `image-${group++}`;
    if (entry.original) wrapImage(entry.original, 'del', groupId, entry, options.label);
    if (entry.revised) wrapImage(entry.revised, 'ins', groupId, entry, options.label);
  }

  return group - (options.startIndex ?? 1);
}

function wrapImage(
  image: HTMLImageElement,
  tag: 'del' | 'ins',
  groupId: string,
  entry: ImageAlignmentEntry,
  label: string | undefined
): void {
  const wrapper = image.ownerDocument.createElement(tag);
  wrapper.dataset.diffId = groupId;
  wrapper.setAttribute(IMAGE_DIFF_ATTRIBUTE, describeImage(entry, tag, label));

  image.parentNode?.insertBefore(wrapper, image);
  wrapper.appendChild(image);
}

/**
 * The text a review list shows in place of the image, since an image group has
 * no text of its own to preview.
 */
function describeImage(entry: ImageAlignmentEntry, tag: 'del' | 'ins', label: string | undefined): string {
  const descriptor = tag === 'del' ? entry.originalDescriptor : entry.revisedDescriptor;
  const size = descriptor && descriptor.width > 0 ? `${descriptor.width}×${descriptor.height}` : '';

  return [label, size].filter(Boolean).join(' ');
}

/**
 * Whether a revision only re-encoded the image rather than redrawing it.
 *
 * Never used to hide a difference — a figure whose bytes changed did change,
 * and saying so is the job. It marks the ones a reader can most likely pass
 * over quickly.
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
