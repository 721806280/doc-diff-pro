/**
 * Cooperative yielding for the long synchronous stretches of a comparison.
 *
 * Only the raw text diff runs in a worker; parsing, markup and structural
 * refinement need the DOM and so run here. Between those phases the main
 * thread is handed back, which is what keeps the progress indicator animating
 * and gives a superseded run a place to stop instead of finishing work nobody
 * will read.
 */

/** Raised when a comparison is stopped because a newer one replaced it. */
export class ComparisonAbortedError extends Error {
  constructor() {
    super('Comparison superseded');
    this.name = 'ComparisonAbortedError';
  }
}

type SchedulerWithYield = { yield?: () => Promise<void> };

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ComparisonAbortedError();
}

export async function yieldToBrowser(signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await ((globalThis as { scheduler?: SchedulerWithYield }).scheduler?.yield?.() ?? nextTask());
  throwIfAborted(signal);
}

/**
 * A task, not a microtask: awaiting a resolved promise returns before the
 * browser has had any chance to paint. MessageChannel rather than setTimeout
 * because timers are clamped to ~4ms, which across a handful of phases would
 * cost more than the pause buys on a small document.
 */
function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}
