import type { DiffOperation, DiffTuple } from '@/types/diff';
import type { TextMappingEntry } from './documentText';
import { DIFF_EQUAL } from './textDiffCore';

type MarkupDiffOperation = Exclude<DiffOperation, 0>;
type WrapperTag = 'del' | 'ins';
type DiffRange = { start: number; length: number; groupId: string };
type TextNodeRange = { startOffset: number; endOffset: number; groupId: string };
type NodeRangeMap = Map<Text, TextNodeRange[]>;
const MERGE_CONTAINER_SELECTOR = 'p, li, td, th, div, h1, h2, h3, h4, h5, h6, blockquote, pre';
const BLOCKING_BRIDGE_SELECTOR = 'p, li, td, th, table, tr, ol, ul, div, h1, h2, h3, h4, h5, h6, blockquote, pre';
const DIFF_FRAGMENT_SELECTOR = 'ins[data-diff-id], del[data-diff-id]';
const MAX_MERGE_BRIDGE_LENGTH = 2;

export function applyDiffMarkup(
  domElement: HTMLElement,
  mapping: TextMappingEntry[],
  diffs: DiffTuple[],
  targetOperation: MarkupDiffOperation,
  wrapperTag: WrapperTag
): string {
  const ranges = collectDiffRanges(diffs, targetOperation);
  const nodesToWrap = mapRangesToTextNodes(mapping, ranges);
  const ownerDocument = domElement.ownerDocument;

  for (const [node, nodeRanges] of nodesToWrap) {
    replaceTextNodeWithMarkup(ownerDocument, node, nodeRanges, wrapperTag);
  }

  mergeNearbyDiffFragments(domElement, wrapperTag);
  return domElement.innerHTML;
}

function collectDiffRanges(diffs: DiffTuple[], targetOperation: MarkupDiffOperation): DiffRange[] {
  let currentIndex = 0;
  const ranges: DiffRange[] = [];

  for (const diff of diffs) {
    const operation = diff[0];
    const length = diff[1].length;
    if (operation === targetOperation) {
      ranges.push({ start: currentIndex, length, groupId: diff.groupId ?? '' });
      currentIndex += length;
    } else if (operation === DIFF_EQUAL) {
      currentIndex += length;
    }
  }

  return ranges;
}

function mapRangesToTextNodes(mapping: TextMappingEntry[], ranges: DiffRange[]): NodeRangeMap {
  const nodesToWrap: NodeRangeMap = new Map();

  for (const range of ranges) {
    const end = range.start + range.length;
    let activeNode: Text | null = null;
    let activeStartOffset = 0;
    let previousOffset = -1;

    const flushActiveRange = (): void => {
      if (!activeNode) return;

      addNodeRange(nodesToWrap, activeNode, {
        startOffset: activeStartOffset,
        endOffset: previousOffset + 1,
        groupId: range.groupId
      });
      activeNode = null;
      previousOffset = -1;
    };

    for (let index = range.start; index < end; index++) {
      const mapped = mapping[index];
      if (!mapped?.node) {
        flushActiveRange();
        continue;
      }

      if (activeNode === mapped.node && mapped.offset === previousOffset + 1) {
        previousOffset = mapped.offset;
        continue;
      }

      flushActiveRange();
      activeNode = mapped.node;
      activeStartOffset = mapped.offset;
      previousOffset = mapped.offset;
    }

    flushActiveRange();
  }

  return nodesToWrap;
}

function addNodeRange(nodesToWrap: NodeRangeMap, node: Text, range: TextNodeRange): void {
  const nodeRanges = nodesToWrap.get(node) ?? [];
  const previous = nodeRanges.at(-1);

  if (previous && previous.endOffset === range.startOffset && previous.groupId === range.groupId) {
    previous.endOffset = range.endOffset;
  } else {
    nodeRanges.push(range);
  }

  nodesToWrap.set(node, nodeRanges);
}

function replaceTextNodeWithMarkup(
  ownerDocument: Document,
  node: Text,
  ranges: TextNodeRange[],
  wrapperTag: WrapperTag
): void {
  const nodeText = node.nodeValue;
  if (!nodeText) return;

  const fragment = ownerDocument.createDocumentFragment();
  let cursor = 0;

  for (const range of ranges) {
    const startOffset = Math.max(cursor, Math.min(range.startOffset, nodeText.length));
    const endOffset = Math.max(startOffset, Math.min(range.endOffset, nodeText.length));
    if (startOffset > cursor) {
      fragment.appendChild(ownerDocument.createTextNode(nodeText.slice(cursor, startOffset)));
    }
    if (endOffset > startOffset) {
      appendWrappedText(ownerDocument, fragment, wrapperTag, nodeText.slice(startOffset, endOffset), range.groupId);
    }
    cursor = endOffset;
  }

  if (cursor < nodeText.length) {
    fragment.appendChild(ownerDocument.createTextNode(nodeText.slice(cursor)));
  }

  node.parentNode?.replaceChild(fragment, node);
}

