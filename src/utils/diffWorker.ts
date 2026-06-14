import { createTextDiffs } from './textDiffCore';
import type { DiffWorkerRequest, DiffWorkerResponse } from '@/types/diff';

self.onmessage = (event: MessageEvent<DiffWorkerRequest>) => {
  const { id, originalText, revisedText, granularity } = event.data;

  try {
    const diffs = createTextDiffs(originalText, revisedText, granularity);
    postMessage({ id, diffs } satisfies DiffWorkerResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postMessage({ id, error: message } satisfies DiffWorkerResponse);
  }
};
