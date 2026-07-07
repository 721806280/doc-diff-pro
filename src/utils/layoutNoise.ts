export type LayoutNoiseResult = {
  html: string;
  layoutNoise: LayoutNoiseData;
};

export type LayoutNoiseHints = {
  exact: string[];
  fragments: string[];
};

export type LayoutNoiseData = {
  hints: LayoutNoiseHints;
  nativeItems: LayoutNoiseEntry[];
};

export type LayoutNoiseFilterOptions = {
  hints: LayoutNoiseHints;
  enabled: boolean;
};

export type LayoutNoiseRemoval = {
  filteredCount: number;
  removedItems: LayoutNoiseEntry[];
};

export type LayoutNoiseFilterReason = 'hint' | 'page-number' | 'repeated-layout-text';

export type LayoutNoiseEntry = {
  reason: LayoutNoiseFilterReason;
  text: string;
};

type LayoutHintIndex = {
  exact: Set<string>;
  fragments: Set<string>;
};

const MAX_HINT_LENGTH = 160;
const MIN_FRAGMENT_HINT_LENGTH = 6;
const MAX_REPEAT_LINE_LENGTH = 80;
const MIN_REPEAT_COUNT = 2;
const PAGE_NUMBER_PATTERN =
  /^(?:(?:page|p)\s*)?(?:第\s*)?[0-9０-９一二三四五六七八九十百千万]+\s*(?:页|pages?|page)?(?:\s*(?:\/|of|共)\s*[0-9０-９一二三四五六七八九十百千万]+\s*(?:页|pages?)?)?$/i;
const SIMPLE_NUMBER_PATTERN = /^[0-9０-９一二三四五六七八九十百千万]+$/;
const PAGE_MARKER_PATTERN = /(页|pages?|page|of|共|\/)/i;
const DECORATED_NUMBER_PATTERN = /^[-_–—]+\s*[0-9０-９一二三四五六七八九十百千万]+\s*[-_–—]+$/;
const LAYOUT_KEYWORD_PATTERN =
  /(confidential|copyright|all rights reserved|内部资料|保密|版权所有|机密|页眉|页脚)/i;
