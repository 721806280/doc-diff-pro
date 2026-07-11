import type {
  DiffTableContextHint,
  DiffTableRowPreview,
  DiffTableRowPreviewRole,
  LayoutNoiseSide
} from '@/types/diff';
import { normalizeText } from './documentText';

export type TableStructureHintOptions = {
  ignoreSpaces: boolean;
  ignoreFullHalfWidth: boolean;
};

export type TableStructureResolution = {
  hint: DiffTableContextHint;
  contextRows: HTMLElement[];
  candidateRows: HTMLElement[];
};

type TableInfo = {
  table: HTMLTableElement;
  index: number;
};

type TableSideData = {
  rows: HTMLTableRowElement[];
  rowSignatures: string[];
  cellSignatures: string[][];
};

type TableContext = {
  tableNumber: number;
  originalTable: HTMLTableElement;
  revisedTable: HTMLTableElement;
  original: TableSideData;
  revised: TableSideData;
  contextRows: HTMLElement[];
};

type TableDiagnosis = Omit<
  DiffTableContextHint,
  'tableNumber' | 'originalRows' | 'revisedRows' | 'rowPreviews'
> & {
  candidateIndex?: number;
  candidateRows?: HTMLTableRowElement[];
  previewSources?: RowPreviewSource[];
};

type RowPreviewSource = {
  side: LayoutNoiseSide;
  rows: HTMLTableRowElement[];
  rowIndex: number;
  rowEndIndex?: number;
  role: DiffTableRowPreviewRole;
  missing?: boolean;
};

type SplitRowWindowMatch = {
  splitIndex: number;
  splitRows: HTMLTableRowElement[];
  score: number;
};

type SplitRowMatch = SplitRowWindowMatch & {
  compactIndex: number;
};

const PREVIEW_LIMIT = 52;
const MIN_SPLIT_ROW_SCORE = 0.72;
const HIGH_CONFIDENCE_SPLIT_ROW_SCORE = 0.92;
const MAX_SPLIT_ROW_WINDOW = 3;

/**
 * The structure diagnosis judges *structure* (same cells? same row count? a
 * row added/removed?), never surface content edits. Whitespace and full/half
 * width variants are pure formatting to the eye and to the diff the user chose
 * to show, so signatures must always collapse them — independent of the UI
 * compare-level normalization flags. Otherwise a user who disables "ignore
 * spaces" / "normalize width" would see every in-cell space edit fabricate a
 * bogus table-structure hint. See App.vue → updateTableStructureHint callers.
 */
function structureNormalize(text: string): string {
  return normalizeText(text, true, false)
    .replace(/[​‌‍﻿]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, '');
}

export function resolveTableStructureHint(
  originalRoot: HTMLElement | null,
  revisedRoot: HTMLElement | null,
  originalElements: HTMLElement[],
  revisedElements: HTMLElement[],
  options: TableStructureHintOptions
): TableStructureResolution | null {
  const context = createTableContext(originalRoot, revisedRoot, originalElements, revisedElements);
  if (!context) return null;
  if (shouldSuppressInCellFormattingHint(context, originalElements, revisedElements, options)) return null;

  const diagnosis = diagnoseTableStructure(context);
  if (!diagnosis) return null;

  return buildResolution(context, diagnosis);
}

function createTableContext(
  originalRoot: HTMLElement | null,
  revisedRoot: HTMLElement | null,
  originalElements: HTMLElement[],
  revisedElements: HTMLElement[]
): TableContext | null {
  if (!originalRoot || !revisedRoot) return null;

  const tablePair = findTablePair(originalRoot, revisedRoot, originalElements, revisedElements);
  if (!tablePair) return null;

  return {
    tableNumber: tablePair.tableIndex + 1,
    originalTable: tablePair.originalTable,
    revisedTable: tablePair.revisedTable,
    original: createTableSideData(tablePair.originalTable),
    revised: createTableSideData(tablePair.revisedTable),
    contextRows: collectContextRows(originalElements, revisedElements)
  };
}

