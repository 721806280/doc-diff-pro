import type { DiffGranularity, DiffSide, DiffTuple, DiffWorkerRequest, DiffWorkerResponse } from '@/types/diff';

type PendingRequest = {
  worker: Worker;
  original: string;
  revised: string;
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
let cancelSequence = 0;
const pendingRequests = new Map<number, PendingRequest>();

export async function createTextDiffsAsync(
  original: DiffSide,
  revised: DiffSide,
  granularity: DiffGranularity
): Promise<DiffTuple[]> {
  const sequence = cancelSequence;
  if (!canUseWorker()) {
    return createMainThreadDiffs(original, revised, granularity, sequence);
  }

  try {
    const diffs = await requestWorkerDiff(original, revised, granularity);
    throwIfCanceled(sequence);
    return diffs;
  } catch (error) {
    throwIfCanceled(sequence);
    if (error instanceof DiffCanceledError || error instanceof DiffTimeoutError) throw error;

    console.warn('[Document diff worker fallback]', error);
    return createMainThreadDiffs(original, revised, granularity, sequence);
  }
}

export function cancelPendingTextDiffs(): void {
  // A fallback may still be awaiting its module even when no worker exists.
  cancelSequence++;
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

    pendingRequests.set(id, {
      worker: currentWorker,
      original: original.text,
      revised: revised.text,
      resolve,
      reject,
      timeoutId
    });
    // Rebuilt field by field rather than forwarded. The caller's text track also
    // carries the live DOM nodes the markup pass needs, and a Text node cannot be
    // structured-cloned — posting one made every comparison fail to reach the
    // worker and quietly finish on the main thread instead.
    try {
      currentWorker.postMessage({
        id,
        original: { text: original.text, boundaries: original.boundaries },
        revised: { text: revised.text, boundaries: revised.boundaries },
        granularity
      } satisfies DiffWorkerRequest);
    } catch (error) {
      // postMessage can throw before the worker receives anything. Retire only
      // this request; its orphaned timeout must not kill later requests.
      pendingRequests.delete(id);
      clearTimeout(timeoutId);
      reject(new Error('Diff worker request could not be sent', { cause: error }));
    }
  });
}

function getWorker(): Worker {
  if (worker) return worker;

  const currentWorker = new Worker(new URL('../workers/diffWorker.ts', import.meta.url), { type: 'module' });
  worker = currentWorker;
  currentWorker.onmessage = (event: MessageEvent<unknown>) => {
    if (worker !== currentWorker) return;
    const response = readWorkerResponse(event.data);
    if (!response) {
      discardWorker(currentWorker, new Error('Diff worker sent an invalid response'));
      return;
    }
    const { id, diffs, error } = response;
    const pending = pendingRequests.get(id);
    if (!pending || pending.worker !== currentWorker) return;
    if (diffs && !diffsMatchInputs(diffs, pending.original, pending.revised)) {
      discardWorker(currentWorker, new Error('Diff worker response does not reproduce the input documents'));
      return;
    }

    pendingRequests.delete(id);
    clearTimeout(pending.timeoutId);
    if (diffs === undefined) {
      pending.reject(new Error(error || 'Diff worker failed'));
    } else {
      pending.resolve(diffs);
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

/** Treat the worker boundary as runtime data, including replies from stale builds. */
function readWorkerResponse(value: unknown): DiffWorkerResponse | null {
  if (typeof value !== 'object' || value === null || !('id' in value)) return null;
  const { id } = value;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;
  if ('error' in value) {
    return typeof value.error === 'string' && !('diffs' in value) ? { id, error: value.error } : null;
  }
  if (!('diffs' in value) || !isDiffTuples(value.diffs)) return null;
  return { id, diffs: value.diffs };
}

function isDiffTuples(value: unknown): value is DiffTuple[] {
  if (!Array.isArray(value)) return false;
  // Iteration visits sparse slots too, unlike Array.every, which would skip them.
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) return false;
    if (entry[0] !== -1 && entry[0] !== 0 && entry[0] !== 1) return false;
    if (typeof entry[1] !== 'string') return false;
    if ('groupId' in entry && typeof entry.groupId !== 'string') return false;
  }
  return true;
}

/** Verify offsets without concatenating another copy of each large document. */
function diffsMatchInputs(diffs: DiffTuple[], original: string, revised: string): boolean {
  let originalOffset = 0;
  let revisedOffset = 0;
  for (const [operation, text] of diffs) {
    if (operation !== 1) {
      if (!original.startsWith(text, originalOffset)) return false;
      originalOffset += text.length;
    }
    if (operation !== -1) {
      if (!revised.startsWith(text, revisedOffset)) return false;
      revisedOffset += text.length;
    }
  }
  return originalOffset === original.length && revisedOffset === revised.length;
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
  granularity: DiffGranularity,
  sequence: number
): Promise<DiffTuple[]> {
  throwIfCanceled(sequence);
  if (original.text.length + revised.text.length > MAX_MAIN_THREAD_DIFF_CHARS) {
    throw new Error('Document is too large to compare safely without a Web Worker.');
  }

  // Imported on demand: this runs only where Worker is missing or the worker
  // itself died, and keeping it static would pull diff-match-patch back onto
  // the main thread's own chunk.
  const { createTextDiffs } = await import('@/utils/textDiffCompute');
  throwIfCanceled(sequence);
  return createTextDiffs(original, revised, granularity);
}

function throwIfCanceled(sequence: number): void {
  if (sequence !== cancelSequence) throw new DiffCanceledError();
}