const CONTACT_OR_IDENTIFIER_PATTERN =
  /(www\.|https?:\/\/|电话|传真|编号|文件号|版本|tel[:：]|fax[:：]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i;
const CANDIDATE_BLOCK_SELECTOR = 'p, div, li, td, th';
const HINT_SPLIT_PATTERN = /[;；,，|｜]/;
const LEADING_PAGE_TEXT_PATTERN =
  /^\s*(?:[-_–—]*\s*)?(?:(?:page|p)\s*)?(?:第\s*)?[0-9０-９一二三四五六七八九十百千万]+\s*(?:页|pages?|page)?(?:\s*(?:\/|of|共)\s*[0-9０-９一二三四五六七八九十百千万]+\s*(?:页|pages?)?)?\s*(?:[-_–—]*\s*)?/i;

export function extractLayoutNoise(html: string): LayoutNoiseResult {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const exactHints = new Set<string>();
  const fragmentHints = new Set<string>();
  const nativeItems: LayoutNoiseEntry[] = [];

  body.querySelectorAll<HTMLElement>('header, footer').forEach((element) => {
    collectHintText(element, exactHints, fragmentHints);
    collectNativeItems(element, nativeItems);
    element.remove();
  });

  return {
    html: body.innerHTML,
    layoutNoise: {
      hints: {
        exact: Array.from(exactHints),
        fragments: Array.from(fragmentHints)
      },
      nativeItems
    }
  };
}

export function createEmptyLayoutNoise(): LayoutNoiseData {
  return {
    hints: { exact: [], fragments: [] },
    nativeItems: []
  };
}

export function removeLayoutNoise(
  root: HTMLElement,
  options: LayoutNoiseFilterOptions
): LayoutNoiseRemoval {
  if (!options.enabled) return { filteredCount: 0, removedItems: [] };

  const normalizedHints = normalizeHints(options.hints);
  const candidates = collectCandidateBlocks(root);
  const frequencies = countNormalizedText(candidates);
  const removedItems: LayoutNoiseEntry[] = [];
  let filteredCount = 0;

  for (const element of candidates) {
    if (!element.isConnected) continue;

    const rawText = element.textContent ?? '';
    const normalized = normalizeLayoutText(rawText);
    if (!normalized) continue;

    const reason = classifyLayoutArtifact(rawText, normalized, normalizedHints, frequencies);
    if (reason) {
      removedItems.push({ reason, text: normalizeDisplayText(rawText) });
      element.remove();
      filteredCount++;
    }
  }

  return { filteredCount, removedItems };
}

export function normalizeLayoutText(text: string): string {
  const normalized = text
    .normalize('NFKC')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();

  return normalized.replace(/[.,;:!?，。；：！？、'"“”‘’()[\]{}<>《》（）【】\-_–—]/g, '');
}

function collectHintText(
  element: HTMLElement,
  exactHints: Set<string>,
  fragmentHints: Set<string>
): void {
  collectExactHintsFromText(element.textContent ?? '', exactHints);
  collectFragmentHintsFromText(element.textContent ?? '', fragmentHints);

  element.querySelectorAll<HTMLElement>(CANDIDATE_BLOCK_SELECTOR).forEach((child) => {
    collectExactHintsFromText(child.textContent ?? '', exactHints);
    collectFragmentHintsFromText(child.textContent ?? '', fragmentHints);
  });
}

function collectNativeItems(
  element: HTMLElement,
  items: LayoutNoiseEntry[]
): void {
  const candidateBlocks = Array.from(element.querySelectorAll<HTMLElement>(CANDIDATE_BLOCK_SELECTOR))
    .filter((child) => !hasCandidateBlockChild(child));
  const textSources = candidateBlocks.length > 0 ? candidateBlocks : [element];

  textSources.forEach((source) => {
    const text = normalizeDisplayText(source.textContent ?? '');
    const normalized = normalizeLayoutText(text);
    if (!isUsableHint(normalized)) return;

    items.push({ reason: 'hint', text });
  });
}

function collectExactHintsFromText(text: string, hints: Set<string>): void {
  const normalized = normalizeLayoutText(text);
  if (isUsableHint(normalized)) hints.add(text.trim());

  const withoutPageText = text.normalize('NFKC').replace(LEADING_PAGE_TEXT_PATTERN, '').trim();
  const normalizedWithoutPage = normalizeLayoutText(withoutPageText);
  if (isUsableHint(normalizedWithoutPage)) hints.add(withoutPageText);
}

function collectFragmentHintsFromText(text: string, hints: Set<string>): void {
  const withoutPageText = text.normalize('NFKC').replace(LEADING_PAGE_TEXT_PATTERN, '').trim();
  withoutPageText
    .split(HINT_SPLIT_PATTERN)
    .map((part) => part.trim())
    .filter(isUsableFragmentHint)
    .forEach((hint) => hints.add(hint));
}

function isUsableHint(text: string): boolean {
  return text.length > 0 && text.length <= MAX_HINT_LENGTH;
}

function isUsableFragmentHint(text: string): boolean {
  const normalized = normalizeLayoutText(text);
  return normalized.length >= MIN_FRAGMENT_HINT_LENGTH && normalized.length <= MAX_HINT_LENGTH;
}

function normalizeHints(hints: LayoutNoiseHints): LayoutHintIndex {
  const normalizedHints: LayoutHintIndex = {
    exact: new Set(),
    fragments: new Set()
  };

  hints.exact.forEach((hint) => {
    addNormalizedHint(hint, normalizedHints.exact, isUsableHint);
    collectFragmentHintsFromText(hint, normalizedHints.fragments);
  });
  hints.fragments.forEach((hint) => {
    addNormalizedHint(hint, normalizedHints.fragments, isUsableFragmentHint);
  });

  return normalizedHints;
}

function addNormalizedHint(
  hint: string,
  hints: Set<string>,
  predicate: (text: string) => boolean
): void {
  const normalized = normalizeLayoutText(hint);
  if (predicate(normalized)) hints.add(normalized);
}

function collectCandidateBlocks(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CANDIDATE_BLOCK_SELECTOR))
    .filter((element) => !hasCandidateBlockChild(element));
}

function hasCandidateBlockChild(element: HTMLElement): boolean {
  return Array.from(element.children).some((child) =>
    child instanceof HTMLElement && child.matches(CANDIDATE_BLOCK_SELECTOR)
  );
}

function countNormalizedText(elements: HTMLElement[]): Map<string, number> {
  const frequencies = new Map<string, number>();

  elements.forEach((element) => {
    const normalized = normalizeLayoutText(element.textContent ?? '');
    if (!normalized || normalized.length > MAX_REPEAT_LINE_LENGTH) return;
    frequencies.set(normalized, (frequencies.get(normalized) ?? 0) + 1);
  });

  return frequencies;
}

function classifyLayoutArtifact(
  rawText: string,
  normalized: string,
  hints: LayoutHintIndex,
  frequencies: Map<string, number>
): LayoutNoiseFilterReason | null {
  if (matchesLayoutHint(rawText, normalized, hints)) return 'hint';
  if (isPageNumber(rawText)) return 'page-number';

  const frequency = frequencies.get(normalized) ?? 0;
  if (frequency < MIN_REPEAT_COUNT || normalized.length > MAX_REPEAT_LINE_LENGTH) return null;

  return LAYOUT_KEYWORD_PATTERN.test(normalized) || CONTACT_OR_IDENTIFIER_PATTERN.test(normalized)
    ? 'repeated-layout-text'
    : null;
}

function normalizeDisplayText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isPageNumber(text: string): boolean {
  const pageText = normalizePageText(text);
  if (pageText.length === 0 || pageText.length > 32) return false;
  if (DECORATED_NUMBER_PATTERN.test(pageText)) return true;
  if (!PAGE_NUMBER_PATTERN.test(pageText)) return false;
  if (SIMPLE_NUMBER_PATTERN.test(pageText)) return false;

  return PAGE_MARKER_PATTERN.test(pageText);
}

function hasPageMarker(text: string): boolean {
  const pageText = normalizePageText(text);
  return DECORATED_NUMBER_PATTERN.test(pageText) || PAGE_MARKER_PATTERN.test(pageText);
}

function normalizePageText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchesLayoutHint(rawText: string, normalized: string, hints: LayoutHintIndex): boolean {
  if (normalized.length > MAX_HINT_LENGTH) return false;
  if (hints.exact.has(normalized)) return true;
  if (!hasPageMarker(rawText)) return false;

  for (const hint of hints.fragments) {
    if (hint.length < MIN_FRAGMENT_HINT_LENGTH) continue;
    if (normalized.includes(hint) || hint.includes(normalized)) return true;
  }

  return false;
}
