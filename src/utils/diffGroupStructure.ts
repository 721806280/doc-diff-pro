import type { DiffSummary } from '@/types/diff';
import { parseDiffId } from './textDiffCore';

const DIFF_ELEMENT_SELECTOR = 'ins[data-diff-id], del[data-diff-id]';
const BODY_BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, div, section, article';
const MAX_SCOPE_DISTANCE = 3;
const TABLE_MATCH_THRESHOLD = 0.15;
// Table-count changes need text evidence; equal shape alone scores at most 0.3.
const TABLE_COUNT_CHANGE_MATCH_THRESHOLD = 0.35;
const TABLE_GAP_PENALTY = 0.2;

type DiffScope = {
  kind: 'body' | 'table';
  key: string;
  order: number;
  tableId?: string;
  rowIndex?: number;
  regionId?: string;
  blockIndex?: number;
};

type AlignmentPair<T> = { original?: T; revised?: T };
export type TableAlignmentEntry = AlignmentPair<HTMLTableElement> & { id: string };

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

export function refineDiffGroups(
  originalRoot: HTMLElement,
  revisedRoot: HTMLElement
): Pick<DiffSummary, 'total' | 'inserted' | 'deleted' | 'modified'> {
  const alignment = alignDocumentTables(originalRoot, revisedRoot);
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

export function alignDocumentTables(
  originalRoot: HTMLElement,
  revisedRoot: HTMLElement
): TableAlignmentEntry[] {
  const original = Array.from(originalRoot.querySelectorAll<HTMLTableElement>('table'));
  const revised = Array.from(revisedRoot.querySelectorAll<HTMLTableElement>('table'));
  const signatures = new WeakMap<HTMLTableElement, ReturnType<typeof createTableSignature>>();
  [...original, ...revised].forEach((table) => signatures.set(table, createTableSignature(table)));
  const matchThreshold = original.length === revised.length
    ? TABLE_MATCH_THRESHOLD
    : TABLE_COUNT_CHANGE_MATCH_THRESHOLD;

  return alignSequences(
    original,
    revised,
    (left, right) => tableSimilarity(signatures.get(left)!, signatures.get(right)!),
    matchThreshold
  ).map((entry, index) => ({ ...entry, id: `table-${index}` }));
}

function alignSequences<T>(
  original: T[],
  revised: T[],
  similarity: (original: T, revised: T) => number,
  matchThreshold: number
): Array<AlignmentPair<T>> {
  const scores = Array.from({ length: original.length + 1 }, () =>
    new Array(revised.length + 1).fill(Number.NEGATIVE_INFINITY)
  );
  const choices = Array.from({ length: original.length + 1 }, () =>
    new Array<'match' | 'original' | 'revised' | null>(revised.length + 1).fill(null)
  );

  scores[0][0] = 0;
  for (let index = 1; index <= original.length; index++) {
    scores[index][0] = scores[index - 1][0] - TABLE_GAP_PENALTY;
    choices[index][0] = 'original';
  }
  for (let index = 1; index <= revised.length; index++) {
    scores[0][index] = scores[0][index - 1] - TABLE_GAP_PENALTY;
    choices[0][index] = 'revised';
  }

  for (let originalIndex = 1; originalIndex <= original.length; originalIndex++) {
    for (let revisedIndex = 1; revisedIndex <= revised.length; revisedIndex++) {
      const matchScore = similarity(original[originalIndex - 1], revised[revisedIndex - 1]);
      let bestScore = scores[originalIndex - 1][revisedIndex] - TABLE_GAP_PENALTY;
      let bestChoice: 'match' | 'original' | 'revised' = 'original';
      const revisedScore = scores[originalIndex][revisedIndex - 1] - TABLE_GAP_PENALTY;
      if (revisedScore > bestScore) {
        bestScore = revisedScore;
        bestChoice = 'revised';
      }
      if (matchScore >= matchThreshold) {
        const alignedScore = scores[originalIndex - 1][revisedIndex - 1] + matchScore;
        if (alignedScore > bestScore) {
          bestScore = alignedScore;
          bestChoice = 'match';
        }
      }

      scores[originalIndex][revisedIndex] = bestScore;
      choices[originalIndex][revisedIndex] = bestChoice;
    }
  }

  const reversed: Array<AlignmentPair<T>> = [];
  let originalIndex = original.length;
  let revisedIndex = revised.length;
  while (originalIndex > 0 || revisedIndex > 0) {
    const choice = choices[originalIndex][revisedIndex];
    if (choice === 'match') {
      reversed.push({ original: original[originalIndex - 1], revised: revised[revisedIndex - 1] });
      originalIndex--;
      revisedIndex--;
    } else if (choice === 'original') {
      reversed.push({ original: original[originalIndex - 1] });
      originalIndex--;
    } else {
      reversed.push({ revised: revised[revisedIndex - 1] });
      revisedIndex--;
    }
  }

  return reversed.reverse();
}

function createTableSignature(table: HTMLTableElement): { text: string; rows: number; cells: number } {
  const rows = directTableRows(table);
  return {
    text: normalizeStructureText(table.textContent ?? ''),
    rows: rows.length,
    cells: rows.reduce((total, row) => total + directRowCells(row).length, 0)
  };
}

function tableSimilarity(
  left: { text: string; rows: number; cells: number },
  right: { text: string; rows: number; cells: number }
): number {
  const textScore = diceSimilarity(left.text, right.text);
  const rowScore = ratioSimilarity(left.rows, right.rows);
  const cellScore = ratioSimilarity(left.cells, right.cells);
  if (!left.text && !right.text) return (rowScore + cellScore) / 2;
  return (textScore * 0.7) + (rowScore * 0.15) + (cellScore * 0.15);
}

function diceSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;
  if (left.length < 2 || right.length < 2) return 0;

  const counts = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index++) {
    const pair = left.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }

  let matches = 0;
  for (let index = 0; index < right.length - 1; index++) {
    const pair = right.slice(index, index + 2);
    const count = counts.get(pair) ?? 0;
    if (count <= 0) continue;
    matches++;
    counts.set(pair, count - 1);
  }

  return (matches * 2) / ((left.length - 1) + (right.length - 1));
}

