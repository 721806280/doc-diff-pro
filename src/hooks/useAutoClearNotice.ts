import { useEffect } from 'react';

export function useAutoClearNotice(notice: string, paused: boolean, clear: () => void, delayMs = 1400): void {
  useEffect(() => {
    if (!notice || paused) return;
    const timer = window.setTimeout(clear, delayMs);
    return () => window.clearTimeout(timer);
  }, [clear, delayMs, notice, paused]);
}
