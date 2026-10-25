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

function installFakeWorker(send?: () => void): FakeWorkerInstance[] {
  const instances: FakeWorkerInstance[] = [];

  class FakeWorker implements FakeWorkerInstance {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    postMessage = vi.fn(send);
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
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

    const pending = createTextDiffsAsync(track, track, 'char');

    expect(workers[0]!.postMessage).toHaveBeenCalledWith({
      id: 1,
      original: side('before'),
      revised: side('before'),
      granularity: 'char'
    });
    workers[0]!.onmessage?.({ data: { id: 1, diffs: [[0, 'before']] } } as MessageEvent);
    await expect(pending).resolves.toEqual([[0, 'before']]);
  });

  it('does not let a failed send timeout terminate a later request', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let fail = true;
    const workers = installFakeWorker(() => {
      if (fail) throw new DOMException('Cannot clone request', 'DataCloneError');
    });
    const { createTextDiffsAsync, DIFF_WORKER_TIMEOUT_MS } = await import('./diffWorkerClient');

    await expect(createTextDiffsAsync(side('old'), side('failed'), 'char')).resolves.toEqual([[0, 'fallback']]);
    fail = false;
    await vi.advanceTimersByTimeAsync(5_000);
    const pending = createTextDiffsAsync(side('a'), side('b'), 'char');
    const outcome = pending.then(
      (diffs) => ({ diffs }),
      (error: unknown) => ({ error })
    );
    const id = workers[0]!.postMessage.mock.calls.at(-1)![0].id as number;
    await vi.advanceTimersByTimeAsync(DIFF_WORKER_TIMEOUT_MS - 5_000);
    workers[0]!.onmessage?.({
      data: {
        id,
        diffs: [
          [-1, 'a'],
          [1, 'b']
        ]
      }
    } as MessageEvent);

    expect(await outcome).toEqual({
      diffs: [
        [-1, 'a'],
        [1, 'b']
      ]
    });
    expect(workers[0]!.terminate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps an earlier request running when another request cannot be sent', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');

    const pending = createTextDiffsAsync(side('a'), side('b'), 'char');
    workers[0]!.postMessage.mockImplementationOnce(() => {
      throw new DOMException('Cannot clone request', 'DataCloneError');
    });
    await expect(createTextDiffsAsync(side('c'), side('d'), 'char')).resolves.toEqual([[0, 'fallback']]);

    expect(vi.getTimerCount()).toBe(1);
    workers[0]!.onmessage?.({
      data: {
        id: 1,
        diffs: [
          [-1, 'a'],
          [1, 'b']
        ]
      }
    } as MessageEvent);
    await expect(pending).resolves.toEqual([
      [-1, 'a'],
      [1, 'b']
    ]);
    expect(workers[0]!.terminate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
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
    workers[0]!.onmessage?.({
      data: {
        id: 1,
        diffs: [
          [-1, 'before'],
          [1, 'after']
        ]
      }
    } as MessageEvent);

    await expect(pendingDiff).resolves.toEqual([
      [-1, 'before'],
      [1, 'after']
    ]);
    expect(mocks.createTextDiffs).not.toHaveBeenCalled();
  });

  it('preserves valid equalities and change groups in worker responses', async () => {
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');
    const diffs: DiffTuple[] = [
      [0, 'same '],
      Object.assign([-1, 'before'] as DiffTuple, { groupId: 'diff-1' }),
      Object.assign([1, 'after'] as DiffTuple, { groupId: 'diff-1' }),
      [0, ' end']
    ];
    const pending = createTextDiffsAsync(side('same before end'), side('same after end'), 'word');

    workers[0]!.onmessage?.({ data: { id: 1, diffs } } as MessageEvent);

    await expect(pending).resolves.toEqual(diffs);
    expect(mocks.createTextDiffs).not.toHaveBeenCalled();
  });

  it('accepts an empty worker result for two empty documents', async () => {
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');
    const pending = createTextDiffsAsync(side(''), side(''), 'char');

    workers[0]!.onmessage?.({ data: { id: 1, diffs: [] } } as MessageEvent);

    await expect(pending).resolves.toEqual([]);
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
    workers[0]!.onmessage?.({
      data: {
        id: secondId,
        diffs: [
          [-1, 'c'],
          [1, 'd']
        ]
      }
    } as MessageEvent);
    workers[0]!.onmessage?.({
      data: {
        id: firstId,
        diffs: [
          [-1, 'a'],
          [1, 'b']
        ]
      }
    } as MessageEvent);

    await expect(first).resolves.toEqual([
      [-1, 'a'],
      [1, 'b']
    ]);
    await expect(second).resolves.toEqual([
      [-1, 'c'],
      [1, 'd']
    ]);
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

  it('ignores late replies and errors from a canceled worker after its replacement starts', async () => {
    const workers = installFakeWorker();
    const { cancelPendingTextDiffs, createTextDiffsAsync } = await import('./diffWorkerClient');

    const canceledDiff = createTextDiffsAsync(side('old'), side('request'), 'word');
    cancelPendingTextDiffs();
    await expect(canceledDiff).rejects.toThrow('Diff request canceled');

    const currentDiff = createTextDiffsAsync(side('new'), side('request'), 'word');
    const currentId = workers[1]!.postMessage.mock.calls[0]![0].id as number;
    workers[0]!.onerror?.({ message: 'late worker error' } as ErrorEvent);
    workers[0]!.onmessage?.({ data: null } as MessageEvent);
    workers[0]!.onmessage?.({ data: { id: currentId, diffs: [[0, 'corrupt']] } } as MessageEvent);
    workers[1]!.onmessage?.({
      data: {
        id: currentId,
        diffs: [
          [-1, 'new'],
          [1, 'request']
        ]
      }
    } as MessageEvent);

    await expect(currentDiff).resolves.toEqual([
      [-1, 'new'],
      [1, 'request']
    ]);
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
    workers[1]!.onmessage?.({
      data: {
        id: currentId,
        diffs: [
          [-1, 'new'],
          [1, 'request']
        ]
      }
    } as MessageEvent);

    await expect(currentDiff).resolves.toEqual([
      [-1, 'new'],
      [1, 'request']
    ]);
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

  it('falls back when a worker omits diffs instead of reporting no changes', async () => {
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');
    const pendingDiff = createTextDiffsAsync(side('a'), side('b'), 'char');
    const id = workers[0]!.postMessage.mock.calls[0]![0].id as number;

    workers[0]!.onmessage?.({ data: { id } } as MessageEvent);

    await expect(pendingDiff).resolves.toEqual([[0, 'fallback']]);
    expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['non-object response', null],
    ['missing request id', { diffs: [] }],
    ['string request id', { id: '1', diffs: [] }],
    ['invalid request id', { id: 0, diffs: [] }],
    ['fractional request id', { id: 1.5, diffs: [] }],
    ['both success and error', { id: 1, diffs: [], error: 'failed' }],
    ['non-string error', { id: 1, error: null }],
    ['non-array differences', { id: 1, diffs: {} }],
    ['sparse differences', { id: 1, diffs: new Array<unknown>(1) }],
    ['unknown operation', { id: 1, diffs: [[2, 'a']] }],
    ['non-string text', { id: 1, diffs: [[0, 1]] }],
    ['incomplete tuple', { id: 1, diffs: [[0]] }],
    ['invalid change group', { id: 1, diffs: [Object.assign([0, 'a'], { groupId: 1 })] }]
  ])('falls back and cleans up after a malformed %s', async (_label, response) => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');
    const pending = createTextDiffsAsync(side('a'), side('b'), 'char');

    workers[0]!.onmessage?.({ data: response } as MessageEvent);

    await expect(pending).resolves.toEqual([[0, 'fallback']]);
    expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
    expect(mocks.createTextDiffs).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up every affected request without allowing oversized fallbacks', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const workers = installFakeWorker();
    const { createTextDiffsAsync, MAX_MAIN_THREAD_DIFF_CHARS } = await import('./diffWorkerClient');
    const original = side('a'.repeat(MAX_MAIN_THREAD_DIFF_CHARS));
    const first = createTextDiffsAsync(original, side('b'), 'char');
    const second = createTextDiffsAsync(original, side('c'), 'word');

    workers[0]!.onmessage?.({ data: { id: 1 } } as MessageEvent);

    await expect(first).rejects.toThrow('too large');
    await expect(second).rejects.toThrow('too large');
    expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
    expect(mocks.createTextDiffs).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each<{ label: string; diffs: DiffTuple[] }>([
    { label: 'empty changes for non-empty documents', diffs: [] },
    { label: 'incorrect equality', diffs: [[0, 'a']] },
    {
      label: 'wrong original text',
      diffs: [
        [-1, 'wrong'],
        [1, 'b']
      ]
    },
    { label: 'missing revised text', diffs: [[-1, 'a']] }
  ])('falls back when worker differences contain $label', async ({ diffs }) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');
    const pending = createTextDiffsAsync(side('a'), side('b'), 'char');

    workers[0]!.onmessage?.({ data: { id: 1, diffs } } as MessageEvent);

    await expect(pending).resolves.toEqual([[0, 'fallback']]);
    expect(mocks.createTextDiffs).toHaveBeenCalledWith(side('a'), side('b'), 'char');
    expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
  });

  it('falls back when the worker returns an empty error message', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');
    const pending = createTextDiffsAsync(side('a'), side('b'), 'char');

    workers[0]!.onmessage?.({ data: { id: 1, error: '' } } as MessageEvent);

    await expect(pending).resolves.toEqual([[0, 'fallback']]);
    expect(warning).toHaveBeenCalledWith('[Document diff worker fallback]', new Error('Diff worker failed'));
    expect(workers[0]!.terminate).not.toHaveBeenCalled();
  });

  it.each(['success', 'error'] as const)('cancels after a worker %s before the caller resumes', async (outcome) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const workers = installFakeWorker();
    const { cancelPendingTextDiffs, createTextDiffsAsync } = await import('./diffWorkerClient');
    const pending = createTextDiffsAsync(side('a'), side('b'), 'char');

    const response =
      outcome === 'success'
        ? {
            id: 1,
            diffs: [
              [-1, 'a'],
              [1, 'b']
            ]
          }
        : { id: 1, error: 'failed' };
    workers[0]!.onmessage?.({ data: response } as MessageEvent);
    cancelPendingTextDiffs();

    await expect(pending).rejects.toThrow('Diff request canceled');
    expect(mocks.createTextDiffs).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it('cancels a fallback while its comparison module is loading', async () => {
    vi.stubGlobal('Worker', undefined);
    const { cancelPendingTextDiffs, createTextDiffsAsync } = await import('./diffWorkerClient');

    const pending = createTextDiffsAsync(side('a'), side('b'), 'char');
    cancelPendingTextDiffs();

    await expect(pending).rejects.toThrow('Diff request canceled');
    expect(mocks.createTextDiffs).not.toHaveBeenCalled();
  });

  it('ignores responses for requests that are no longer pending', async () => {
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');
    const pendingDiff = createTextDiffsAsync(side('a'), side('b'), 'char');
    const id = workers[0]!.postMessage.mock.calls[0]![0].id as number;
    workers[0]!.onmessage?.({ data: { id: id + 100, diffs: [[1, 'late']] } } as MessageEvent);
    workers[0]!.onmessage?.({
      data: {
        id,
        diffs: [
          [-1, 'a'],
          [1, 'b']
        ]
      }
    } as MessageEvent);

    await expect(pendingDiff).resolves.toEqual([
      [-1, 'a'],
      [1, 'b']
    ]);
  });

  it('allows cancellation when no request or worker exists', async () => {
    const { cancelPendingTextDiffs } = await import('./diffWorkerClient');

    expect(() => cancelPendingTextDiffs()).not.toThrow();
  });
});
