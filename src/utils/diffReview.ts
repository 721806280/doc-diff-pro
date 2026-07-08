import type { DiffChangeKind, IgnoredDiffItem, SimilarDiffItem, SimilarDiffLevel } from '@/types/diff';
import type { DiffElementGroup, DiffElementIndex } from './diffElementIndex';
import { diffId, parseDiffId } from './textDiffCore';

export const SIMILAR_DIFF_THRESHOLDS: Record<SimilarDiffLevel, number> = {
  strict: 0.86,
  balanced: 0.72,
  loose: 0.62
};

const MAX_SIMILAR_DIFFS = 12;
const PREVIEW_LIMIT = 86;

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
    revisedPreview: previewElements(group.B)
  };
}

export function findSimilarReviewItems(options: {
  currentIndex: number;
  total: number;
  ignoredIds: Set<string>;
  level: SimilarDiffLevel;
  getGroup: (index: number) => DiffElementGroup | undefined;
}): SimilarDiffItem[] {
  const currentItem = createReviewItem(options.currentIndex, options.getGroup(options.currentIndex));
  if (!currentItem) return [];

  const currentSignature = createReviewSignature(currentItem);
  if (!currentSignature) return [];

  const candidates: SimilarDiffItem[] = [];
  for (let candidateIndex = 1; candidateIndex <= options.total; candidateIndex++) {
    if (candidateIndex === options.currentIndex || options.ignoredIds.has(diffId(candidateIndex))) continue;

    const candidateItem = createReviewItem(candidateIndex, options.getGroup(candidateIndex));
    if (!candidateItem || candidateItem.kind !== currentItem.kind) continue;

    const similarity = compareReviewSignature(currentSignature, createReviewSignature(candidateItem));
    if (similarity < SIMILAR_DIFF_THRESHOLDS[options.level]) continue;

    candidates.push({ ...candidateItem, similarity });
  }

  return candidates
    .sort((left, right) => right.similarity - left.similarity || left.index - right.index)
    .slice(0, MAX_SIMILAR_DIFFS);
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

function resolveReviewKind(group: DiffElementGroup): DiffChangeKind {
  const hasOriginal = group.A.length > 0;
  const hasRevised = group.B.length > 0;

  if (hasOriginal && hasRevised) return 'modified';
  return hasRevised ? 'inserted' : 'deleted';
}

function previewElements(elements: HTMLElement[]): string {
  return truncateReviewPreview(elements
    .map((element) => element.textContent ?? '')
    .join(' / ')
    .replace(/\s+/g, ' ')
    .trim());
}

function truncateReviewPreview(text: string): string {
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT - 1)}...` : text;
}

function createReviewSignature(item: IgnoredDiffItem): string {
  const source = item.kind === 'inserted'
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

function longestCommonSubsequenceLength(left: string, right: string): number {
  const previous = new Array(right.length + 1).fill(0);
  const current = new Array(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      current[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? previous[rightIndex - 1] + 1
        : Math.max(previous[rightIndex], current[rightIndex - 1]);
    }

    previous.splice(0, previous.length, ...current);
    current.fill(0);
  }

  return previous[right.length];
}
