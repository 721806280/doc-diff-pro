import type { DiffGranularity, DiffSummary, LayoutNoiseItem, LayoutNoiseSide, LayoutNoiseSource } from '@/types/diff';
import { applyDiffMarkup } from '@/utils/diffMarkup';
import { createTextDiffsAsync } from './diffWorkerClient';
import { buildTextMapping, collapseWhitespace, normalizeText, type TextMapping } from '@/utils/documentText';
import {
  createEmptyLayoutNoise,
  removeLayoutNoise,
  type LayoutNoiseData,
  type LayoutNoiseEntry,
  type LayoutNoiseHints
} from '@/utils/layoutNoise';
import { DIFF_DELETE, DIFF_INSERT, summarizeDiffs } from '@/utils/textDiffCore';
import { throwIfAborted, yieldToBrowser } from '@/utils/comparisonScheduling';
import { refineDiffGroups } from '@/utils/diffGroupStructure';
import {
  alignDocumentImages,
  markImageDifferences,
  summarizeImageAlignment,
  type ImageDescriptorsBySide
} from '@/utils/imageAlignment';

export type LayoutNoiseBySide = Record<LayoutNoiseSide, LayoutNoiseData>;

export type CompareOptions = {
  granularity: DiffGranularity;
  ignoreSpaces: boolean;
  ignoreFullHalfWidth: boolean;
  filterLayoutNoise: boolean;
  layoutNoise: LayoutNoiseBySide;
  /**
   * Image fingerprints taken when each document was parsed. Absent means images
   * are left out of the comparison: by then the markup points at object URLs and
   * the pixels are no longer reachable, so this is the only way they can be.
   */
  images?: ImageDescriptorsBySide;
  /** Localized word for an image, for the label a review list shows. */
  imageLabel?: string;
  /** Stops the comparison at the next phase boundary when a newer one starts. */
  signal?: AbortSignal;
};

export type CompareResult = {
  originalHtml: string;
  revisedHtml: string;
  summary: DiffSummary;
};

/**
 * Runs one comparison end to end and returns both documents marked up.
 *
 * The phases are: parse and strip layout noise, flatten each side to text, diff
 * that text in the worker, apply the markup, pair the images, then regroup the
 * differences into the units the reader steps through. Only the diff itself
 * leaves the main thread — everything either side of it needs the DOM — so the
 * phases hand the thread back between them, which is also where a superseded
 * run notices it has been replaced and stops.
 *
 * The two summaries are not redundant: the text diff counts changed runs of
 * characters, and refineDiffGroups then splits and merges those to respect
 * table cells and paragraph boundaries, which is the count the reader sees.
 * Image differences join before that, so they are counted the same way.
 */
