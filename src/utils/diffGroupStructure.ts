import type { DiffGranularity, DiffSummary, DiffTuple } from '@/types/diff';
import { applyDiffMarkup } from './diffMarkup';
import { buildTextMapping, collapseWhitespace, normalizeText, type TextMapping } from './documentText';
import {
  alignDocumentTables,
  directRowCells,
  directTableRows,
  normalizeStructureText,
  type TableAlignmentEntry
} from './tableAlignment';
import { createTextDiffs } from './textDiffCompute';
import {
  DIFF_DELETE,
  DIFF_EQUAL,
  DIFF_INSERT,
  IMAGE_DIFF_ATTRIBUTE,
  parseDiffId,
  summarizeDiffs
} from './textDiffCore';

const DIFF_ELEMENT_SELECTOR = 'ins[data-diff-id], del[data-diff-id]';
const BODY_BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, div, section, article';
const MAX_SCOPE_DISTANCE = 3;
const MAX_MAIN_THREAD_CELL_DIFF_LENGTH = 2048;

type DiffScope = {
  kind: 'body' | 'table';
  key: string;
  order: number;
  tableId?: string;
  rowIndex?: number;
  regionId?: string;
  blockIndex?: number;
};

export type { TableAlignmentEntry };

type RowMeta = {
  tableId: string;
  rowIndex: number;
  order: number;
};

type BodyBlockMeta = {
  regionId: string;
  blockIndex: number;
  order: number;
};

type StructureIndex = {
  elementOrder: WeakMap<Element, number>;
  elementCount: number;
  tableIds: WeakMap<HTMLTableElement, string>;
  rowMeta: WeakMap<HTMLTableRowElement, RowMeta>;
  bodyBlockMeta: WeakMap<HTMLElement, BodyBlockMeta>;
};

type DiffGroupBucket = { scope: DiffScope; elements: HTMLElement[] };
type DiffGroupBuckets = Map<string, DiffGroupBucket>;
type DiffGroupUnit = { original?: DiffGroupBucket; revised?: DiffGroupBucket };

export type DiffGroupRefinementOptions = {
  granularity: DiffGranularity;
  ignoreSpaces: boolean;
  ignoreFullHalfWidth: boolean;
};

const DEFAULT_REFINEMENT_OPTIONS: DiffGroupRefinementOptions = {
  granularity: 'char',
  ignoreSpaces: false,
  ignoreFullHalfWidth: false
};

export function refineDiffGroups(
  originalRoot: HTMLElement,
  revisedRoot: HTMLElement,
  options: DiffGroupRefinementOptions = DEFAULT_REFINEMENT_OPTIONS
): Pick<DiffSummary, 'total' | 'inserted' | 'deleted' | 'modified'> {
  const alignment = alignDocumentTables(originalRoot, revisedRoot);
  repairTableRowDiffMarkup(alignment, options);
  const originalIndex = buildStructureIndex(originalRoot, alignment, 'original');
  const revisedIndex = buildStructureIndex(revisedRoot, alignment, 'revised');

  const originalElements = collectDiffElements(originalRoot);
  const revisedElements = collectDiffElements(revisedRoot);
  const rawIds = collectDiffIds(originalElements, revisedElements);
  let nextId = 1;

  for (const rawId of rawIds) {
    const originalBuckets = bucketByScope(originalElements.get(rawId) ?? [], originalIndex);
    const revisedBuckets = bucketByScope(revisedElements.get(rawId) ?? [], revisedIndex);

    for (const unit of pairScopedBuckets(originalBuckets, revisedBuckets)) {
      const nextDiffId = `diff-${nextId++}`;
      unit.original?.elements.forEach((element) => {
        element.dataset.diffId = nextDiffId;
      });
      unit.revised?.elements.forEach((element) => {
        element.dataset.diffId = nextDiffId;
      });
    }
  }

  mergeMovedTableGroups(originalRoot, revisedRoot, originalIndex, revisedIndex);
  renumberDiffGroups(originalRoot, revisedRoot, originalIndex, revisedIndex);

  return summarizeRefinedGroups(originalRoot, revisedRoot);
}

