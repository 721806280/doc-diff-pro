import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffTuple } from '@/types/diff';

const mocks = vi.hoisted(() => ({
  createTextDiffs: vi.fn(() => [[0, 'fallback']] as DiffTuple[])
}));

vi.mock('@/utils/textDiffCore', () => ({
  createTextDiffs: mocks.createTextDiffs
}));

type FakeWorkerInstance = {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
};

function installFakeWorker(): FakeWorkerInstance[] {
  const instances: FakeWorkerInstance[] = [];

  class FakeWorker implements FakeWorkerInstance {
    onmessage: ((event: MessageEvent) => void) | null = null;
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

  it('does not run the synchronous fallback for canceled worker requests', async () => {
    const workers = installFakeWorker();
    const { cancelPendingTextDiffs, createTextDiffsAsync } = await import('./diffWorkerClient');

    const pendingDiff = createTextDiffsAsync('a', 'b', 'char');

    expect(workers).toHaveLength(1);
    cancelPendingTextDiffs();

    await expect(pendingDiff).rejects.toThrow('Diff request canceled');
    expect(mocks.createTextDiffs).not.toHaveBeenCalled();
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it('uses the synchronous fallback when the worker fails', async () => {
    const workers = installFakeWorker();
    const { createTextDiffsAsync } = await import('./diffWorkerClient');

    const pendingDiff = createTextDiffsAsync('a', 'b', 'char');
    workers[0].onerror?.({ message: 'boom' } as ErrorEvent);

    await expect(pendingDiff).resolves.toEqual([[0, 'fallback']]);
    expect(mocks.createTextDiffs).toHaveBeenCalledWith('a', 'b', 'char');
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it('does not run the synchronous fallback for timed out worker requests', async () => {
    vi.useFakeTimers();
    const workers = installFakeWorker();
    const { createTextDiffsAsync, DIFF_WORKER_TIMEOUT_MS } = await import('./diffWorkerClient');

    const pendingDiff = createTextDiffsAsync('a', 'b', 'char');
    const expectation = expect(pendingDiff).rejects.toThrow('Diff request timed out');
    await vi.advanceTimersByTimeAsync(DIFF_WORKER_TIMEOUT_MS);

    await expectation;
    expect(mocks.createTextDiffs).not.toHaveBeenCalled();
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects large synchronous fallback requests when workers are unavailable', async () => {
    vi.stubGlobal('Worker', undefined);
    const { createTextDiffsAsync, MAX_MAIN_THREAD_DIFF_CHARS } = await import('./diffWorkerClient');

    await expect(
      createTextDiffsAsync('a'.repeat(MAX_MAIN_THREAD_DIFF_CHARS), 'b', 'char')
    ).rejects.toThrow('too large');
    expect(mocks.createTextDiffs).not.toHaveBeenCalled();
  });
});