function shouldSuppressInCellFormattingHint(
  context: TableContext,
  originalElements: HTMLElement[],
  revisedElements: HTMLElement[],
  options: TableStructureHintOptions
): boolean {
  if (options.ignoreSpaces && options.ignoreFullHalfWidth) return false;

  const originalPositions = diffElementCellPositions(context.originalTable, originalElements);
  const revisedPositions = diffElementCellPositions(context.revisedTable, revisedElements);
  if (originalPositions.length === 0 || revisedPositions.length === 0) return false;

  const originalRowIndex = singleSharedRowIndex(originalPositions);
  const revisedRowIndex = singleSharedRowIndex(revisedPositions);
  if (originalRowIndex === null || revisedRowIndex === null) return false;
  if (originalRowIndex !== revisedRowIndex) return false;

  const revisedCellIndexes = new Set(revisedPositions.map((position) => position.cellIndex));
  return originalPositions.some((position) => revisedCellIndexes.has(position.cellIndex));
}

function findTablePair(
  originalRoot: HTMLElement,
  revisedRoot: HTMLElement,
  originalElements: HTMLElement[],
  revisedElements: HTMLElement[]
): { tableIndex: number; originalTable: HTMLTableElement; revisedTable: HTMLTableElement } | null {
  const originalInfo = findDiffTableInfo(originalRoot, originalElements);
  const revisedInfo = findDiffTableInfo(revisedRoot, revisedElements);
  const tableIndex = originalInfo?.index ?? revisedInfo?.index;
  if (tableIndex === undefined) return null;

  const originalTable = originalInfo?.table ?? tableAtIndex(originalRoot, tableIndex);
  const revisedTable = revisedInfo?.table ?? tableAtIndex(revisedRoot, tableIndex);
  if (!originalTable || !revisedTable) return null;

  return { tableIndex, originalTable, revisedTable };
}

function createTableSideData(table: HTMLTableElement): TableSideData {
  const rows = directTableRows(table);

  return {
    rows,
    rowSignatures: rows.map(rowSignature),
    cellSignatures: rows.map(rowCellSignatures)
  };
}

function diagnoseTableStructure(context: TableContext): TableDiagnosis | null {
  return detectSingleRowChange(context, 'revised')
    ?? detectSingleRowChange(context, 'original')
    ?? detectAdjacentRowShift(context)
    ?? detectCellCountMismatch(context);
}

function detectSingleRowChange(context: TableContext, candidateSide: LayoutNoiseSide): TableDiagnosis | null {
  const candidateData = sideData(context, candidateSide);
  const oppositeData = sideData(context, oppositeSide(candidateSide));
  if (candidateData.rows.length !== oppositeData.rows.length + 1) return null;

  const candidates = removableIndexes(candidateData.rowSignatures, oppositeData.rowSignatures);
  if (candidates.length !== 1) return null;

  const candidateIndex = candidates[0];
  const candidateRow = candidateData.rows[candidateIndex];
  if (!candidateRow || !touchesContextRows([candidateRow], context.contextRows)) return null;

  return {
    kind: candidateSide === 'revised' ? 'single-row-inserted' : 'single-row-deleted',
    confidence: 'high',
    candidateSide,
    candidateRow: candidateIndex + 1,
    candidateIndex,
    candidatePreview: rowPreview(candidateData.rows[candidateIndex]),
    previewSources: [
      actualRowPreviewSource(candidateSide, candidateData.rows, candidateIndex, 'candidate'),
      {
        side: oppositeSide(candidateSide),
        rows: [],
        rowIndex: candidateIndex,
        role: 'missing',
        missing: true
      }
    ]
  };
}

function detectAdjacentRowShift(context: TableContext): TableDiagnosis | null {
  return findAdjacentRowShift(context, 'original', 'revised')
    ?? findAdjacentRowShift(context, 'revised', 'original');
}

