import type { DiffOperation, DiffTuple } from '@/types/diff';
import type { TextMappingEntry } from './documentText';
import { DIFF_EQUAL } from './textDiffCore';

type MarkupDiffOperation = Exclude<DiffOperation, 0>;
type WrapperTag = 'del' | 'ins';
type DiffRange = { start: number; length: number; groupId: string };
type TextNodeRange = { startOffset: number; endOffset: number; groupId: string };
type NodeRangeMap = Map<Text, TextNodeRange[]>;

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