function appendWrappedText(
  ownerDocument: Document,
  fragment: DocumentFragment,
  wrapperTag: WrapperTag,
  text: string,
  groupId: string
): void {
  const element = ownerDocument.createElement(wrapperTag);
  element.dataset.diffId = groupId;
  element.textContent = text;
  fragment.appendChild(element);
}

function mergeNearbyDiffFragments(domElement: HTMLElement, wrapperTag: WrapperTag): void {
  const fragments = getTopLevelDiffFragments(domElement, wrapperTag);
  let index = 0;

  while (index < fragments.length - 1) {
    const current = fragments[index];
    const next = fragments[index + 1];

    if (!current.isConnected) {
      fragments.splice(index, 1);
      continue;
    }

    if (!next.isConnected) {
      fragments.splice(index + 1, 1);
      continue;
    }

    if (!canMergeDiffFragments(domElement, current, next)) {
      index++;
      continue;
    }

    const merged = mergeDiffFragments(current, next, wrapperTag);
    if (!merged) {
      index++;
      continue;
    }

    fragments[index] = merged;
    fragments.splice(index + 1, 1);
  }
}

function getTopLevelDiffFragments(domElement: HTMLElement, wrapperTag: WrapperTag): HTMLElement[] {
  const selector = `${wrapperTag}[data-diff-id]`;
  return Array.from(domElement.querySelectorAll<HTMLElement>(selector))
    .filter((element) => !element.parentElement?.closest(selector));
}

function canMergeDiffFragments(root: HTMLElement, current: HTMLElement, next: HTMLElement): boolean {
  if (!current.dataset.diffId || current.dataset.diffId !== next.dataset.diffId) return false;
  if ((current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING) === 0) return false;
  if (getMergeContainer(root, current) !== getMergeContainer(root, next)) return false;

  const bridgeRange = current.ownerDocument.createRange();
  bridgeRange.setStartAfter(current);
  bridgeRange.setEndBefore(next);
  const bridge = bridgeRange.cloneContents();
  bridgeRange.detach();

  if (bridge.querySelector(BLOCKING_BRIDGE_SELECTOR)) return false;
  if (bridge.querySelector(DIFF_FRAGMENT_SELECTOR)) return false;

  return compactBridgeText(bridge.textContent ?? '').length <= MAX_MERGE_BRIDGE_LENGTH;
}

function getMergeContainer(root: HTMLElement, fragment: HTMLElement): Element {
  const container = fragment.closest(MERGE_CONTAINER_SELECTOR);
  return container && root.contains(container) ? container : root;
}

function compactBridgeText(text: string): string {
  return text.replace(/\s+/g, '');
}

function mergeDiffFragments(current: HTMLElement, next: HTMLElement, wrapperTag: WrapperTag): HTMLElement | null {
  const groupId = current.dataset.diffId;
  if (!groupId) return null;

  const ownerDocument = current.ownerDocument;
  const cleanupAncestors = collectCleanupAncestors(current, next);
  const range = ownerDocument.createRange();
  range.setStartBefore(current);
  range.setEndAfter(next);

  const mergedWrapper = ownerDocument.createElement(wrapperTag);
  mergedWrapper.dataset.diffId = groupId;
  mergedWrapper.appendChild(range.extractContents());
  unwrapNestedDiffFragments(mergedWrapper, wrapperTag, groupId);
  range.insertNode(mergedWrapper);
  range.detach();
  mergedWrapper.normalize();
  removeEmptyElements(cleanupAncestors);
  return mergedWrapper;
}

function unwrapNestedDiffFragments(container: HTMLElement, wrapperTag: WrapperTag, groupId: string): void {
  container
    .querySelectorAll<HTMLElement>(`${wrapperTag}[data-diff-id]`)
    .forEach((element) => {
      if (element.dataset.diffId === groupId) unwrapElement(element);
    });
}

function unwrapElement(element: HTMLElement): void {
  const parent = element.parentNode;
  if (!parent) return;

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  element.remove();
}

function collectCleanupAncestors(current: HTMLElement, next: HTMLElement): HTMLElement[] {
  return [
    ...collectInlineAncestors(current),
    ...collectInlineAncestors(next)
  ];
}

function collectInlineAncestors(element: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let current = element.parentElement;

  while (current && !current.matches(MERGE_CONTAINER_SELECTOR)) {
    ancestors.push(current);
    current = current.parentElement;
  }

  return ancestors;
}

function removeEmptyElements(elements: HTMLElement[]): void {
  Array.from(new Set(elements)).forEach((element) => {
    if (element.isConnected && isEmptyElement(element)) element.remove();
  });
}

function isEmptyElement(element: HTMLElement): boolean {
  return (element.textContent ?? '').trim().length === 0 &&
    element.querySelector('img, br, input, textarea, select, canvas, svg, video, audio') === null;
}