function buildStructureIndex(
  root: HTMLElement,
  alignment: TableAlignmentEntry[],
  side: 'original' | 'revised'
): StructureIndex {
  const elementOrder = new WeakMap<Element, number>();
  const elements = Array.from(root.querySelectorAll<HTMLElement>('*'));
  elements.forEach((element, order) => elementOrder.set(element, order));

  const tableIds = new WeakMap<HTMLTableElement, string>();
  const rowMeta = new WeakMap<HTMLTableRowElement, RowMeta>();
  const pairedTables: Array<{ id: string; order: number }> = [];

  alignment.forEach((entry) => {
    const table = entry[side];
    if (!table) return;

    const paired = Boolean(entry.original && entry.revised);
    tableIds.set(table, entry.id);
    if (paired) pairedTables.push({ id: entry.id, order: elementOrder.get(table) ?? 0 });

    directTableRows(table).forEach((row, rowIndex) => {
      rowMeta.set(row, {
        tableId: entry.id,
        rowIndex,
        order: elementOrder.get(row) ?? elementOrder.get(table) ?? 0
      });
    });
  });

  pairedTables.sort((left, right) => left.order - right.order);
  const bodyBlockMeta = new WeakMap<HTMLElement, BodyBlockMeta>();
  const blockCounts = new Map<string, number>();
  const blocks = collectBodyBlocks(root);
  let pairedTableIndex = 0;
  let regionId = 'start';

  blocks.forEach((block) => {
    const order = elementOrder.get(block) ?? 0;
    while (pairedTableIndex < pairedTables.length) {
      const pairedTable = pairedTables[pairedTableIndex];
      if (!pairedTable || pairedTable.order >= order) break;
      regionId = pairedTable.id;
      pairedTableIndex++;
    }

    const blockIndex = blockCounts.get(regionId) ?? 0;
    bodyBlockMeta.set(block, { regionId, blockIndex, order });
    blockCounts.set(regionId, blockIndex + 1);
  });

  return {
    elementOrder,
    elementCount: Math.max(elements.length, 1),
    tableIds,
    rowMeta,
    bodyBlockMeta
  };
}

function collectDiffElements(root: HTMLElement): Map<string, HTMLElement[]> {
  const groups = new Map<string, HTMLElement[]>();
  root.querySelectorAll<HTMLElement>(DIFF_ELEMENT_SELECTOR).forEach((element) => {
    const id = element.dataset.diffId;
    if (!id) return;
    const elements = groups.get(id) ?? [];
    elements.push(element);
    groups.set(id, elements);
  });
  return groups;
}

function collectDiffIds(
  originalElements: Map<string, HTMLElement[]>,
  revisedElements: Map<string, HTMLElement[]>
): string[] {
  return [...new Set([...originalElements.keys(), ...revisedElements.keys()])].sort(compareDiffIds);
}

function compareDiffIds(left: string, right: string): number {
  const leftIndex = parseDiffId(left);
  const rightIndex = parseDiffId(right);
  if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex)) return leftIndex - rightIndex;
  return left.localeCompare(right);
}

function bucketByScope(elements: HTMLElement[], index: StructureIndex): DiffGroupBuckets {
  const buckets: DiffGroupBuckets = new Map();
  elements.forEach((element) => {
    const scope = resolveScope(element, index);
    const bucket = buckets.get(scope.key) ?? { scope, elements: [] };
    bucket.elements.push(element);
    buckets.set(scope.key, bucket);
  });
  return buckets;
}

