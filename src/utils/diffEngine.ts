import type { DiffGranularity, DiffSummary } from '@/types/diff';
import { applyDiffMarkup } from './diffMarkup';
import { createTextDiffsAsync } from './diffWorkerClient';
import { buildTextMapping, collapseWhitespace, normalizeText, type TextMapping } from './documentText';
import { DIFF_DELETE, DIFF_INSERT, summarizeDiffs } from './textDiffCore';

export type CompareOptions = {
  granularity: DiffGranularity;
  ignoreSpaces: boolean;
  ignoreFullHalfWidth: boolean;
  ignoreCase: boolean;
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
  const originalTrack = prepareDocumentText(originalDom, options);
  const revisedTrack = prepareDocumentText(revisedDom, options);
  const diffs = await createTextDiffsAsync(originalTrack.text, revisedTrack.text, options.granularity);
  const summary = summarizeDiffs(
    diffs,
    options.granularity,
    originalTrack.text.length,
    revisedTrack.text.length
  );

  return {
    originalHtml: applyDiffMarkup(originalDom, originalTrack.mapping, diffs, DIFF_DELETE, 'del'),
    revisedHtml: applyDiffMarkup(revisedDom, revisedTrack.mapping, diffs, DIFF_INSERT, 'ins'),
    summary
  };
}

function prepareDocumentText(root: HTMLElement, options: CompareOptions): TextMapping {
  const textMapping = buildTextMapping(root);
  const track = options.ignoreSpaces ? collapseWhitespace(textMapping) : textMapping;

  return {
    text: normalizeText(track.text, options.ignoreFullHalfWidth, options.ignoreCase),
    mapping: track.mapping
  };
}
