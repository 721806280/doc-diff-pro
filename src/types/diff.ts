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

export type DiffMapItem = {
  index: number;
  kind: DiffChangeKind;
  position: number;
};

export type IgnoredDiffItem = {
  id: string;
  index: number;
  kind: DiffChangeKind;
  originalPreview: string;
  revisedPreview: string;
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
  | 'single-row-inserted'
  | 'single-row-deleted'
  | 'row-content-shift'
  | 'cell-count-mismatch'
  | 'row-count-mismatch';

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

export type DiffWorkerRequest = {
  id: number;
  originalText: string;
  revisedText: string;
  granularity: DiffGranularity;
};

export type DiffWorkerResponse = {
  id: number;
  diffs?: DiffTuple[];
  error?: string;
};
