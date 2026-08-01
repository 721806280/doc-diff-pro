import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * A single `setTimeout` slot that clears itself on unmount.
 *
 * Scheduling again replaces the pending callback rather than stacking a second
 * one, which matches how debounced UI timers are almost always meant to work.
 */
export function useTimeoutRef() {
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const set = useCallback(
    (callback: () => void, delayMs: number) => {
      clear();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        callback();
      }, delayMs);
    },
    [clear]
  );

  useEffect(() => clear, [clear]);

  // Memoised so callers can depend on the returned handle without their own
  // callbacks changing identity on every render.
  return useMemo(() => ({ set, clear }), [clear, set]);
}