function findAdjacentRowShift(
  context: TableContext,
  compactSide: LayoutNoiseSide,
  splitSide: LayoutNoiseSide
): TableDiagnosis | null {
  const compactData = sideData(context, compactSide);
  const splitData = sideData(context, splitSide);
  let bestMatch: SplitRowMatch | null = null;

  for (let compactIndex = 0; compactIndex < compactData.cellSignatures.length; compactIndex++) {
    const compactCells = compactData.cellSignatures[compactIndex];
    if (compactCells.length < 2) continue;

    for (let splitIndex = 0; splitIndex < splitData.rows.length - 1; splitIndex++) {
      const splitMatch = scoreSplitWindow(context, compactData.rows[compactIndex], compactCells, splitData, splitIndex);
      if (!splitMatch || splitMatch.score <= (bestMatch?.score ?? 0)) continue;

      bestMatch = {
        ...splitMatch,
        compactIndex
      };
    }
  }

  if (!bestMatch) return null;

  return {
    kind: 'row-content-shift',
    confidence: bestMatch.score >= HIGH_CONFIDENCE_SPLIT_ROW_SCORE ? 'high' : 'medium',
    candidateSide: splitSide,
    candidateRow: bestMatch.splitIndex + 1,
    candidateRowEnd: bestMatch.splitIndex + bestMatch.splitRows.length,
    candidateIndex: bestMatch.splitIndex,
    candidateRows: bestMatch.splitRows,
    candidatePreview: rowsPreview(bestMatch.splitRows),
    previewSources: [
      actualRowPreviewSource(compactSide, compactData.rows, bestMatch.compactIndex, 'focus'),
      actualRowsPreviewSource(splitSide, bestMatch.splitRows, bestMatch.splitIndex, 'candidate')
    ]
  };
}

function scoreSplitWindow(
  context: TableContext,
  compactRow: HTMLTableRowElement,
  compactCells: string[],
  splitData: TableSideData,
  splitIndex: number
): SplitRowWindowMatch | null {
  let bestMatch: SplitRowWindowMatch | null = null;

  for (let windowSize = 2; windowSize <= MAX_SPLIT_ROW_WINDOW; windowSize++) {
    const splitRows = splitData.rows.slice(splitIndex, splitIndex + windowSize);
    if (splitRows.length < windowSize) continue;
    if (!touchesContextRows([compactRow, ...splitRows], context.contextRows)) continue;

    const mergedSplitCells = splitData.cellSignatures
      .slice(splitIndex, splitIndex + windowSize)
      .flat();
    const score = cellCoverageScore(compactCells, mergedSplitCells);
    if (score < MIN_SPLIT_ROW_SCORE || score <= (bestMatch?.score ?? 0)) continue;

    bestMatch = { splitIndex, splitRows, score };
  }

  return bestMatch;
}

function detectCellCountMismatch(context: TableContext): TableDiagnosis | null {
  const pairs = pairContextRows(context);

  for (const [originalIndex, revisedIndex] of pairs) {
    const originalRow = context.original.rows[originalIndex];
    const revisedRow = context.revised.rows[revisedIndex];
    if (!originalRow || !revisedRow) continue;

    const originalCells = physicalCellCount(originalRow);
    const revisedCells = physicalCellCount(revisedRow);
    if (originalCells === revisedCells || Math.max(originalCells, revisedCells) < 2) continue;

    const candidateSide = originalCells < revisedCells ? 'original' : 'revised';
    const candidateRow = candidateSide === 'original' ? originalIndex + 1 : revisedIndex + 1;
    const candidateRowElement = candidateSide === 'original' ? originalRow : revisedRow;

    return {
      kind: 'cell-count-mismatch',
      confidence: 'high',
      candidateSide,
      candidateRow,
      candidateIndex: candidateRow - 1,
      candidateRows: [originalRow, revisedRow],
      candidatePreview: rowPreview(candidateRowElement),
      originalCells,
      revisedCells,
      previewSources: [
        actualRowPreviewSource(
          'original',
          context.original.rows,
          originalIndex,
          candidateSide === 'original' ? 'candidate' : 'focus'
        ),
        actualRowPreviewSource(
          'revised',
          context.revised.rows,
          revisedIndex,
          candidateSide === 'revised' ? 'candidate' : 'focus'
        )
      ]
    };
  }

  return null;
}