export async function compareDocuments(
  originalHtml: string,
  revisedHtml: string,
  options: CompareOptions
): Promise<CompareResult> {
  const signal = options.signal;
  const parser = new DOMParser();
  const originalDom = parser.parseFromString(originalHtml, 'text/html').body;
  const revisedDom = parser.parseFromString(revisedHtml, 'text/html').body;
  const hints = mergeHints(options.layoutNoise);
  const originalRemoval = removeLayoutNoise(originalDom, {
    hints,
    enabled: options.filterLayoutNoise
  });
  const revisedRemoval = removeLayoutNoise(revisedDom, {
    hints,
    enabled: options.filterLayoutNoise
  });

  await yieldToBrowser(signal);
  const originalTrack = prepareDocumentText(originalDom, options);
  await yieldToBrowser(signal);
  const revisedTrack = prepareDocumentText(revisedDom, options);

  const diffs = await createTextDiffsAsync(
    { text: originalTrack.text, boundaries: originalTrack.boundaries },
    { text: revisedTrack.text, boundaries: revisedTrack.boundaries },
    options.granularity
  );
  throwIfAborted(signal);
  const summary = summarizeDiffs(diffs, options.granularity, originalTrack.text.length, revisedTrack.text.length);
  const nativeNoiseItems = [
    ...withSide(options.layoutNoise.original.nativeItems, 'original', 'native'),
    ...withSide(options.layoutNoise.revised.nativeItems, 'revised', 'native')
  ];
  const bodyNoiseItems = options.filterLayoutNoise
    ? [
        ...withSide(originalRemoval.removedItems, 'original', 'body'),
        ...withSide(revisedRemoval.removedItems, 'revised', 'body')
      ]
    : [];
  summary.layoutNoiseItems = groupItems([...nativeNoiseItems, ...bodyNoiseItems]);
  summary.layoutNoiseFiltered = summary.layoutNoiseItems.reduce((total, item) => total + item.count, 0);

  await yieldToBrowser(signal);
  applyDiffMarkup(originalDom, originalTrack.mapping, diffs, DIFF_DELETE, 'del');
  await yieldToBrowser(signal);
  applyDiffMarkup(revisedDom, revisedTrack.mapping, diffs, DIFF_INSERT, 'ins');

  // After the text markup and before the groups are refined: the image pass
  // produces the same `<del>`/`<ins>` elements, so refinement scopes, pairs and
  // renumbers image differences alongside the text ones without knowing that is
  // what it is doing.
  await yieldToBrowser(signal);
  const imageAlignment = options.images ? alignDocumentImages(originalDom, revisedDom, options.images) : [];
  markImageDifferences(imageAlignment, { label: options.imageLabel });
  summary.images = summarizeImageAlignment(imageAlignment);

  await yieldToBrowser(signal);
  const refinedSummary = refineDiffGroups(originalDom, revisedDom, {
    granularity: options.granularity,
    ignoreSpaces: options.ignoreSpaces,
    ignoreFullHalfWidth: options.ignoreFullHalfWidth
  });
  summary.total = refinedSummary.total;
  summary.inserted = refinedSummary.inserted;
  summary.deleted = refinedSummary.deleted;
  summary.modified = refinedSummary.modified;

  return {
    originalHtml: originalDom.innerHTML,
    revisedHtml: revisedDom.innerHTML,
    summary
  };
}

export function createEmptyLayoutNoiseBySide(): LayoutNoiseBySide {
  return {
    original: createEmptyLayoutNoise(),
    revised: createEmptyLayoutNoise()
  };
}

function mergeHints(layoutNoise: LayoutNoiseBySide): LayoutNoiseHints {
  return {
    exact: [...layoutNoise.original.hints.exact, ...layoutNoise.revised.hints.exact],
    fragments: [...layoutNoise.original.hints.fragments, ...layoutNoise.revised.hints.fragments]
  };
}

type SidedNoiseItem = Omit<LayoutNoiseItem, 'count'>;

function withSide(items: LayoutNoiseEntry[], side: LayoutNoiseSide, source: LayoutNoiseSource): SidedNoiseItem[] {
  return items.map((item) => ({ ...item, side, source }));
}

function groupItems(items: SidedNoiseItem[]): LayoutNoiseItem[] {
  const groupedItems = new Map<string, LayoutNoiseItem>();

  items.forEach((item) => {
    const key = `${item.side}\u0000${item.source}\u0000${item.reason}\u0000${item.text}`;
    const existingItem = groupedItems.get(key);

    if (existingItem) {
      existingItem.count++;
      return;
    }

    groupedItems.set(key, { ...item, count: 1 });
  });

  return Array.from(groupedItems.values());
}

function prepareDocumentText(root: HTMLElement, options: CompareOptions): TextMapping {
  const textMapping = buildTextMapping(root);
  const track = options.ignoreSpaces ? collapseWhitespace(textMapping) : textMapping;

  return {
    // Every substitution normalization makes is one character for one, so the
    // block boundaries recorded above still point where they did.
    text: normalizeText(track.text, options.ignoreFullHalfWidth, false),
    mapping: track.mapping,
    boundaries: track.boundaries
  };
}
