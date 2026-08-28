import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffTuple, DiffWorkerRequest } from '@/types/diff';

const mocks = vi.hoisted(() => ({
  createTextDiffs: vi.fn(() => [[0, 'diffed']] as DiffTuple[])
}));

vi.mock('@/utils/textDiffCompute', () => ({
  createTextDiffs: mocks.createTextDiffs
}));

type WorkerMessageHandler = (event: MessageEvent<DiffWorkerRequest>) => void;

function dispatch(data: DiffWorkerRequest): void {
  const handler = self.onmessage as WorkerMessageHandler | null;
  if (!handler) {
    throw new Error('worker did not register an onmessage handler');
  }
  handler({ data } as MessageEvent<DiffWorkerRequest>);
}

/** A document side with no block boundaries, which is all these tests need. */
function side(text: string) {
  return { text, boundaries: [] };
}

describe('diffWorker', () => {
  const postMessage = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    mocks.createTextDiffs.mockClear();
    mocks.createTextDiffs.mockReturnValue([[0, 'diffed']] as DiffTuple[]);
    postMessage.mockClear();
    self.onmessage = null;
    vi.stubGlobal('postMessage', postMessage);
    await import('./diffWorker');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    self.onmessage = null;
  });

  it('registers an onmessage handler on import', () => {
    expect(typeof self.onmessage).toBe('function');
  });

  it('computes diffs and posts them back with the request id', () => {
    mocks.createTextDiffs.mockReturnValue([[1, 'after']] as DiffTuple[]);

    dispatch({ id: 7, original: side('before'), revised: side('after'), granularity: 'word' });

    expect(mocks.createTextDiffs).toHaveBeenCalledWith(side('before'), side('after'), 'word');
    expect(postMessage).toHaveBeenCalledWith({ id: 7, diffs: [[1, 'after']] });
  });

  it('posts an error message when the diff computation throws an Error', () => {
    mocks.createTextDiffs.mockImplementation(() => {
      throw new Error('boom');
    });

    dispatch({ id: 3, original: side('a'), revised: side('b'), granularity: 'char' });

    expect(postMessage).toHaveBeenCalledWith({ id: 3, error: 'boom' });
  });

  it('stringifies non-Error throw values in the error response', () => {
    mocks.createTextDiffs.mockImplementation(() => {
      // Throwing a bare string is the point: it exercises the worker's
      // String(reason) fallback for non-Error values.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'plain failure';
    });

    dispatch({ id: 42, original: side('a'), revised: side('b'), granularity: 'semantic' });

    expect(postMessage).toHaveBeenCalledWith({ id: 42, error: 'plain failure' });
  });

  it('preserves distinct request ids across sequential messages', () => {
    mocks.createTextDiffs.mockReturnValueOnce([[-1, 'x']] as DiffTuple[]);
    mocks.createTextDiffs.mockReturnValueOnce([[1, 'y']] as DiffTuple[]);

    dispatch({ id: 1, original: side('x'), revised: side(''), granularity: 'char' });
    dispatch({ id: 2, original: side(''), revised: side('y'), granularity: 'char' });

    expect(postMessage).toHaveBeenNthCalledWith(1, { id: 1, diffs: [[-1, 'x']] });
    expect(postMessage).toHaveBeenNthCalledWith(2, { id: 2, diffs: [[1, 'y']] });
  });
});