function buildResolution(context: TableContext, diagnosis: TableDiagnosis): TableStructureResolution {
  const candidateRows = diagnosis.candidateRows ?? resolveCandidateRows(context, diagnosis);

  return {
    hint: {
      tableNumber: context.tableNumber,
      originalRows: context.original.rows.length,
      revisedRows: context.revised.rows.length,
      kind: diagnosis.kind,
      confidence: diagnosis.confidence,
      candidateSide: diagnosis.candidateSide,
      candidateRow: diagnosis.candidateRow,
      candidateRowEnd: diagnosis.candidateRowEnd,
      candidatePreview: diagnosis.candidatePreview,
      originalCells: diagnosis.originalCells,
      revisedCells: diagnosis.revisedCells,
      rowPreviews: buildRowPreviews(context, diagnosis)
    },
    contextRows: context.contextRows,
    candidateRows
  };
}

function buildRowPreviews(
  context: TableContext,
  diagnosis: TableDiagnosis
): Record<LayoutNoiseSide, DiffTableRowPreview[]> {
  const previews: Record<LayoutNoiseSide, DiffTableRowPreview[]> = {
    original: [],
    revised: []
  };
  const seen = new Set<string>();
  const sources = diagnosis.previewSources?.length
    ? diagnosis.previewSources
    : defaultRowPreviewSources(context, diagnosis);

  sources.forEach((source) => {
    const preview = createRowPreview(source);
    if (!preview) return;

    const key = [
      preview.side,
      preview.row,
      preview.rowEnd ?? preview.row,
      preview.role,
      preview.missing ? 'missing' : 'present'
    ].join(':');
    if (seen.has(key)) return;

    seen.add(key);
    previews[preview.side].push(preview);
  });

  return {
    original: previews.original.slice(0, 3),
    revised: previews.revised.slice(0, 3)
  };
}

function defaultRowPreviewSources(context: TableContext, diagnosis: TableDiagnosis): RowPreviewSource[] {
  if (diagnosis.candidateSide && diagnosis.candidateIndex !== undefined) {
    return resolveCandidateRows(context, diagnosis).map((row, offset) => ({
      side: diagnosis.candidateSide as LayoutNoiseSide,
      rows: [row],
      rowIndex: (diagnosis.candidateIndex as number) + offset,
      role: 'candidate'
    }));
  }

  return pairContextRows(context)
    .slice(0, 2)
    .flatMap(([originalIndex, revisedIndex]) => [
      actualRowPreviewSource('original', context.original.rows, originalIndex, 'focus'),
      actualRowPreviewSource('revised', context.revised.rows, revisedIndex, 'focus')
    ]);
}

function actualRowPreviewSource(
  side: LayoutNoiseSide,
  rows: HTMLTableRowElement[],
  rowIndex: number,
  role: DiffTableRowPreviewRole
): RowPreviewSource {
  return actualRowsPreviewSource(side, rows.slice(rowIndex, rowIndex + 1), rowIndex, role);
}

function actualRowsPreviewSource(
  side: LayoutNoiseSide,
  rows: HTMLTableRowElement[],
  rowIndex: number,
  role: DiffTableRowPreviewRole
): RowPreviewSource {
  return {
    side,
    rows,
    rowIndex,
    rowEndIndex: rowIndex + rows.length - 1,
    role
  };
}

function createRowPreview(source: RowPreviewSource): DiffTableRowPreview | null {
  if (source.missing) {
    return {
      side: source.side,
      row: source.rowIndex + 1,
      rowEnd: source.rowEndIndex === undefined ? undefined : source.rowEndIndex + 1,
      preview: '',
      role: source.role,
      missing: true
    };
  }

  const rows = source.rows.filter(Boolean);
  if (rows.length === 0) return null;

  return {
    side: source.side,
    row: source.rowIndex + 1,
    rowEnd: source.rowEndIndex === undefined ? undefined : source.rowEndIndex + 1,
    preview: rowsPreview(rows),
    cellCount: rows.reduce((count, row) => count + physicalCellCount(row), 0),
    role: source.role
  };
}