function pairScopedBuckets(original: DiffGroupBuckets, revised: DiffGroupBuckets): DiffGroupUnit[] {
  const units: DiffGroupUnit[] = [];
  const matchedOriginal = new Set<string>();
  const matchedRevised = new Set<string>();

  for (const key of original.keys()) {
    const originalBucket = original.get(key);
    const revisedBucket = revised.get(key);
    if (!originalBucket || !revisedBucket) continue;
    units.push({ original: originalBucket, revised: revisedBucket });
    matchedOriginal.add(key);
    matchedRevised.add(key);
  }

  const unmatchedOriginal = [...original.entries()].filter(([key]) => !matchedOriginal.has(key));
  const unmatchedRevised = [...revised.entries()].filter(([key]) => !matchedRevised.has(key));

  for (const [originalKey, originalBucket] of unmatchedOriginal) {
    const candidates = unmatchedRevised.filter(
      ([revisedKey, revisedBucket]) =>
        !matchedRevised.has(revisedKey) && canPairScopes(originalBucket.scope, revisedBucket.scope)
    );
    const soleCandidate = candidates[0];
    if (candidates.length !== 1 || !soleCandidate) continue;

    const [revisedKey, revisedBucket] = soleCandidate;
    const reverseCandidates = unmatchedOriginal.filter(
      ([candidateKey, candidateBucket]) =>
        !matchedOriginal.has(candidateKey) && canPairScopes(candidateBucket.scope, revisedBucket.scope)
    );
    if (reverseCandidates.length !== 1) continue;

    units.push({ original: originalBucket, revised: revisedBucket });
    matchedOriginal.add(originalKey);
    matchedRevised.add(revisedKey);
  }

  unmatchedOriginal.forEach(([key, bucket]) => {
    if (!matchedOriginal.has(key)) units.push({ original: bucket });
  });
  unmatchedRevised.forEach(([key, bucket]) => {
    if (!matchedRevised.has(key)) units.push({ revised: bucket });
  });

  return units.sort((left, right) => unitOrder(left) - unitOrder(right));
}

function canPairScopes(original: DiffScope, revised: DiffScope): boolean {
  if (original.kind !== revised.kind) return false;
  if (original.kind === 'table') {
    return (
      original.tableId === revised.tableId &&
      original.rowIndex !== undefined &&
      revised.rowIndex !== undefined &&
      Math.abs(original.rowIndex - revised.rowIndex) <= MAX_SCOPE_DISTANCE
    );
  }
  return (
    original.regionId === revised.regionId &&
    original.blockIndex !== undefined &&
    revised.blockIndex !== undefined &&
    Math.abs(original.blockIndex - revised.blockIndex) <= MAX_SCOPE_DISTANCE
  );
}

function unitOrder(unit: DiffGroupUnit): number {
  const orders = [unit.original?.scope.order, unit.revised?.scope.order].filter(
    (value): value is number => value !== undefined
  );
  return orders.length > 0 ? Math.min(...orders) : Number.MAX_SAFE_INTEGER;
}

function resolveScope(element: HTMLElement, index: StructureIndex): DiffScope {
  const table = element.closest<HTMLTableElement>('table');
  if (table) {
    const tableId = index.tableIds.get(table) ?? 'unindexed-table';
    const row = element.closest<HTMLTableRowElement>('tr');
    const rowMeta = row ? index.rowMeta.get(row) : undefined;
    return {
      kind: 'table',
      key: rowMeta ? `table:${tableId}:row:${rowMeta.rowIndex}` : `table:${tableId}`,
      order: rowMeta?.order ?? index.elementOrder.get(table) ?? 0,
      tableId,
      rowIndex: rowMeta?.rowIndex
    };
  }

  const block = resolveBodyBlock(element);
  const meta = block ? index.bodyBlockMeta.get(block) : undefined;
  const regionId = meta?.regionId ?? 'start';
  const blockIndex = meta?.blockIndex ?? -1;
  return {
    kind: 'body',
    key: `body:${regionId}:block:${blockIndex}`,
    order: meta?.order ?? index.elementOrder.get(element) ?? 0,
    regionId,
    blockIndex
  };
}

function resolveBodyBlock(element: HTMLElement): HTMLElement | null {
  const listItem = element.closest<HTMLElement>('li');
  return listItem ?? element.closest<HTMLElement>(BODY_BLOCK_SELECTOR);
}

