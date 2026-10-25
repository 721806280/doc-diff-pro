import { useEffect, useState } from 'react';
import type { PaneSide } from '@/types/document';
import { FIT_IMAGE_VIEW, type ImageViews } from '@/utils/imageViewport';
import { useTimeoutRef } from './useTimeoutRef';

type ViewMode = 'comparison' | 'difference';
type ZoomFeedback = { side: PaneSide };
type ViewState = Record<ViewMode, ImageViews> & { feedback: ZoomFeedback | null };
type ViewUpdate = (previous: ImageViews) => ImageViews;

const initialViews = (): ImageViews => ({ A: FIT_IMAGE_VIEW, B: FIT_IMAGE_VIEW });

/** Keep viewport updates pure; schedule transient feedback only after a commit. */
export function useImagePreviewViews() {
  const [state, setState] = useState<ViewState>(() => ({
    comparison: initialViews(),
    difference: initialViews(),
    feedback: null
  }));
  const timer = useTimeoutRef();

  useEffect(() => {
    const feedback = state.feedback;
    if (!feedback) return;
    timer.set(() => {
      setState((previous) => (previous.feedback === feedback ? { ...previous, feedback: null } : previous));
    }, 700);
    return timer.clear;
  }, [state.feedback, timer]);

  function update(mode: ViewMode, transform: ViewUpdate, zoomSide?: PaneSide): void {
    setState((previous) => {
      const views = transform(previous[mode]);
      const feedback =
        zoomSide && views[zoomSide].scale !== previous[mode][zoomSide].scale ? { side: zoomSide } : previous.feedback;
      if (views === previous[mode] && feedback === previous.feedback) return previous;
      return { ...previous, [mode]: views, feedback };
    });
  }

  return {
    views: state.comparison,
    differenceViews: state.difference,
    zoomFeedback: state.feedback?.side ?? null,
    setViews: (transform: ViewUpdate, zoomSide?: PaneSide) => update('comparison', transform, zoomSide),
    setDifferenceViews: (transform: ViewUpdate, zoomSide?: PaneSide) => update('difference', transform, zoomSide),
    resetDifferenceViews: () => setState((previous) => ({ ...previous, difference: initialViews(), feedback: null })),
    clearZoomFeedback: () => setState((previous) => ({ ...previous, feedback: null }))
  };
}
