import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * A single `requestAnimationFrame` slot that cancels itself on unmount.
 *
 * Scheduling again supersedes the pending frame, so repeated calls within one
 * frame collapse into a single callback.
 */
export function useAnimationFrameRef() {
  const frame = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (frame.current === null) return;
    cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const schedule = useCallback(
    (callback: () => void) => {
      cancel();
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        callback();
      });
    },
    [cancel]
  );

  useEffect(() => cancel, [cancel]);

  // Memoised so callers can depend on the returned handle without their own
  // callbacks changing identity on every render.
  return useMemo(() => ({ schedule, cancel }), [cancel, schedule]);
}
