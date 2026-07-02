export type DiffGranularity = 'semantic' | 'word' | 'char';

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

export type LayoutNoiseReason = 'hint' | 'page-number' | 'repeated-layout-text';

export type LayoutNoiseSide = 'original' | 'revised';

export type LayoutNoiseItem = {
  side: LayoutNoiseSide;
  reason: LayoutNoiseReason;
  text: string;
  count: number;
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
