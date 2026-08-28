import type { DiffOperation, DiffTuple } from '@/types/diff';
import { mappedNode, mappedOffset, type TextPositionMap } from './documentText';
import { DIFF_EQUAL } from './textDiffCore';

type MarkupDiffOperation = Exclude<DiffOperation, 0>;
type WrapperTag = 'del' | 'ins';
type DiffRange = { start: number; length: number; groupId: string };
type TextNodeRange = { startOffset: number; endOffset: number; groupId: string };
type NodeRangeMap = Map<Text, TextNodeRange[]>;
const MERGE_CONTAINER_SELECTOR = 'p, li, td, th, div, h1, h2, h3, h4, h5, h6, blockquote, pre';
// `img` blocks a bridge despite carrying no text: an image difference is its own
// difference, and without this a `<del>` around a figure would be swallowed by a
// text edit merging across it — the image contributes zero characters, so the
// bridge looks empty however wide it is.
const BLOCKING_BRIDGE_SELECTOR = 'p, li, td, th, table, tr, ol, ul, div, h1, h2, h3, h4, h5, h6, blockquote, pre, img';
const DIFF_FRAGMENT_SELECTOR = 'ins[data-diff-id], del[data-diff-id]';
const BRIDGE_BLOCKING_SELECTOR = `${BLOCKING_BRIDGE_SELECTOR}, ${DIFF_FRAGMENT_SELECTOR}`;
const MAX_MERGE_BRIDGE_LENGTH = 2;

export function applyDiffMarkup(
  domElement: HTMLElement,
  mapping: TextPositionMap,
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

function mapRangesToTextNodes(mapping: TextPositionMap, ranges: DiffRange[]): NodeRangeMap {
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
      const node = mappedNode(mapping, index);
      if (!node) {
        flushActiveRange();
        continue;
      }

      const offset = mappedOffset(mapping, index);
      if (activeNode === node && offset === previousOffset + 1) {
        previousOffset = offset;
        continue;
      }

      flushActiveRange();
      activeNode = node;
      activeStartOffset = offset;
      previousOffset = offset;
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
  // A single forward pass with a running candidate. The candidate absorbs each
  // mergeable successor and stays the candidate, so an unbroken run collapses
  // in one sweep without ever reindexing the list.
  let candidate: HTMLElement | null = null;

  for (const fragment of fragments) {
    if (!fragment.isConnected) continue;
    if (candidate && !candidate.isConnected) candidate = null;

    if (!candidate || !canMergeDiffFragments(domElement, candidate, fragment)) {
      candidate = fragment;
      continue;
    }

    candidate = mergeDiffFragments(candidate, fragment, wrapperTag) ?? fragment;
  }
}

function getTopLevelDiffFragments(domElement: HTMLElement, wrapperTag: WrapperTag): HTMLElement[] {
  const selector = `${wrapperTag}[data-diff-id]`;
  return Array.from(domElement.querySelectorAll<HTMLElement>(selector)).filter(
    (element) => !element.parentElement?.closest(selector)
  );
}

function canMergeDiffFragments(root: HTMLElement, current: HTMLElement, next: HTMLElement): boolean {
  if (!current.dataset.diffId || current.dataset.diffId !== next.dataset.diffId) return false;
  if ((current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING) === 0) return false;

  const container = getMergeContainer(root, current);
  if (container !== getMergeContainer(root, next)) return false;

  return hasMergeableBridge(container, current, next);
}

/**
 * Whether the markup lying strictly between two fragments is thin enough to
 * merge across: no block boundary, no third difference, and at most
 * MAX_MERGE_BRIDGE_LENGTH non-space characters.
 *
 * Walked in place. `Range.cloneContents()` asks the same question in two
 * lines, but it copies the in-between subtree for every adjacent pair — on a
 * heavily edited document that is thousands of clones, and it cannot stop
 * early once the bridge is obviously too long. The partial containers a clone
 * would have carried along are the ones this walk ascends out of and descends
 * into, so both are tested the same way the clone tested them.
 */
function hasMergeableBridge(container: Element, current: HTMLElement, next: HTMLElement): boolean {
  let bridgeLength = 0;
  let node: Node | null = current;

  for (;;) {
    while (node && node !== container && !node.nextSibling) {
      node = node.parentNode;
      if (node && node !== container && isBridgeBlockingElement(node)) return false;
    }
    // Ascending out of the container means the two are not bridged in document
    // order after all, which is not something to merge across.
    if (!node || node === container) return false;

    node = node.nextSibling;
    while (node && node !== next && node.contains(next)) {
      // Only the part of this container that precedes `next` bridges the pair,
      // so descend rather than take the whole subtree.
      if (isBridgeBlockingElement(node)) return false;

      node = node.firstChild;
    }
    if (!node) return false;
    if (node === next) return true;

    if (isBridgeBlockingElement(node) || containsBridgeBlockingElement(node)) return false;

    bridgeLength += compactBridgeText(node.textContent ?? '').length;
    if (bridgeLength > MAX_MERGE_BRIDGE_LENGTH) return false;
  }
}

function isBridgeBlockingElement(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).matches(BRIDGE_BLOCKING_SELECTOR);
}

function containsBridgeBlockingElement(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).querySelector(BRIDGE_BLOCKING_SELECTOR) !== null;
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
  container.querySelectorAll<HTMLElement>(`${wrapperTag}[data-diff-id]`).forEach((element) => {
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
  return [...collectInlineAncestors(current), ...collectInlineAncestors(next)];
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
  return (
    (element.textContent ?? '').trim().length === 0 &&
    element.querySelector('img, br, input, textarea, select, canvas, svg, video, audio') === null
  );
}
