import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { DiffActionPosition } from '@/types/diff';
import type { DiffElementIndex } from '@/utils/diffElementIndex';
import { type PlacementSize, resolveDiffActionPlacement } from '@/utils/diffActionPlacement';
import { diffReviewId, selectReviewElement } from '@/utils/diffReview';
import { useLatestRef } from './useLatestRef';

/** Stand-in until the popover has rendered once and reported its real box. */
const DEFAULT_SIZE: PlacementSize = { width: 190, height: 34 };

/** Gap kept between the popover and the window's edges. */
const WINDOW_MARGIN = 12;
const NARROW_WINDOW_MARGIN = 8;

type DiffActionPositionOptions = {
  currentDiff: number;
  enabled: boolean;
  hasComparisonResult: boolean;
  indexVersion: number;
  mobilePane: 'A' | 'B';
  settingsOpen: boolean;
  diffIndex: RefObject<DiffElementIndex>;
  preferredElement: RefObject<HTMLElement | null>;
};

export function useDiffActionPosition({
  currentDiff,
  enabled,
  hasComparisonResult,
  indexVersion,
  mobilePane,
  settingsOpen,
  diffIndex,
  preferredElement
}: DiffActionPositionOptions) {
  const [position, setPosition] = useState<DiffActionPosition | null>(null);
  const frame = useRef<number | null>(null);
  const size = useRef<PlacementSize>(DEFAULT_SIZE);

  const update = useCallback(() => {
    if (!enabled || settingsOpen || !hasComparisonResult || currentDiff <= 0) {
      setPosition(null);
      return;
    }
    const group = diffIndex.current.get(diffReviewId(currentDiff));
    const target = selectReviewElement(group, preferredElement.current, isVisibleTarget);
    const viewport = target?.closest<HTMLElement>('.render-viewport');
    if (!target || !viewport) {
      setPosition(null);
      return;
    }
    const next = resolveDiffActionPlacement({
      target,
      bounds: visibleBounds(viewport),
      size: size.current,
      margin: window.innerWidth <= 520 ? NARROW_WINDOW_MARGIN : WINDOW_MARGIN,
      windowWidth: window.innerWidth
    });
    setPosition((current) => (samePosition(current, next) ? current : next));
  }, [currentDiff, diffIndex, enabled, hasComparisonResult, preferredElement, settingsOpen]);

  // Kept stable so the popover's measuring ref stays attached across
  // navigation and only real size changes trigger a new slot search.
  const latestUpdate = useLatestRef(update);
  const schedule = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      latestUpdate.current();
    });
  }, [latestUpdate]);

  const clear = useCallback(() => setPosition(null), []);

  /** The popover reports its rendered box so the next slot search uses real geometry. */
  const measure = useCallback(
    (measured: PlacementSize) => {
      const current = size.current;
      if (Math.abs(current.width - measured.width) < 1 && Math.abs(current.height - measured.height) < 1) return;
      size.current = measured;
      schedule();
    },
    [schedule]
  );

  useEffect(() => {
    schedule();
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [currentDiff, enabled, hasComparisonResult, indexVersion, mobilePane, schedule, settingsOpen]);

  return { position, schedule, measure, clear };
}

function samePosition(current: DiffActionPosition | null, next: DiffActionPosition | null): boolean {
  if (!current || !next) return current === next;
  return (
    current.top === next.top && current.left === next.left && current.side === next.side && current.arrow === next.arrow
  );
}

/** The pane's on-screen region: anything outside it is clipped or off-screen. */
function visibleBounds(viewport: HTMLElement) {
  const rect = viewport.getBoundingClientRect();
  return {
    top: Math.max(rect.top, 0),
    bottom: Math.min(rect.bottom, window.innerHeight),
    left: Math.max(rect.left, 0),
    right: Math.min(rect.right, window.innerWidth)
  };
}

function isVisibleTarget(element: HTMLElement): boolean {
  const viewport = element.closest<HTMLElement>('.render-viewport');
  if (!viewport) return false;
  const rect = element.getBoundingClientRect();
  const bounds = visibleBounds(viewport);
  return rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right;
}