function collectBodyBlocks(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(BODY_BLOCK_SELECTOR)).filter((element) => {
    if (element.closest('table')) return false;
    if (element.tagName.toUpperCase() !== 'LI' && element.closest('li')) return false;
    if (!element.matches('div, section, article')) return true;
    if (hasDirectText(element)) return true;
    return element.querySelector(BODY_BLOCK_SELECTOR) === null;
  });
}

function hasDirectText(element: HTMLElement): boolean {
  return Array.from(element.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && normalizeStructureText(node.nodeValue ?? '').length > 0
  );
}

function mergeMovedTableGroups(
  originalRoot: HTMLElement,
  revisedRoot: HTMLElement,
  originalIndex: StructureIndex,
  revisedIndex: StructureIndex
): void {
  const originalGroups = collectDiffElements(originalRoot);
  const revisedGroups = collectDiffElements(revisedRoot);
  const originalCandidateCounts = new Map<string, number>();
  const revisedCandidates = new Map<string, Array<{ id: string; elements: HTMLElement[]; scope: DiffScope }>>();

  originalGroups.forEach((elements, id) => {
    const first = elements[0];
    if (revisedGroups.has(id) || !first) return;
    const scope = resolveScope(first, originalIndex);
    if (scope.kind !== 'table' || scope.rowIndex === undefined) return;
    const key = `${scope.tableId}\u0000${normalizedGroupText(elements)}`;
    originalCandidateCounts.set(key, (originalCandidateCounts.get(key) ?? 0) + 1);
  });

  revisedGroups.forEach((elements, id) => {
    const first = elements[0];
    if (originalGroups.has(id) || !first) return;
    const scope = resolveScope(first, revisedIndex);
    if (scope.kind !== 'table' || scope.rowIndex === undefined) return;
    const key = `${scope.tableId}\u0000${normalizedGroupText(elements)}`;
    const candidates = revisedCandidates.get(key) ?? [];
    candidates.push({ id, elements, scope });
    revisedCandidates.set(key, candidates);
  });

  const usedRevisedIds = new Set<string>();
  originalGroups.forEach((elements, id) => {
    const first = elements[0];
    if (revisedGroups.has(id) || !first) return;
    const scope = resolveScope(first, originalIndex);
    if (scope.kind !== 'table' || scope.rowIndex === undefined) return;

    const key = `${scope.tableId}\u0000${normalizedGroupText(elements)}`;
    if (originalCandidateCounts.get(key) !== 1) return;
    const rowIndex = scope.rowIndex;
    const candidates = (revisedCandidates.get(key) ?? []).filter(
      (candidate) =>
        !usedRevisedIds.has(candidate.id) &&
        candidate.scope.rowIndex !== undefined &&
        Math.abs(candidate.scope.rowIndex - rowIndex) <= MAX_SCOPE_DISTANCE
    );
    const match = candidates.length === 1 ? candidates[0] : undefined;
    if (!match) return;

    match.elements.forEach((element) => {
      element.dataset.diffId = id;
    });
    usedRevisedIds.add(match.id);
  });
}

/**
 * What identifies a difference group when looking for the same one on the other
 * side of the document.
 *
 * Image groups have no text at all, so they are identified by the label the
 * image markup left behind instead. Without that every image group in a table
 * would produce the same key and they could only be told apart by never being
 * unique enough to pair.
 */
function normalizedGroupText(elements: HTMLElement[]): string {
  const text = normalizeStructureText(elements.map((element) => element.textContent ?? '').join(''));
  if (text) return text;

  return elements.map((element) => element.getAttribute(IMAGE_DIFF_ATTRIBUTE) ?? '').join(' ');
}

function repairTableRowDiffMarkup(alignment: TableAlignmentEntry[], options: DiffGroupRefinementOptions): void {
  let repairGroup = 0;
  const nextRepairGroupId = (): string => `repair-${++repairGroup}`;

  alignment.forEach(({ original, revised }) => {
    if (!original || !revised) return;

    const originalRows = directTableRows(original);
    const revisedRows = directTableRows(revised);
    const { pairs, unmatchedOriginal, unmatchedRevised } = pairRowsByUniqueFirstCell(originalRows, revisedRows);

    pairs.forEach(([originalRow, revisedRow]) =>
      repairPairedRowCells(originalRow, revisedRow, options, nextRepairGroupId)
    );

    if (unmatchedOriginal.length === 0 && unmatchedRevised.length === revisedRows.length - originalRows.length) {
      unmatchedRevised.forEach((row) => completeChangedRowMarkup(row, 'ins'));
    }
    if (unmatchedRevised.length === 0 && unmatchedOriginal.length === originalRows.length - revisedRows.length) {
      unmatchedOriginal.forEach((row) => completeChangedRowMarkup(row, 'del'));
    }
  });
}

