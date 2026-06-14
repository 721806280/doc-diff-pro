import type { DiffGranularity, DiffTuple, DiffWorkerRequest, DiffWorkerResponse } from '@/types/diff';
import { createTextDiffs } from './textDiffCore';

type PendingRequest = {
  resolve: (diffs: DiffTuple[]) => void;
  reject: (error: Error) => void;
};

class DiffCanceledError extends Error {
  constructor() {
    super('Diff request canceled');
    this.name = 'DiffCanceledError';
  }
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

export async function createTextDiffsAsync(
  originalText: string,
  revisedText: string,
  granularity: DiffGranularity
): Promise<DiffTuple[]> {
  if (!canUseWorker()) {
    return createTextDiffs(originalText, revisedText, granularity);
  }

  try {
    return await requestWorkerDiff(originalText, revisedText, granularity);
  } catch (error) {
    if (error instanceof DiffCanceledError) throw error;

    console.warn('[文档比对 Worker 回退]', error);
    return createTextDiffs(originalText, revisedText, granularity);
  }
}

export function cancelPendingTextDiffs(): void {
  if (!worker && pendingRequests.size === 0) return;

  rejectPendingRequests(new DiffCanceledError());
  worker?.terminate();
  worker = null;
}

function canUseWorker(): boolean {
  return typeof Worker !== 'undefined';
}

function requestWorkerDiff(
  originalText: string,
  revisedText: string,
  granularity: DiffGranularity
): Promise<DiffTuple[]> {
  const currentWorker = getWorker();
  const id = nextRequestId++;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    currentWorker.postMessage({ id, originalText, revisedText, granularity } satisfies DiffWorkerRequest);
  });
}

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL('./diffWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<DiffWorkerResponse>) => {
    const { id, diffs, error } = event.data;
    const pending = pendingRequests.get(id);
    if (!pending) return;

    pendingRequests.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(diffs ?? []);
    }
  };
  worker.onerror = (event) => {
    rejectPendingRequests(new Error(event.message || 'Diff worker failed'));
    worker?.terminate();
    worker = null;
  };

  return worker;
}

function rejectPendingRequests(error: Error): void {
  pendingRequests.forEach(({ reject }) => reject(error));
  pendingRequests.clear();
}