function ratioSimilarity(left: number, right: number): number {
  if (left === right) return 1;
  const maximum = Math.max(left, right);
  return maximum === 0 ? 1 : Math.min(left, right) / maximum;
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
    while (pairedTableIndex < pairedTables.length && pairedTables[pairedTableIndex].order < order) {
      regionId = pairedTables[pairedTableIndex].id;
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
  return [...new Set([...originalElements.keys(), ...revisedElements.keys()])]
    .sort(compareDiffIds);
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
    const candidates = unmatchedRevised.filter(([revisedKey, revisedBucket]) =>
      !matchedRevised.has(revisedKey) && canPairScopes(originalBucket.scope, revisedBucket.scope)
    );
    if (candidates.length !== 1) continue;

    const [revisedKey, revisedBucket] = candidates[0];
    const reverseCandidates = unmatchedOriginal.filter(([candidateKey, candidateBucket]) =>
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
    return original.tableId === revised.tableId &&
      original.rowIndex !== undefined &&
      revised.rowIndex !== undefined &&
      Math.abs(original.rowIndex - revised.rowIndex) <= MAX_SCOPE_DISTANCE;
  }
  return original.regionId === revised.regionId &&
    original.blockIndex !== undefined &&
    revised.blockIndex !== undefined &&
    Math.abs(original.blockIndex - revised.blockIndex) <= MAX_SCOPE_DISTANCE;
}

function unitOrder(unit: DiffGroupUnit): number {
  const orders = [unit.original?.scope.order, unit.revised?.scope.order]
    .filter((value): value is number => value !== undefined);
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
  return Array.from(root.querySelectorAll<HTMLElement>(BODY_BLOCK_SELECTOR))
    .filter((element) => {
      if (element.closest('table')) return false;
      if (element.tagName.toUpperCase() !== 'LI' && element.closest('li')) return false;
      if (!element.matches('div, section, article')) return true;
      if (hasDirectText(element)) return true;
      return element.querySelector(BODY_BLOCK_SELECTOR) === null;
    });
}

function hasDirectText(element: HTMLElement): boolean {
  return Array.from(element.childNodes).some((node) =>
    node.nodeType === Node.TEXT_NODE && normalizeStructureText(node.nodeValue ?? '').length > 0
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
    if (revisedGroups.has(id) || elements.length === 0) return;
    const scope = resolveScope(elements[0], originalIndex);
    if (scope.kind !== 'table' || scope.rowIndex === undefined) return;
    const key = `${scope.tableId}\u0000${normalizedGroupText(elements)}`;
    originalCandidateCounts.set(key, (originalCandidateCounts.get(key) ?? 0) + 1);
  });

  revisedGroups.forEach((elements, id) => {
    if (originalGroups.has(id) || elements.length === 0) return;
    const scope = resolveScope(elements[0], revisedIndex);
    if (scope.kind !== 'table' || scope.rowIndex === undefined) return;
    const key = `${scope.tableId}\u0000${normalizedGroupText(elements)}`;
    const candidates = revisedCandidates.get(key) ?? [];
    candidates.push({ id, elements, scope });
    revisedCandidates.set(key, candidates);
  });

  const usedRevisedIds = new Set<string>();
  originalGroups.forEach((elements, id) => {
    if (revisedGroups.has(id) || elements.length === 0) return;
    const scope = resolveScope(elements[0], originalIndex);
    if (scope.kind !== 'table' || scope.rowIndex === undefined) return;

    const key = `${scope.tableId}\u0000${normalizedGroupText(elements)}`;
    if (originalCandidateCounts.get(key) !== 1) return;
    const candidates = (revisedCandidates.get(key) ?? []).filter((candidate) =>
      !usedRevisedIds.has(candidate.id) &&
      candidate.scope.rowIndex !== undefined &&
      Math.abs(candidate.scope.rowIndex - scope.rowIndex!) <= MAX_SCOPE_DISTANCE
    );
    if (candidates.length !== 1) return;

    candidates[0].elements.forEach((element) => {
      element.dataset.diffId = id;
    });
    usedRevisedIds.add(candidates[0].id);
  });
}

function normalizedGroupText(elements: HTMLElement[]): string {
  return normalizeStructureText(elements.map((element) => element.textContent ?? '').join(''));
}

function normalizeStructureText(text: string): string {
  return text.normalize('NFKC').replace(/[\s\u200b\u200c\u200d\ufeff]+/g, '').toLowerCase();
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

function directTableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.querySelectorAll<HTMLTableRowElement>('tr'))
    .filter((row) => row.closest('table') === table);
}

function directRowCells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  return Array.from(row.children)
    .filter((element): element is HTMLTableCellElement =>
      element instanceof HTMLTableCellElement
    );
}
