export type DiffGranularity = 'semantic' | 'word' | 'char';

export type DiffOperation = -1 | 0 | 1;

export type DiffTuple = [DiffOperation, string] & { groupId?: string };

export type DiffSummary = {
  total: number;
  inserted: number;
  deleted: number;
  modified: number;
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
