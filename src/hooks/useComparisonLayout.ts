import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { PaneSide } from '@/types/document';

type ComparisonLayoutOptions = {
  paneA: RefObject<HTMLDivElement | null>;
  paneB: RefObject<HTMLDivElement | null>;
  hasComparisonResult: boolean;
  originalHtml: string;
  revisedHtml: string;
  rebuildResultIndex: () => void;
  remeasureResultIndex: () => void;
  scheduleDiffActionUpdate: () => void;
  syncPaneFrom: (side: PaneSide) => void;
  syncScroll: boolean;
  activeDriver: RefObject<PaneSide | null>;
  syncInProgress: RefObject<boolean>;
  scheduleSyncRelease: () => void;
};

export function useComparisonLayout({
  paneA,
  paneB,
  hasComparisonResult,
  originalHtml,
  revisedHtml,
  rebuildResultIndex,
  remeasureResultIndex,
  scheduleDiffActionUpdate,
  syncPaneFrom,
  syncScroll,
  activeDriver,
  syncInProgress,
  scheduleSyncRelease
}: ComparisonLayoutOptions) {
  const layoutTimer = useRef<number | null>(null);

  const refresh = useCallback(() => {
    if (!hasComparisonResult) return;
    // A resize only shifts element geometry, so remeasure anchors and diff-map
    // positions without rebuilding the index or bumping the version — bumping it
    // would re-align the viewport onto the current diff and fight the user.
    remeasureResultIndex();
    scheduleDiffActionUpdate();
    if (syncScroll && activeDriver.current) {
      syncInProgress.current = true;
      syncPaneFrom(activeDriver.current);
      scheduleSyncRelease();
    }
  }, [
    activeDriver,
    hasComparisonResult,
    remeasureResultIndex,
    scheduleDiffActionUpdate,
    scheduleSyncRelease,
    syncInProgress,
    syncPaneFrom,
    syncScroll
  ]);

  const scheduleRefresh = useCallback(() => {
    if (!hasComparisonResult) return;
    if (layoutTimer.current !== null) window.clearTimeout(layoutTimer.current);
    layoutTimer.current = window.setTimeout(() => {
      layoutTimer.current = null;
      refresh();
    }, 120);
  }, [hasComparisonResult, refresh]);

  useEffect(() => {
    if (!hasComparisonResult) return;
    const frame = requestAnimationFrame(rebuildResultIndex);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleRefresh);
    [paneA.current, paneB.current].forEach((pane) => {
      if (!pane || !observer) return;
      observer.observe(pane);
      const content = pane.querySelector<HTMLElement>('.docx-render-content');
      if (content) observer.observe(content);
    });
    const handleResize = () => scheduleRefresh();
    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (layoutTimer.current !== null) {
        window.clearTimeout(layoutTimer.current);
        layoutTimer.current = null;
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [hasComparisonResult, originalHtml, paneA, paneB, rebuildResultIndex, revisedHtml, scheduleRefresh]);

  useEffect(() => {
    if (!syncScroll || !hasComparisonResult) return;
    const frame = requestAnimationFrame(() => syncPaneFrom('A'));
    return () => cancelAnimationFrame(frame);
  }, [hasComparisonResult, syncPaneFrom, syncScroll]);
}
