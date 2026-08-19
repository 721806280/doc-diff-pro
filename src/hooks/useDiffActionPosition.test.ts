import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffElementIndex } from '@/utils/diffElementIndex';
import { diffReviewId } from '@/utils/diffReview';
import { useDiffActionPosition } from './useDiffActionPosition';

type Rect = { top: number; left: number; width: number; height: number };

/** jsdom reports zeroed rects, so every element under test declares its own. */
function stubRect(element: HTMLElement, { top, left, width, height }: Rect): void {
  element.getBoundingClientRect = () => ({
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({})
  });
}

const VIEWPORT: Rect = { top: 0, left: 0, width: 1024, height: 768 };

function buildScene(targetRect: Rect, options: { insideViewport?: boolean } = {}) {
  const viewport = document.createElement('div');
  viewport.className = 'render-viewport';
  stubRect(viewport, VIEWPORT);
  document.body.append(viewport);

  const target = document.createElement('ins');
  target.dataset.diffId = diffReviewId(1);
  stubRect(target, targetRect);
  if (options.insideViewport === false) document.body.append(target);
  else viewport.append(target);

  const index: DiffElementIndex = new Map([[diffReviewId(1), { A: [target], B: [] }]]);
  return { viewport, target, index };
}

function mountPosition(
  index: DiffElementIndex,
  overrides: Partial<{
    currentDiff: number;
    enabled: boolean;
    hasComparisonResult: boolean;
    settingsOpen: boolean;
    indexVersion: number;
  }> = {}
) {
  const diffIndex = { current: index };
  const preferredElement = { current: null as HTMLElement | null };
  const view = renderHook(
    (props: {
      currentDiff: number;
      enabled: boolean;
      hasComparisonResult: boolean;
      settingsOpen: boolean;
      indexVersion: number;
    }) =>
      useDiffActionPosition({
        currentDiff: props.currentDiff,
        enabled: props.enabled,
        hasComparisonResult: props.hasComparisonResult,
        indexVersion: props.indexVersion,
        mobilePane: 'A',
        settingsOpen: props.settingsOpen,
        diffIndex,
        preferredElement
      }),
    {
      initialProps: {
        currentDiff: overrides.currentDiff ?? 1,
        enabled: overrides.enabled ?? true,
        hasComparisonResult: overrides.hasComparisonResult ?? true,
        settingsOpen: overrides.settingsOpen ?? false,
        indexVersion: overrides.indexVersion ?? 1
      }
    }
  );
  return { ...view, preferredElement };
}

describe('useDiffActionPosition', () => {
  let frames: FrameRequestCallback[];
  let cancelled: number[];

  beforeEach(() => {
    frames = [];
    cancelled = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      cancelled.push(handle);
      frames[handle - 1] = () => undefined;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const flushFrames = () => {
    act(() => {
      const pending = frames.splice(0);
      pending.forEach((frame) => frame(0));
    });
  };

  it('positions the popover above the active difference', () => {
    const { index } = buildScene({ top: 300, left: 200, width: 100, height: 20 });
    const { result } = mountPosition(index);

    flushFrames();

    // 300 - 9px gap - 34px popover height, centred on the difference.
    expect(result.current.position).toEqual({ top: 257, left: 250, side: 'above', arrow: 95 });
  });

  it('clamps the popover away from the viewport edges', () => {
    const { index } = buildScene({ top: 300, left: 0, width: 20, height: 20 });
    const { result } = mountPosition(index);

    flushFrames();

    // 12px window margin plus half of the popover's 190px default width.
    expect(result.current.position?.left).toBe(107);
  });

  it('stays unset while the settings panel is open', () => {
    const { index } = buildScene({ top: 300, left: 200, width: 100, height: 20 });
    const { result } = mountPosition(index, { settingsOpen: true });

    flushFrames();

    expect(result.current.position).toBeNull();
  });

  it('stays unset when the ignore feature is disabled', () => {
    const { index } = buildScene({ top: 300, left: 200, width: 100, height: 20 });
    const { result } = mountPosition(index, { enabled: false });

    flushFrames();

    expect(result.current.position).toBeNull();
  });

  it('stays unset when no difference is active', () => {
    const { index } = buildScene({ top: 300, left: 200, width: 100, height: 20 });
    const { result } = mountPosition(index, { currentDiff: 0 });

    flushFrames();

    expect(result.current.position).toBeNull();
  });

  it('stays unset for an element outside any render viewport', () => {
    const { index } = buildScene({ top: 300, left: 200, width: 100, height: 20 }, { insideViewport: false });
    const { result } = mountPosition(index);

    flushFrames();

    expect(result.current.position).toBeNull();
  });

  // A difference near the pane's top edge leaves no room above, so the popover
  // flips below it instead of disappearing.
  it('flips below a difference that sits under the pane top', () => {
    const { index } = buildScene({ top: 10, left: 200, width: 100, height: 20 });
    const { result } = mountPosition(index);

    flushFrames();

    expect(result.current.position).toMatchObject({ top: 39, side: 'below' });
  });

  it('keeps the same position object when the geometry is unchanged', () => {
    const { index } = buildScene({ top: 300, left: 200, width: 100, height: 20 });
    const view = mountPosition(index);

    flushFrames();
    const first = view.result.current.position;

    act(() => view.result.current.schedule());
    flushFrames();

    expect(view.result.current.position).toBe(first);
  });

  it('recomputes after the element moves', () => {
    const { index, target } = buildScene({ top: 300, left: 200, width: 100, height: 20 });
    const view = mountPosition(index);

    flushFrames();
    stubRect(target, { top: 420, left: 200, width: 100, height: 20 });

    act(() => view.result.current.schedule());
    flushFrames();

    expect(view.result.current.position).toEqual({ top: 377, left: 250, side: 'above', arrow: 95 });
  });

  it('drops the position when cleared', () => {
    const { index } = buildScene({ top: 300, left: 200, width: 100, height: 20 });
    const view = mountPosition(index);

    flushFrames();
    expect(view.result.current.position).not.toBeNull();

    act(() => view.result.current.clear());

    expect(view.result.current.position).toBeNull();
  });

  it('cancels the previous frame when scheduled repeatedly', () => {
    const { index } = buildScene({ top: 300, left: 200, width: 100, height: 20 });
    const view = mountPosition(index);
    flushFrames();

    const cancelsBefore = cancelled.length;
    act(() => {
      view.result.current.schedule();
      view.result.current.schedule();
      view.result.current.schedule();
    });

    // Each extra schedule supersedes the pending frame rather than stacking.
    expect(cancelled.length - cancelsBefore).toBe(2);
  });
});