function pairRowsByUniqueFirstCell(
  originalRows: HTMLTableRowElement[],
  revisedRows: HTMLTableRowElement[]
): {
  pairs: Array<[HTMLTableRowElement, HTMLTableRowElement]>;
  unmatchedOriginal: HTMLTableRowElement[];
  unmatchedRevised: HTMLTableRowElement[];
} {
  const originalKeys = originalRows.map(firstCellKey);
  const revisedKeys = revisedRows.map(firstCellKey);
  const originalCounts = countValues(originalKeys);
  const revisedCounts = countValues(revisedKeys);
  const revisedByKey = new Map(revisedRows.map((row, index) => [revisedKeys[index], row]));
  const matchedOriginal = new Set<HTMLTableRowElement>();
  const matchedRevised = new Set<HTMLTableRowElement>();
  const pairs: Array<[HTMLTableRowElement, HTMLTableRowElement]> = [];

  originalRows.forEach((row, index) => {
    const key = originalKeys[index];
    if (!key || originalCounts.get(key) !== 1 || revisedCounts.get(key) !== 1) return;
    const revisedRow = revisedByKey.get(key);
    if (!revisedRow) return;

    pairs.push([row, revisedRow]);
    matchedOriginal.add(row);
    matchedRevised.add(revisedRow);
  });

  return {
    pairs,
    unmatchedOriginal: originalRows.filter((row) => !matchedOriginal.has(row)),
    unmatchedRevised: revisedRows.filter((row) => !matchedRevised.has(row))
  };
}

function firstCellKey(row: HTMLTableRowElement): string {
  const firstCell = directRowCells(row)[0];
  return normalizeStructureText(firstCell?.textContent ?? '');
}

function countValues(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return counts;
}

function repairPairedRowCells(
  originalRow: HTMLTableRowElement,
  revisedRow: HTMLTableRowElement,
  options: DiffGroupRefinementOptions,
  nextRepairGroupId: () => string
): void {
  const originalCells = directRowCells(originalRow);
  const revisedCells = directRowCells(revisedRow);
  if (originalCells.length !== revisedCells.length) return;

  originalCells.forEach((originalCell, index) => {
    const revisedCell = revisedCells[index];
    if (!revisedCell) return;

    const originalId = fullCellDiffId(originalCell, 'del');
    const revisedId = fullCellDiffId(revisedCell, 'ins');
    if ((!originalId && revisedId) || (!revisedId && originalId)) {
      remarkCellDifference(originalCell, revisedCell, revisedId ?? originalId!, options, nextRepairGroupId);
    }
  });
}

function remarkCellDifference(
  originalCell: HTMLTableCellElement,
  revisedCell: HTMLTableCellElement,
  id: string,
  options: DiffGroupRefinementOptions,
  nextRepairGroupId: () => string
): void {
  [originalCell, revisedCell].forEach((cell) => {
    Array.from(cell.querySelectorAll<HTMLElement>(DIFF_ELEMENT_SELECTOR))
      // Image markup is not this pass's to redo. Re-diffing a cell's text and
      // then reapplying markup to its text nodes would leave the `<img>` behind
      // unwrapped, silently dropping a difference this pass never examined.
      .filter((element) => element.querySelector('img') === null)
      .reverse()
      .forEach(unwrapDiffElement);
  });

  const originalTrack = prepareCellText(originalCell, options);
  const revisedTrack = prepareCellText(revisedCell, options);
  const diffs = createCellRepairDiff(originalTrack, revisedTrack, options.granularity);
  assignRepairGroupIds(diffs, id, nextRepairGroupId);

  applyDiffMarkup(originalCell, originalTrack.mapping, diffs, DIFF_DELETE, 'del');
  applyDiffMarkup(revisedCell, revisedTrack.mapping, diffs, DIFF_INSERT, 'ins');
}

