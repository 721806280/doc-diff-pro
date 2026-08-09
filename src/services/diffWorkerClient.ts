import type { DiffGranularity, DiffTuple, DiffWorkerRequest, DiffWorkerResponse } from '@/types/diff';

type PendingRequest = {
  resolve: (diffs: DiffTuple[]) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

class DiffCanceledError extends Error {
  constructor() {
    super('Diff request canceled');
    this.name = 'DiffCanceledError';
  }
}

class DiffTimeoutError extends Error {
  constructor() {
    super('Diff request timed out');
    this.name = 'DiffTimeoutError';
  }
}

/**
 * Backstop for a wedged worker rather than a budget for a slow one:
 * `createTextDiffs` stops bisecting after DIFF_COMPUTE_TIMEOUT_SECONDS and
 * returns a coarse diff, so a healthy worker always answers first. The gap
 * between the two leaves room for the cleanup passes that follow the bisect.
 */
export const DIFF_WORKER_TIMEOUT_MS = 15000;
export const MAX_MAIN_THREAD_DIFF_CHARS = 300_000;

let worker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

export async function createTextDiffsAsync(
  originalText: string,
  revisedText: string,
  granularity: DiffGranularity
): Promise<DiffTuple[]> {
  if (!canUseWorker()) {
    return createMainThreadDiffs(originalText, revisedText, granularity);
  }

  try {
    return await requestWorkerDiff(originalText, revisedText, granularity);
  } catch (error) {
    if (error instanceof DiffCanceledError || error instanceof DiffTimeoutError) throw error;

    console.warn('[Document diff worker fallback]', error);
    return createMainThreadDiffs(originalText, revisedText, granularity);
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
    const timeoutId = setTimeout(() => {
      if (!pendingRequests.has(id)) return;

      const error = new DiffTimeoutError();
      rejectPendingRequests(error);
      currentWorker.terminate();
      if (worker === currentWorker) worker = null;
    }, DIFF_WORKER_TIMEOUT_MS);

    pendingRequests.set(id, { resolve, reject, timeoutId });
    currentWorker.postMessage({ id, originalText, revisedText, granularity } satisfies DiffWorkerRequest);
  });
}

function getWorker(): Worker {
  if (worker) return worker;

  const currentWorker = new Worker(new URL('../workers/diffWorker.ts', import.meta.url), { type: 'module' });
  worker = currentWorker;
  currentWorker.onmessage = (event: MessageEvent<DiffWorkerResponse>) => {
    const { id, diffs, error } = event.data;
    const pending = pendingRequests.get(id);
    if (!pending) return;

    pendingRequests.delete(id);
    clearTimeout(pending.timeoutId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(diffs ?? []);
    }
  };
  currentWorker.onerror = (event) => {
    if (worker !== currentWorker) return;
    rejectPendingRequests(new Error(event.message || 'Diff worker failed'));
    currentWorker.terminate();
    worker = null;
  };

  return currentWorker;
}

function rejectPendingRequests(error: Error): void {
  pendingRequests.forEach(({ reject, timeoutId }) => {
    clearTimeout(timeoutId);
    reject(error);
  });
  pendingRequests.clear();
}

async function createMainThreadDiffs(
  originalText: string,
  revisedText: string,
  granularity: DiffGranularity
): Promise<DiffTuple[]> {
  if (originalText.length + revisedText.length > MAX_MAIN_THREAD_DIFF_CHARS) {
    throw new Error('Document is too large to compare safely without a Web Worker.');
  }

  // Imported on demand: this runs only where Worker is missing or the worker
  // itself died, and keeping it static would pull diff-match-patch back onto
  // the main thread's own chunk.
  const { createTextDiffs } = await import('@/utils/textDiffCompute');
  return createTextDiffs(originalText, revisedText, granularity);
}
