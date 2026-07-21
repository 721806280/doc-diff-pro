import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { DiffActionPosition } from '@/types/diff';
import type { DiffElementIndex } from '@/utils/diffElementIndex';
import { diffReviewId, selectReviewElement } from '@/utils/diffReview';

const POPOVER_CLEARANCE = 48;

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

  const update = useCallback(() => {
    if (!enabled || settingsOpen || !hasComparisonResult || currentDiff <= 0) {
      setPosition(null);
      return;
    }
    const group = diffIndex.current.get(diffReviewId(currentDiff));
    const target = selectReviewElement(group, preferredElement.current, isVisibleTarget);
    if (!target) {
      setPosition(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    const edge = window.innerWidth <= 520 ? 96 : 132;
    const left = window.innerWidth <= edge * 2
      ? window.innerWidth / 2
      : Math.min(Math.max(rect.left + rect.width / 2, edge), window.innerWidth - edge);
    setPosition((current) => current?.top === rect.top && current.left === left ? current : { top: rect.top, left });
  }, [currentDiff, diffIndex, enabled, hasComparisonResult, preferredElement, settingsOpen]);

  const schedule = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      update();
    });
  }, [update]);

  const clear = useCallback(() => setPosition(null), []);

  useEffect(() => {
    schedule();
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [currentDiff, enabled, hasComparisonResult, indexVersion, mobilePane, schedule, settingsOpen]);

  return { position, schedule, clear };
}

function isVisibleTarget(element: HTMLElement, rect = element.getBoundingClientRect()): boolean {
  const viewport = element.closest<HTMLElement>('.render-viewport');
  if (!viewport) return false;
  const viewportRect = viewport.getBoundingClientRect();
  const visibleTop = Math.max(viewportRect.top, 0);
  const visibleBottom = Math.min(viewportRect.bottom, window.innerHeight);
  const visibleLeft = Math.max(viewportRect.left, 0);
  const visibleRight = Math.min(viewportRect.right, window.innerWidth);
  return rect.bottom > visibleTop
    && rect.top < visibleBottom
    && rect.right > visibleLeft
    && rect.left < visibleRight
    && rect.top >= visibleTop + POPOVER_CLEARANCE;
}