function createCellRepairDiff(original: TextMapping, revised: TextMapping, granularity: DiffGranularity): DiffTuple[] {
  if (Math.max(original.text.length, revised.text.length) <= MAX_MAIN_THREAD_CELL_DIFF_LENGTH) {
    // Within a single repaired cell each change should stay its own marker, so
    // skip the efficiency pass that merges edits across short equal runs
    // ("旧|中|旧" collapsing into one "旧中旧" span).
    return createTextDiffs(original, revised, granularity, { mergeShortGaps: false });
  }

  // ponytail: keep huge-cell repair linear; move exact cell diffing into the worker if multi-span precision is needed.
  return createSingleSpanDiff(original.text, revised.text);
}

function assignRepairGroupIds(diffs: DiffTuple[], firstId: string, nextRepairGroupId: () => string): void {
  summarizeDiffs(
    diffs,
    'char',
    diffs.reduce((length, [operation, text]) => length + (operation === DIFF_INSERT ? 0 : text.length), 0),
    diffs.reduce((length, [operation, text]) => length + (operation === DIFF_DELETE ? 0 : text.length), 0)
  );

  const ids = new Map<string, string>();
  diffs.forEach((diff) => {
    if (diff[0] === DIFF_EQUAL || !diff.groupId) return;
    let mappedId = ids.get(diff.groupId);
    if (!mappedId) {
      mappedId = ids.size === 0 ? firstId : nextRepairGroupId();
      ids.set(diff.groupId, mappedId);
    }
    diff.groupId = mappedId;
  });
}

function prepareCellText(cell: HTMLTableCellElement, options: DiffGroupRefinementOptions): TextMapping {
  const mapping = buildTextMapping(cell);
  const track = options.ignoreSpaces ? collapseWhitespace(mapping) : mapping;
  return {
    text: normalizeText(track.text, options.ignoreFullHalfWidth, false),
    mapping: track.mapping,
    boundaries: track.boundaries
  };
}

function createSingleSpanDiff(original: string, revised: string): DiffTuple[] {
  let prefixLength = 0;
  const sharedLength = Math.min(original.length, revised.length);
  while (prefixLength < sharedLength && original[prefixLength] === revised[prefixLength]) prefixLength++;

  let suffixLength = 0;
  while (
    suffixLength < sharedLength - prefixLength &&
    original[original.length - suffixLength - 1] === revised[revised.length - suffixLength - 1]
  ) {
    suffixLength++;
  }

  const diffs: DiffTuple[] = [];
  const prefix = original.slice(0, prefixLength);
  const deleted = original.slice(prefixLength, original.length - suffixLength);
  const inserted = revised.slice(prefixLength, revised.length - suffixLength);
  const suffix = original.slice(original.length - suffixLength);
  if (prefix) diffs.push([DIFF_EQUAL, prefix]);
  if (deleted) diffs.push([DIFF_DELETE, deleted]);
  if (inserted) diffs.push([DIFF_INSERT, inserted]);
  if (suffix) diffs.push([DIFF_EQUAL, suffix]);
  return diffs;
}

function unwrapDiffElement(element: HTMLElement): void {
  element.replaceWith(...Array.from(element.childNodes));
}

function fullCellDiffId(cell: HTMLTableCellElement, tag: 'ins' | 'del'): string | null {
  const elements = Array.from(cell.querySelectorAll<HTMLElement>(`${tag}[data-diff-id]`));
  const ids = new Set(elements.map((element) => element.dataset.diffId).filter(Boolean));
  if (ids.size !== 1) return null;

  const markedText = normalizeStructureText(elements.map((element) => element.textContent ?? '').join(''));
  return markedText && markedText === normalizeStructureText(cell.textContent ?? '') ? ([...ids][0] ?? null) : null;
}

