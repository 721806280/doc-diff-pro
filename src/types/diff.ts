import type { DiffActionSide } from '@/utils/diffActionPlacement';

export type DiffGranularity = 'semantic' | 'word' | 'char';

export type SimilarDiffLevel = 'strict' | 'balanced' | 'loose';

export type DiffOperation = -1 | 0 | 1;

export type DiffTuple = [DiffOperation, string] & { groupId?: string };

export type DiffSummary = {
  total: number;
  inserted: number;
  deleted: number;
  modified: number;
  similarity: number;
  layoutNoiseFiltered: number;
  layoutNoiseItems: LayoutNoiseItem[];
};

export type DiffChangeKind = 'modified' | 'inserted' | 'deleted';

export type DiffReviewContext = 'body' | 'table';

export type DiffMapItem = {
  index: number;
  kind: DiffChangeKind;
  position: number;
};

export type DiffActionPosition = {
  /** Viewport coordinates of the popover itself, not of the difference. */
  top: number;
  /** Horizontal centre of the popover, which is drawn translated by -50%. */
  left: number;
  side: DiffActionSide;
  /** Arrow offset from the popover's left edge, so it keeps pointing at the difference. */
  arrow: number;
};

export type IgnoredDiffItem = {
  id: string;
  index: number;
  kind: DiffChangeKind;
  originalPreview: string;
  revisedPreview: string;
  context?: DiffReviewContext;
};

export type SimilarDiffItem = IgnoredDiffItem & {
  similarity: number;
};

export type LayoutNoiseReason = 'hint' | 'page-number' | 'repeated-layout-text';

export type LayoutNoiseSide = 'original' | 'revised';

export type LayoutNoiseSource = 'native' | 'body';

export type LayoutNoiseItem = {
  side: LayoutNoiseSide;
  reason: LayoutNoiseReason;
  source: LayoutNoiseSource;
  text: string;
  count: number;
};

export type DiffTableContextHintKind =
  'single-row-inserted' | 'single-row-deleted' | 'row-content-shift' | 'cell-count-mismatch';

export type DiffTableContextHintConfidence = 'high' | 'medium';

export type DiffTableRowPreviewRole = 'focus' | 'candidate' | 'missing';

export type DiffTableRowPreview = {
  side: LayoutNoiseSide;
  row: number;
  rowEnd?: number;
  preview: string;
  cellCount?: number;
  role: DiffTableRowPreviewRole;
  missing?: boolean;
};

export type DiffTableContextHint = {
  tableNumber: number;
  originalRows: number;
  revisedRows: number;
  kind: DiffTableContextHintKind;
  confidence: DiffTableContextHintConfidence;
  candidateSide?: LayoutNoiseSide;
  candidateRow?: number;
  candidateRowEnd?: number;
  candidatePreview?: string;
  originalCells?: number;
  revisedCells?: number;
  rowPreviews?: Record<LayoutNoiseSide, DiffTableRowPreview[]>;
};

/**
 * One side of a comparison: the text, and where its blocks begin.
 *
 * The boundaries travel with the text because normalizing it destroys them — a
 * separator between two CJK paragraphs collapses to nothing at all — and the
 * comparison compares one block at a time.
 */
export type DiffSide = {
  text: string;
  boundaries: readonly number[];
};

export type DiffWorkerRequest = {
  id: number;
  original: DiffSide;
  revised: DiffSide;
  granularity: DiffGranularity;
};

export type DiffWorkerResponse = {
  id: number;
  diffs?: DiffTuple[];
  error?: string;
};
