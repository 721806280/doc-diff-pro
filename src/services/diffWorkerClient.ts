import type { DiffGranularity, DiffSide, DiffTuple, DiffWorkerRequest, DiffWorkerResponse } from '@/types/diff';

type PendingRequest = {
  worker: Worker;
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
 * `createTextDiffs` bounds every comparison it makes by size, so a healthy
 * worker always answers, and it answers with the same diff whatever machine it
 * is running on. Missing this deadline means something is stuck, not slow.
 */
export const DIFF_WORKER_TIMEOUT_MS = 15000;
export const MAX_MAIN_THREAD_DIFF_CHARS = 300_000;

let worker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

export async function createTextDiffsAsync(
  original: DiffSide,
  revised: DiffSide,
  granularity: DiffGranularity
): Promise<DiffTuple[]> {
  if (!canUseWorker()) {
    return createMainThreadDiffs(original, revised, granularity);
  }

  try {
    return await requestWorkerDiff(original, revised, granularity);
  } catch (error) {
    if (error instanceof DiffCanceledError || error instanceof DiffTimeoutError) throw error;

    console.warn('[Document diff worker fallback]', error);
    return createMainThreadDiffs(original, revised, granularity);
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

function requestWorkerDiff(original: DiffSide, revised: DiffSide, granularity: DiffGranularity): Promise<DiffTuple[]> {
  const currentWorker = getWorker();
  const id = nextRequestId++;

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (!pendingRequests.has(id)) return;

      // Missing the deadline means this worker is stuck, not slow, so it is
      // torn down along with every request still riding on it. Requests that
      // have since moved to a replacement worker are left running.
      discardWorker(currentWorker, new DiffTimeoutError());
    }, DIFF_WORKER_TIMEOUT_MS);

    pendingRequests.set(id, { worker: currentWorker, resolve, reject, timeoutId });
    // Rebuilt field by field rather than forwarded. The caller's text track also
    // carries the live DOM nodes the markup pass needs, and a Text node cannot be
    // structured-cloned — posting one made every comparison fail to reach the
    // worker and quietly finish on the main thread instead.
    currentWorker.postMessage({
      id,
      original: { text: original.text, boundaries: original.boundaries },
      revised: { text: revised.text, boundaries: revised.boundaries },
      granularity
    } satisfies DiffWorkerRequest);
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
  // A reply that fails to deserialize never reaches onmessage, so without this
  // the request would sit pending until the timeout fires.
  currentWorker.onmessageerror = () => {
    discardWorker(currentWorker, new Error('Diff worker sent an unreadable response'));
  };
  currentWorker.onerror = (event) => {
    discardWorker(currentWorker, new Error(event.message || 'Diff worker failed'));
  };

  return currentWorker;
}

/** Retires a worker and fails only the requests that were riding on it. */
function discardWorker(target: Worker, error: Error): void {
  rejectPendingRequests(error, target);
  target.terminate();
  if (worker === target) worker = null;
}

function rejectPendingRequests(error: Error, targetWorker?: Worker): void {
  pendingRequests.forEach((pending, id) => {
    if (targetWorker && pending.worker !== targetWorker) return;

    pendingRequests.delete(id);
    clearTimeout(pending.timeoutId);
    pending.reject(error);
  });
}

async function createMainThreadDiffs(
  original: DiffSide,
  revised: DiffSide,
  granularity: DiffGranularity
): Promise<DiffTuple[]> {
  if (original.text.length + revised.text.length > MAX_MAIN_THREAD_DIFF_CHARS) {
    throw new Error('Document is too large to compare safely without a Web Worker.');
  }

  // Imported on demand: this runs only where Worker is missing or the worker
  // itself died, and keeping it static would pull diff-match-patch back onto
  // the main thread's own chunk.
  const { createTextDiffs } = await import('@/utils/textDiffCompute');
  return createTextDiffs(original, revised, granularity);
}