function completeChangedRowMarkup(row: HTMLTableRowElement, tag: 'ins' | 'del'): void {
  const ids = new Set(
    Array.from(row.querySelectorAll<HTMLElement>(`${tag}[data-diff-id]`))
      .map((element) => element.dataset.diffId)
      .filter((id): id is string => Boolean(id))
  );
  const id = ids.size === 1 ? [...ids][0] : undefined;
  if (id) wrapUnmarkedText(row, tag, id);
}

function wrapUnmarkedText(container: HTMLElement, tag: 'ins' | 'del', id: string): void {
  const walker = container.ownerDocument.createTreeWalker(container, 4);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (
      current instanceof Text &&
      normalizeStructureText(current.nodeValue ?? '') &&
      !current.parentElement?.closest(DIFF_ELEMENT_SELECTOR)
    ) {
      nodes.push(current);
    }
    current = walker.nextNode();
  }

  nodes.forEach((node) => {
    const wrapper = container.ownerDocument.createElement(tag);
    wrapper.dataset.diffId = id;
    node.parentNode?.insertBefore(wrapper, node);
    wrapper.appendChild(node);
  });
}

function renumberDiffGroups(
  originalRoot: HTMLElement,
  revisedRoot: HTMLElement,
  originalIndex: StructureIndex,
  revisedIndex: StructureIndex
): void {
  const originalGroups = collectDiffElements(originalRoot);
  const revisedGroups = collectDiffElements(revisedRoot);
  const ids = [...new Set([...originalGroups.keys(), ...revisedGroups.keys()])];

  ids.sort((left, right) => {
    const leftOrder = normalizedGroupOrder(left, originalGroups, revisedGroups, originalIndex, revisedIndex);
    const rightOrder = normalizedGroupOrder(right, originalGroups, revisedGroups, originalIndex, revisedIndex);
    return leftOrder - rightOrder || compareDiffIds(left, right);
  });

  const idMap = new Map(ids.map((id, index) => [id, `diff-${index + 1}`]));
  [originalRoot, revisedRoot].forEach((root) => {
    root.querySelectorAll<HTMLElement>(DIFF_ELEMENT_SELECTOR).forEach((element) => {
      const nextId = idMap.get(element.dataset.diffId ?? '');
      if (nextId) element.dataset.diffId = nextId;
    });
  });
}

function normalizedGroupOrder(
  id: string,
  originalGroups: Map<string, HTMLElement[]>,
  revisedGroups: Map<string, HTMLElement[]>,
  originalIndex: StructureIndex,
  revisedIndex: StructureIndex
): number {
  const positions: number[] = [];
  const original = originalGroups.get(id)?.[0];
  const revised = revisedGroups.get(id)?.[0];
  if (original) positions.push(resolveScope(original, originalIndex).order / originalIndex.elementCount);
  if (revised) positions.push(resolveScope(revised, revisedIndex).order / revisedIndex.elementCount);
  return positions.length > 0
    ? positions.reduce((total, position) => total + position, 0) / positions.length
    : Number.MAX_SAFE_INTEGER;
}

function summarizeRefinedGroups(
  originalRoot: HTMLElement,
  revisedRoot: HTMLElement
): Pick<DiffSummary, 'total' | 'inserted' | 'deleted' | 'modified'> {
  const groups = new Map<string, { original: boolean; revised: boolean }>();
  collectDiffElements(originalRoot).forEach((elements, id) => {
    if (elements.length > 0) groups.set(id, { original: true, revised: groups.get(id)?.revised ?? false });
  });
  collectDiffElements(revisedRoot).forEach((elements, id) => {
    if (elements.length > 0) groups.set(id, { original: groups.get(id)?.original ?? false, revised: true });
  });

  let inserted = 0;
  let deleted = 0;
  let modified = 0;
  groups.forEach(({ original, revised }) => {
    if (original && revised) modified++;
    else if (revised) inserted++;
    else if (original) deleted++;
  });

  return { total: groups.size, inserted, deleted, modified };
}
