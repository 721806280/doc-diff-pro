import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffTuple } from '@/types/diff';

const mocks = vi.hoisted(() => ({
  createTextDiffs: vi.fn(() => [[0, 'fallback']] as DiffTuple[])
}));

vi.mock('@/utils/textDiffCompute', () => ({
  createTextDiffs: mocks.createTextDiffs
}));

type FakeWorkerInstance = {
  onmessage: ((event: MessageEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
};

function installFakeWorker(): FakeWorkerInstance[] {
  const instances: FakeWorkerInstance[] = [];

  class FakeWorker implements FakeWorkerInstance {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();

    constructor() {
      instances.push(this);
    }
  }

  vi.stubGlobal('Worker', FakeWorker);
  return instances;
}

/** A document side with no block boundaries, which is all these tests need. */
function side(text: string) {
  return { text, boundaries: [] };
}

describe('diffWorkerClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    mocks.createTextDiffs.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts only the fields a worker can clone, whatever the caller handed it', async () => {
    // The comparison engine passes its whole text track, which also carries the
    // live DOM nodes the markup pass needs. A Text node cannot be
    // structured-cloned, so forwarding the track verbatim made every comparison
    // fail to reach the worker and quietly finish on the main thread — visible
    // only as a console warning.
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');
    const track = {
      text: 'before',
      boundaries: [],
      mapping: { nodes: [document.createTextNode('before')], nodeIds: new Int32Array(6), offsets: new Int32Array(6) }
    };

    void createTextDiffsAsync(track, track, 'char');

    expect(workers[0]!.postMessage).toHaveBeenCalledWith({
      id: 1,
      original: side('before'),
      revised: side('before'),
      granularity: 'char'
    });
  });

  it('does not run the synchronous fallback for canceled worker requests', async () => {
    const workers = installFakeWorker();
    const { cancelPendingTextDiffs, createTextDiffsAsync } = await import('./diffWorkerClient');

    const pendingDiff = createTextDiffsAsync(side('a'), side('b'), 'char');

    expect(workers).toHaveLength(1);
    cancelPendingTextDiffs();

    await expect(pendingDiff).rejects.toThrow('Diff request canceled');
    expect(mocks.createTextDiffs).not.toHaveBeenCalled();
    expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
  });

  it('resolves a successful worker response without using the fallback', async () => {
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');

    const pendingDiff = createTextDiffsAsync(side('before'), side('after'), 'word');
    expect(workers[0]!.postMessage).toHaveBeenCalledWith({
      id: 1,
      original: side('before'),
      revised: side('after'),
      granularity: 'word'
    });
    workers[0]!.onmessage?.({ data: { id: 1, diffs: [[1, 'after']] } } as MessageEvent);

    await expect(pendingDiff).resolves.toEqual([[1, 'after']]);
    expect(mocks.createTextDiffs).not.toHaveBeenCalled();
  });

  it('matches concurrent worker responses by request id', async () => {
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');

    const first = createTextDiffsAsync(side('a'), side('b'), 'char');
    const second = createTextDiffsAsync(side('c'), side('d'), 'char');

    expect(workers).toHaveLength(1);
    const firstId = workers[0]!.postMessage.mock.calls[0]![0].id as number;
    const secondId = workers[0]!.postMessage.mock.calls[1]![0].id as number;
    workers[0]!.onmessage?.({ data: { id: secondId, diffs: [[1, 'd']] } } as MessageEvent);
    workers[0]!.onmessage?.({ data: { id: firstId, diffs: [[-1, 'a']] } } as MessageEvent);

    await expect(first).resolves.toEqual([[-1, 'a']]);
    await expect(second).resolves.toEqual([[1, 'd']]);
  });

  it('uses the synchronous fallback when the worker reports a request error', async () => {
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');

    const pendingDiff = createTextDiffsAsync(side('a'), side('b'), 'char');
    const id = workers[0]!.postMessage.mock.calls[0]![0].id as number;
    workers[0]!.onmessage?.({ data: { id, error: 'worker failed' } } as MessageEvent);

    await expect(pendingDiff).resolves.toEqual([[0, 'fallback']]);
    expect(mocks.createTextDiffs).toHaveBeenCalledWith(side('a'), side('b'), 'char');
  });

  it('uses the synchronous fallback when the worker fails', async () => {
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');

    const pendingDiff = createTextDiffsAsync(side('a'), side('b'), 'char');
    workers[0]!.onerror?.({ message: 'boom' } as ErrorEvent);

    await expect(pendingDiff).resolves.toEqual([[0, 'fallback']]);
    expect(mocks.createTextDiffs).toHaveBeenCalledWith(side('a'), side('b'), 'char');
    expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
  });

  it('ignores late errors from a canceled worker after its replacement starts', async () => {
    const workers = installFakeWorker();
    const { cancelPendingTextDiffs, createTextDiffsAsync } = await import('./diffWorkerClient');

    const canceledDiff = createTextDiffsAsync(side('old'), side('request'), 'word');
    cancelPendingTextDiffs();
    await expect(canceledDiff).rejects.toThrow('Diff request canceled');

    const currentDiff = createTextDiffsAsync(side('new'), side('request'), 'word');
    const currentId = workers[1]!.postMessage.mock.calls[0]![0].id as number;
    workers[0]!.onerror?.({ message: 'late worker error' } as ErrorEvent);
    workers[1]!.onmessage?.({ data: { id: currentId, diffs: [[1, 'request']] } } as MessageEvent);

    await expect(currentDiff).resolves.toEqual([[1, 'request']]);
    expect(workers[1]!.terminate).not.toHaveBeenCalled();
    expect(mocks.createTextDiffs).not.toHaveBeenCalled();
  });

  it('falls back instead of hanging when a worker reply cannot be deserialized', async () => {
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');

    const pendingDiff = createTextDiffsAsync(side('a'), side('b'), 'char');
    workers[0]!.onmessageerror?.({} as MessageEvent);

    await expect(pendingDiff).resolves.toEqual([[0, 'fallback']]);
    expect(mocks.createTextDiffs).toHaveBeenCalledWith(side('a'), side('b'), 'char');
    expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
  });

  it('retires only the failing worker, leaving a replacement request untouched', async () => {
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');

    const failedDiff = createTextDiffsAsync(side('old'), side('request'), 'word');
    workers[0]!.onmessageerror?.({} as MessageEvent);
    await expect(failedDiff).resolves.toEqual([[0, 'fallback']]);

    const currentDiff = createTextDiffsAsync(side('new'), side('request'), 'word');
    const currentId = workers[1]!.postMessage.mock.calls[0]![0].id as number;
    workers[0]!.onerror?.({ message: 'late worker error' } as ErrorEvent);
    workers[1]!.onmessage?.({ data: { id: currentId, diffs: [[1, 'request']] } } as MessageEvent);

    await expect(currentDiff).resolves.toEqual([[1, 'request']]);
    expect(workers[1]!.terminate).not.toHaveBeenCalled();
  });

  it('does not run the synchronous fallback for timed out worker requests', async () => {
    vi.useFakeTimers();
    const workers = installFakeWorker();
    const { createTextDiffsAsync, DIFF_WORKER_TIMEOUT_MS } = await import('./diffWorkerClient');

    const pendingDiff = createTextDiffsAsync(side('a'), side('b'), 'char');
    const expectation = expect(pendingDiff).rejects.toThrow('Diff request timed out');
    await vi.advanceTimersByTimeAsync(DIFF_WORKER_TIMEOUT_MS);

    await expectation;
    expect(mocks.createTextDiffs).not.toHaveBeenCalled();
    expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects large synchronous fallback requests when workers are unavailable', async () => {
    vi.stubGlobal('Worker', undefined);
    const { createTextDiffsAsync, MAX_MAIN_THREAD_DIFF_CHARS } = await import('./diffWorkerClient');

    await expect(createTextDiffsAsync(side('a'.repeat(MAX_MAIN_THREAD_DIFF_CHARS)), side('b'), 'char')).rejects.toThrow(
      'too large'
    );
    expect(mocks.createTextDiffs).not.toHaveBeenCalled();
  });

  it('runs small requests synchronously when workers are unavailable', async () => {
    vi.stubGlobal('Worker', undefined);
    const { createTextDiffsAsync } = await import('./diffWorkerClient');

    await expect(createTextDiffsAsync(side('a'), side('b'), 'char')).resolves.toEqual([[0, 'fallback']]);
    expect(mocks.createTextDiffs).toHaveBeenCalledWith(side('a'), side('b'), 'char');
  });

  it('returns an empty list when a worker omits diffs', async () => {
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');
    const pendingDiff = createTextDiffsAsync(side('a'), side('b'), 'char');
    const id = workers[0]!.postMessage.mock.calls[0]![0].id as number;

    workers[0]!.onmessage?.({ data: { id } } as MessageEvent);

    await expect(pendingDiff).resolves.toEqual([]);
  });

  it('ignores responses for requests that are no longer pending', async () => {
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');
    const pendingDiff = createTextDiffsAsync(side('a'), side('b'), 'char');
    const id = workers[0]!.postMessage.mock.calls[0]![0].id as number;
    workers[0]!.onmessage?.({ data: { id: id + 100, diffs: [[1, 'late']] } } as MessageEvent);
    workers[0]!.onmessage?.({ data: { id, diffs: [[1, 'b']] } } as MessageEvent);

    await expect(pendingDiff).resolves.toEqual([[1, 'b']]);
  });

  it('allows cancellation when no request or worker exists', async () => {
    const { cancelPendingTextDiffs } = await import('./diffWorkerClient');

    expect(() => cancelPendingTextDiffs()).not.toThrow();
  });
});
