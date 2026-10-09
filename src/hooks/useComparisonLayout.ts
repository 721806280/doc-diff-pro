import { useCallback, useEffect, useLayoutEffect, type RefObject } from 'react';
import { useTimeoutRef } from './useTimeoutRef';

type ComparisonLayoutOptions = {
  paneA: RefObject<HTMLDivElement | null>;
  paneB: RefObject<HTMLDivElement | null>;
  hasComparisonResult: boolean;
  originalHtml: string;
  revisedHtml: string;
  rebuildResultIndex: () => void;
  remeasureResultIndex: () => void;
  onLayoutChange: () => void;
};

export function useComparisonLayout({
  paneA,
  paneB,
  hasComparisonResult,
  originalHtml,
  revisedHtml,
  rebuildResultIndex,
  remeasureResultIndex,
  onLayoutChange
}: ComparisonLayoutOptions) {
  const layoutTimer = useTimeoutRef();

  const refresh = useCallback(() => {
    if (!hasComparisonResult) return;
    // A resize only shifts element geometry, so remeasure anchors and diff-map
    // positions without rebuilding the index or bumping the version — bumping it
    // would re-align the viewport onto the current diff and fight the user.
    remeasureResultIndex();
    onLayoutChange();
  }, [hasComparisonResult, onLayoutChange, remeasureResultIndex]);

  const scheduleRefresh = useCallback(() => {
    if (!hasComparisonResult) return;
    layoutTimer.set(refresh, 120);
  }, [hasComparisonResult, layoutTimer, refresh]);

  // Navigation is visible as soon as the result renders. Index and label the
  // differences before paint so input cannot arrive before they are focusable.
  useLayoutEffect(() => {
    if (hasComparisonResult) rebuildResultIndex();
  }, [hasComparisonResult, originalHtml, rebuildResultIndex, revisedHtml]);

  useEffect(() => {
    if (!hasComparisonResult) return;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleRefresh);
    [paneA.current, paneB.current].forEach((pane) => {
      if (!pane || !observer) return;
      observer.observe(pane);
      const content = pane.querySelector<HTMLElement>('.docx-render-content');
      if (content) observer.observe(content);
    });
    window.addEventListener('resize', scheduleRefresh);
    return () => {
      observer?.disconnect();
      layoutTimer.clear();
      window.removeEventListener('resize', scheduleRefresh);
    };
  }, [hasComparisonResult, layoutTimer, originalHtml, paneA, paneB, revisedHtml, scheduleRefresh]);
}
