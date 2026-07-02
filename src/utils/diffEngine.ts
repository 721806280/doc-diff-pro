import type { DiffGranularity, DiffSummary, LayoutNoiseItem, LayoutNoiseSide } from '@/types/diff';
import { applyDiffMarkup } from './diffMarkup';
import { createTextDiffsAsync } from './diffWorkerClient';
import { buildTextMapping, collapseWhitespace, normalizeText, type TextMapping } from './documentText';
import { removeLayoutNoise, type LayoutNoiseHints } from './layoutNoise';
import { DIFF_DELETE, DIFF_INSERT, summarizeDiffs } from './textDiffCore';

export type CompareOptions = {
  granularity: DiffGranularity;
  ignoreSpaces: boolean;
  ignoreFullHalfWidth: boolean;
  filterLayoutNoise: boolean;
  layoutNoiseHints: LayoutNoiseHints;
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
  const filteredOriginal = removeLayoutNoise(originalDom, {
    hints: options.layoutNoiseHints,
    enabled: options.filterLayoutNoise
  });
  const filteredRevised = removeLayoutNoise(revisedDom, {
    hints: options.layoutNoiseHints,
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
  summary.layoutNoiseFiltered = filteredOriginal.filteredCount + filteredRevised.filteredCount;
  summary.layoutNoiseItems = [
    ...toLayoutNoiseItems(filteredOriginal.items, 'original'),
    ...toLayoutNoiseItems(filteredRevised.items, 'revised')
  ];

  return {
    originalHtml: applyDiffMarkup(originalDom, originalTrack.mapping, diffs, DIFF_DELETE, 'del'),
    revisedHtml: applyDiffMarkup(revisedDom, revisedTrack.mapping, diffs, DIFF_INSERT, 'ins'),
    summary
  };
}

function toLayoutNoiseItems(
  items: Array<{ reason: LayoutNoiseItem['reason']; text: string }>,
  side: LayoutNoiseSide
): LayoutNoiseItem[] {
  const groupedItems = new Map<string, LayoutNoiseItem>();

  items.forEach((item) => {
    const key = `${item.reason}\u0000${item.text}`;
    const existingItem = groupedItems.get(key);

    if (existingItem) {
      existingItem.count++;
      return;
    }

    groupedItems.set(key, { ...item, side, count: 1 });
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
