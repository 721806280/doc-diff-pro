import type {
  DiffChangeKind,
  DiffReviewContext,
  IgnoredDiffItem,
  SimilarDiffItem,
  SimilarDiffLevel
} from '@/types/diff';
import type { DiffElementGroup, DiffElementIndex } from './diffElementIndex';
import { longestCommonSubsequenceLength } from './longestCommonSubsequence';
import { diffId, parseDiffId } from './textDiffCore';

export const SIMILAR_DIFF_THRESHOLDS: Record<SimilarDiffLevel, number> = {
  strict: 0.86,
  balanced: 0.72,
  loose: 0.62
};

const MAX_SIMILAR_DIFFS = 12;
const PREVIEW_LIMIT = 86;

export type ReviewShortcut = 'previous' | 'next' | 'toggle-ignore';

/** A difference paired with the normalized text the similarity scan compares. */
export type ReviewSignature = {
  item: IgnoredDiffItem;
  signature: string;
};

export function resolveReviewShortcut(
  event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
): ReviewShortcut | null {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return null;

  if (event.altKey) {
    if (event.key === 'ArrowUp') return 'previous';
    if (event.key === 'ArrowDown') return 'next';
    return null;
  }

  return event.key.toLowerCase() === 'i' ? 'toggle-ignore' : null;
}

export function diffReviewId(index: number): string {
  return diffId(index);
}

export function diffReviewIndex(id: string): number {
  return parseDiffId(id);
}

export function sortReviewItems(items: Iterable<IgnoredDiffItem>): IgnoredDiffItem[] {
  return Array.from(items).sort((left, right) => left.index - right.index);
}

export function activeReviewCount(total: number, ignoredCount: number): number {
  return Math.max(0, total - ignoredCount);
}

export function activeReviewPosition(currentIndex: number, total: number, ignoredIds: Set<string>): number {
  const activeCount = activeReviewCount(total, ignoredIds.size);
  if (activeCount === 0 || currentIndex <= 0) return 0;

  let position = 0;
  for (let index = 1; index <= currentIndex; index++) {
    if (!ignoredIds.has(diffId(index))) position++;
  }

  return Math.min(Math.max(position, 1), activeCount);
}

export function findActiveReviewIndex(
  startIndex: number,
  direction: 1 | -1,
  total: number,
  ignoredIds: Set<string>
): number | null {
  for (let index = startIndex; index >= 1 && index <= total; index += direction) {
    if (!ignoredIds.has(diffId(index))) return index;
  }

  return null;
}

export function createReviewItem(index: number, group: DiffElementGroup | undefined): IgnoredDiffItem | null {
  if (!group) return null;

  return {
    id: diffId(index),
    index,
    kind: resolveReviewKind(group),
    originalPreview: previewElements(group.A),
    revisedPreview: previewElements(group.B),
    context: resolveReviewContext(group)
  };
}

export function findSimilarReviewItems(options: {
  currentIndex: number;
  signatures: readonly ReviewSignature[];
  ignoredIds: Set<string>;
  level: SimilarDiffLevel;
}): SimilarDiffItem[] {
  const current = options.signatures.find((entry) => entry.item.index === options.currentIndex);
  if (!current?.signature) return [];

  const threshold = SIMILAR_DIFF_THRESHOLDS[options.level];
  const candidates: SimilarDiffItem[] = [];

  for (const candidate of options.signatures) {
    if (candidate.item.index === options.currentIndex || options.ignoredIds.has(candidate.item.id)) continue;
    if (candidate.item.kind !== current.item.kind) continue;
    if (candidate.item.context !== current.item.context) continue;
    if (!canReachSimilarityThreshold(current.signature, candidate.signature, threshold)) continue;

    const similarity = compareReviewSignature(current.signature, candidate.signature);
    if (similarity < threshold) continue;

    candidates.push({ ...candidate.item, similarity });
  }

  return candidates
    .sort((left, right) => right.similarity - left.similarity || left.index - right.index)
    .slice(0, MAX_SIMILAR_DIFFS);
}

/**
 * Preview text and comparison signature for every difference, built once per
 * index rebuild.
 *
 * Deriving these inside the similarity scan meant re-reading `textContent`,
 * re-running `closest('table')` and re-normalizing for every difference in the
 * document on each press of the next/previous key — lag the reader feels
 * directly on a heavily edited document. None of it depends on which
 * difference is selected, so it now survives navigation untouched.
 */
export function buildReviewSignatures(
  total: number,
  getGroup: (index: number) => DiffElementGroup | undefined
): ReviewSignature[] {
  const signatures: ReviewSignature[] = [];

  for (let index = 1; index <= total; index++) {
    const item = createReviewItem(index, getGroup(index));
    if (!item) continue;

    signatures.push({ item, signature: createReviewSignature(item) });
  }

  return signatures;
}

export function setReviewClass(group: DiffElementGroup | undefined, className: string, enabled: boolean): void {
  if (!group) return;

  [...group.A, ...group.B].forEach((element) => {
    element.classList.toggle(className, enabled);
  });
}

export function clearReviewClass(index: DiffElementIndex, className: string): void {
  index.forEach((group) => {
    setReviewClass(group, className, false);
  });
}

export function firstReviewElement(group: DiffElementGroup | undefined, side: 'A' | 'B'): HTMLElement | null {
  return group?.[side][0] ?? null;
}

export function selectReviewElement(
  group: DiffElementGroup | undefined,
  preferredElement: HTMLElement | null,
  predicate: (element: HTMLElement) => boolean
): HTMLElement | null {
  if (!group) return null;

  const elements = [...group.A, ...group.B];
  if (preferredElement && elements.includes(preferredElement) && predicate(preferredElement)) {
    return preferredElement;
  }
  // Wrapped rather than passed directly: Array.find invokes its callback with
  // (element, index, array), and a predicate with a defaulted second parameter
  // would silently receive the index instead of its default.
  return elements.find((element) => predicate(element)) ?? null;
}

function resolveReviewKind(group: DiffElementGroup): DiffChangeKind {
  const hasOriginal = group.A.length > 0;
  const hasRevised = group.B.length > 0;

  if (hasOriginal && hasRevised) return 'modified';
  return hasRevised ? 'inserted' : 'deleted';
}

function resolveReviewContext(group: DiffElementGroup): DiffReviewContext {
  const firstElement = [...group.A, ...group.B][0];
  return firstElement?.closest('table') ? 'table' : 'body';
}

function previewElements(elements: HTMLElement[]): string {
  return truncateReviewPreview(
    elements
      .map((element) => element.textContent ?? '')
      .join(' / ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function truncateReviewPreview(text: string): string {
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT - 1)}...` : text;
}

function createReviewSignature(item: IgnoredDiffItem): string {
  const source =
    item.kind === 'inserted'
      ? item.revisedPreview
      : item.kind === 'deleted'
        ? item.originalPreview
        : `${item.originalPreview}\u0000${item.revisedPreview}`;

  return normalizeReviewText(source);
}

function normalizeReviewText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[.,;:!?，。；：！？、'"“”‘’()[\]{}<>《》（）【】\-_–—]/g, '')
    .toLowerCase();
}

function compareReviewSignature(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;

  return longestCommonSubsequenceLength(left, right) / Math.max(left.length, right.length);
}

function canReachSimilarityThreshold(left: string, right: string, threshold: number): boolean {
  if (!left || !right) return false;
  return Math.min(left.length, right.length) / Math.max(left.length, right.length) >= threshold;
}
