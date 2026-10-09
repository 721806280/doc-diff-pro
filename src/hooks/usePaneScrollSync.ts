import { useCallback, useEffect, useRef } from 'react';
import type { PaneSide } from '@/types/document';
import { useAnimationFrameRef } from './useAnimationFrameRef';

type PaneScrollSyncOptions = {
  enabled: boolean;
  syncPaneFrom: (side: PaneSide) => void;
};

/** Owns the driving pane and the frame guard shared by scrolling and reflow. */
export function usePaneScrollSync({ enabled, syncPaneFrom }: PaneScrollSyncOptions) {
  const activeDriver = useRef<PaneSide | null>(null);
  const syncInProgress = useRef(false);
  const releaseFrame = useAnimationFrameRef();

  const reset = useCallback(() => {
    activeDriver.current = null;
    syncInProgress.current = false;
    releaseFrame.cancel();
  }, [releaseFrame]);

  const activate = useCallback((side: PaneSide) => {
    activeDriver.current = side;
  }, []);

  const syncDriver = useCallback(() => {
    if (!enabled || !activeDriver.current) return;
    syncInProgress.current = true;
    syncPaneFrom(activeDriver.current);
    releaseFrame.schedule(() => {
      syncInProgress.current = false;
    });
  }, [enabled, releaseFrame, syncPaneFrom]);

  const onScroll = useCallback(
    (side: PaneSide) => {
      if (syncInProgress.current || activeDriver.current !== side) return;
      syncDriver();
    },
    [syncDriver]
  );

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }
    const frame = requestAnimationFrame(() => syncPaneFrom('A'));
    return () => cancelAnimationFrame(frame);
  }, [enabled, reset, syncPaneFrom]);

  return { activate, onScroll, refresh: syncDriver, reset };
}
