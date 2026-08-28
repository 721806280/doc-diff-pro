import { createTextDiffs } from '@/utils/textDiffCompute';
import type { DiffWorkerRequest, DiffWorkerResponse } from '@/types/diff';

self.onmessage = (event: MessageEvent<DiffWorkerRequest>) => {
  const { id, original, revised, granularity } = event.data;

  try {
    const diffs = createTextDiffs(original, revised, granularity);
    postMessage({ id, diffs } satisfies DiffWorkerResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postMessage({ id, error: message } satisfies DiffWorkerResponse);
  }
};
