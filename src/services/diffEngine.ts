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
import { refineDiffGroups } from '@/utils/diffGroupStructure';

export type LayoutNoiseBySide = Record<LayoutNoiseSide, LayoutNoiseData>;

export type CompareOptions = {
  granularity: DiffGranularity;
  ignoreSpaces: boolean;
  ignoreFullHalfWidth: boolean;
  filterLayoutNoise: boolean;
  layoutNoise: LayoutNoiseBySide;
};

export type CompareResult = {
  originalHtml: string;
  revisedHtml: string;
  summary: DiffSummary;
};

export async function compareDocuments(
  originalHtml: string,
  revisedHtml: string,
  options: CompareOptions
): Promise<CompareResult> {
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
  const originalTrack = prepareDocumentText(originalDom, options);
  const revisedTrack = prepareDocumentText(revisedDom, options);
  const diffs = await createTextDiffsAsync(originalTrack.text, revisedTrack.text, options.granularity);
  const summary = summarizeDiffs(
    diffs,
    options.granularity,
    originalTrack.text.length,
    revisedTrack.text.length
  );
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

  applyDiffMarkup(originalDom, originalTrack.mapping, diffs, DIFF_DELETE, 'del');
  applyDiffMarkup(revisedDom, revisedTrack.mapping, diffs, DIFF_INSERT, 'ins');

  const refinedSummary = refineDiffGroups(originalDom, revisedDom);
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
    exact: [
      ...layoutNoise.original.hints.exact,
      ...layoutNoise.revised.hints.exact
    ],
    fragments: [
      ...layoutNoise.original.hints.fragments,
      ...layoutNoise.revised.hints.fragments
    ]
  };
}

type SidedNoiseItem = Omit<LayoutNoiseItem, 'count'>;

function withSide(
  items: LayoutNoiseEntry[],
  side: LayoutNoiseSide,
  source: LayoutNoiseSource
): SidedNoiseItem[] {
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
    text: normalizeText(track.text, options.ignoreFullHalfWidth, false),
    mapping: track.mapping
  };
}