function resolveCandidateRows(context: TableContext, diagnosis: TableDiagnosis): HTMLTableRowElement[] {
  if (!diagnosis.candidateSide) return [];

  const row = sideData(context, diagnosis.candidateSide).rows[diagnosis.candidateIndex ?? -1];
  return row ? [row] : [];
}

function sideData(context: TableContext, side: LayoutNoiseSide): TableSideData {
  return side === 'original' ? context.original : context.revised;
}

function oppositeSide(side: LayoutNoiseSide): LayoutNoiseSide {
  return side === 'original' ? 'revised' : 'original';
}

function pairContextRows(context: TableContext): Array<[number, number]> {
  const originalIndexes = contextRowIndexes(context.original.rows, context.contextRows);
  const revisedIndexes = contextRowIndexes(context.revised.rows, context.contextRows);

  if (originalIndexes.length > 0 && revisedIndexes.length > 0) {
    return originalIndexes.flatMap((originalIndex) =>
      revisedIndexes.map((revisedIndex) => [originalIndex, revisedIndex] as [number, number])
    );
  }

  if (originalIndexes.length > 0) {
    return originalIndexes
      .map((originalIndex) =>
        [originalIndex, Math.min(originalIndex, context.revised.rows.length - 1)] as [number, number]
      )
      .filter(([, revisedIndex]) => revisedIndex >= 0);
  }

  return revisedIndexes
    .map((revisedIndex) =>
      [Math.min(revisedIndex, context.original.rows.length - 1), revisedIndex] as [number, number]
    )
    .filter(([originalIndex]) => originalIndex >= 0);
}

function contextRowIndexes(rows: HTMLTableRowElement[], contextRows: HTMLElement[]): number[] {
  return rows
    .map((row, index) => contextRows.includes(row) ? index : -1)
    .filter((index) => index >= 0);
}

function touchesContextRows(rows: HTMLTableRowElement[], contextRows: HTMLElement[]): boolean {
  return rows.some((row) => row && contextRows.includes(row));
}

function physicalCellCount(row: HTMLTableRowElement): number {
  return row.cells.length;
}

function rowSignature(row: HTMLTableRowElement): string {
  const text = Array.from(row.cells)
    .map((cell) => cell.textContent ?? '')
    .join('	');
  return structureNormalize(text);
}

function rowCellSignatures(row: HTMLTableRowElement): string[] {
  return Array.from(row.cells)
    .map((cell) => structureNormalize(cell.textContent ?? ''))
    .filter(Boolean);
}

function cellCoverageScore(sourceCells: string[], targetCells: string[]): number {
  if (sourceCells.length === 0 || targetCells.length === 0) return 0;

  const availableTargets = [...targetCells];
  let score = 0;

  for (const sourceCell of sourceCells) {
    const bestIndex = findBestCellMatch(sourceCell, availableTargets);
    if (bestIndex < 0) continue;

    score += textSimilarity(sourceCell, availableTargets[bestIndex]);
    availableTargets.splice(bestIndex, 1);
  }

  return score / Math.max(sourceCells.length, targetCells.length);
}

function findBestCellMatch(sourceCell: string, targetCells: string[]): number {
  let bestIndex = -1;
  let bestScore = 0;

  targetCells.forEach((targetCell, index) => {
    const score = textSimilarity(sourceCell, targetCell);
    if (score <= bestScore) return;

    bestScore = score;
    bestIndex = index;
  });

  return bestScore >= MIN_SPLIT_ROW_SCORE ? bestIndex : -1;
}

function textSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (longer.includes(shorter)) {
    const containmentRatio = shorter.length / longer.length;
    return containmentRatio >= 0.5 ? Math.max(0.72, containmentRatio) : containmentRatio;
  }

  const commonLength = longestCommonSubsequenceLength(left, right);
  return (2 * commonLength) / (left.length + right.length);
}

function longestCommonSubsequenceLength(left: string, right: string): number {
  let previous = new Array<number>(right.length + 1).fill(0);
  let current = new Array<number>(right.length + 1).fill(0);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex++) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex++) {
      current[rightIndex + 1] = left[leftIndex] === right[rightIndex]
        ? previous[rightIndex] + 1
        : Math.max(previous[rightIndex + 1], current[rightIndex]);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }

  return previous[right.length];
}

function removableIndexes(source: string[], target: string[]): number[] {
  if (source.length !== target.length + 1) return [];

  const candidates: number[] = [];
  const prefixMatches = new Array<boolean>(target.length + 1);
  const suffixMatches = new Array<boolean>(target.length + 1);

  prefixMatches[0] = true;
  for (let index = 0; index < target.length; index++) {
    prefixMatches[index + 1] = prefixMatches[index] && source[index] === target[index];
  }

  suffixMatches[target.length] = true;
  for (let index = target.length - 1; index >= 0; index--) {
    suffixMatches[index] = suffixMatches[index + 1] && source[index + 1] === target[index];
  }

  for (let index = 0; index < source.length; index++) {
    if (prefixMatches[index] && suffixMatches[index]) candidates.push(index);
  }

  return candidates;
}

function findDiffTableInfo(root: HTMLElement, elements: HTMLElement[]): TableInfo | null {
  const tables = tableElements(root);

  for (const element of elements) {
    const table = element.closest<HTMLTableElement>('table');
    if (!table) continue;

    const index = tables.indexOf(table);
    if (index >= 0) return { table, index };
  }

  return null;
}

function tableAtIndex(root: HTMLElement, index: number): HTMLTableElement | null {
  return tableElements(root)[index] ?? null;
}

function tableElements(root: HTMLElement): HTMLTableElement[] {
  return Array.from(root.querySelectorAll<HTMLTableElement>('table'));
}

function directTableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.querySelectorAll<HTMLTableRowElement>('tr'))
    .filter((row) => row.closest('table') === table);
}

function rowPreview(row: HTMLTableRowElement): string {
  const preview = Array.from(row.cells)
    .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' | ');

  return truncatePreview(preview);
}

function rowsPreview(rows: HTMLTableRowElement[]): string {
  return truncatePreview(rows.map(rowPreview).filter(Boolean).join(' / '));
}

function truncatePreview(preview: string): string {
  return preview.length > PREVIEW_LIMIT
    ? `${preview.slice(0, PREVIEW_LIMIT - 1)}...`
    : preview;
}

function collectContextRows(originalElements: HTMLElement[], revisedElements: HTMLElement[]): HTMLElement[] {
  const rows = new Set<HTMLElement>();

  [...originalElements, ...revisedElements].forEach((element) => {
    const row = element.closest<HTMLElement>('tr');
    if (row) rows.add(row);
  });

  return Array.from(rows);
}

type TableCellPosition = {
  rowIndex: number;
  cellIndex: number;
};

function diffElementCellPositions(table: HTMLTableElement, elements: HTMLElement[]): TableCellPosition[] {
  const rows = directTableRows(table);

  return elements.flatMap((element) => {
    const row = element.closest<HTMLTableRowElement>('tr');
    const cell = element.closest<HTMLTableCellElement>('td, th');
    if (!row || !cell || row.closest('table') !== table || cell.closest('table') !== table) return [];

    const rowIndex = rows.indexOf(row);
    if (rowIndex < 0 || cell.cellIndex < 0) return [];

    return [{ rowIndex, cellIndex: cell.cellIndex }];
  });
}

function singleSharedRowIndex(positions: TableCellPosition[]): number | null {
  const [first] = positions;
  if (!first) return null;

  return positions.every((position) => position.rowIndex === first.rowIndex)
    ? first.rowIndex
    : null;
}
