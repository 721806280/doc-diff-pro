import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaneSide } from '@/types/document';
import { useComparisonLayout } from './useComparisonLayout';

type ObserverRecord = { targets: Element[]; disconnected: boolean; trigger: () => void };

let observers: ObserverRecord[];

/** Minimal ResizeObserver double that lets a test fire the callback on demand. */
class FakeResizeObserver {
  private record: ObserverRecord;

  constructor(callback: () => void) {
    this.record = { targets: [], disconnected: false, trigger: callback };
    observers.push(this.record);
  }

  observe(target: Element): void {
    this.record.targets.push(target);
  }

  disconnect(): void {
    this.record.disconnected = true;
  }

  unobserve(): void {
    // Not used by the hook.
  }
}

function buildPane(): HTMLDivElement {
  const pane = document.createElement('div');
  const content = document.createElement('div');
  content.className = 'docx-render-content';
  pane.append(content);
  document.body.append(pane);
  return pane;
}

function mountLayout(
  overrides: Partial<{ hasComparisonResult: boolean; syncScroll: boolean; driver: PaneSide | null }> = {}
) {
  const paneA = createRef<HTMLDivElement>() as { current: HTMLDivElement | null };
  const paneB = createRef<HTMLDivElement>() as { current: HTMLDivElement | null };
  paneA.current = buildPane();
  paneB.current = buildPane();

  const activeDriver = { current: overrides.driver ?? null };
  const syncInProgress = { current: false };
  const rebuildResultIndex = vi.fn();
  const scheduleDiffActionUpdate = vi.fn();
  const syncPaneFrom = vi.fn();
  const scheduleSyncRelease = vi.fn();

  const view = renderHook(
    (props: { hasComparisonResult: boolean; syncScroll: boolean; originalHtml: string; revisedHtml: string }) =>
      useComparisonLayout({
        paneA,
        paneB,
        hasComparisonResult: props.hasComparisonResult,
        originalHtml: props.originalHtml,
        revisedHtml: props.revisedHtml,
        rebuildResultIndex,
        scheduleDiffActionUpdate,
        syncPaneFrom,
        syncScroll: props.syncScroll,
        activeDriver,
        syncInProgress,
        scheduleSyncRelease
      }),
    {
      initialProps: {
        hasComparisonResult: overrides.hasComparisonResult ?? true,
        syncScroll: overrides.syncScroll ?? true,
        originalHtml: '<p>a</p>',
        revisedHtml: '<p>b</p>'
      }
    }
  );

  return {
    ...view,
    paneA,
    paneB,
    activeDriver,
    syncInProgress,
    rebuildResultIndex,
    scheduleDiffActionUpdate,
    syncPaneFrom,
    scheduleSyncRelease
  };
}

describe('useComparisonLayout', () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    vi.useFakeTimers();
    observers = [];
    frames = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      frames[handle - 1] = () => undefined;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const flushFrames = () => {
    act(() => {
      frames.splice(0).forEach((frame) => frame(0));
    });
  };

  it('rebuilds the index on the first animation frame', () => {
    const view = mountLayout();

    expect(view.rebuildResultIndex).not.toHaveBeenCalled();
    flushFrames();

    expect(view.rebuildResultIndex).toHaveBeenCalled();
  });

  it('observes both panes and their rendered content', () => {
    mountLayout();

    expect(observers).toHaveLength(1);
    expect(observers[0]?.targets).toHaveLength(4);
  });

  it('does nothing while there is no comparison result', () => {
    const view = mountLayout({ hasComparisonResult: false });

    flushFrames();

    expect(observers).toHaveLength(0);
    expect(view.rebuildResultIndex).not.toHaveBeenCalled();
  });

  it('aligns pane B to pane A once a result is available', () => {
    const view = mountLayout();

    flushFrames();

    expect(view.syncPaneFrom).toHaveBeenCalledWith('A');
  });

  it('skips the initial alignment when sync scrolling is off', () => {
    const view = mountLayout({ syncScroll: false });

    flushFrames();

    expect(view.syncPaneFrom).not.toHaveBeenCalled();
  });

  it('debounces a resize into a single refresh', () => {
    const view = mountLayout();
    flushFrames();
    view.rebuildResultIndex.mockClear();

    act(() => {
      observers[0]?.trigger();
      observers[0]?.trigger();
      observers[0]?.trigger();
    });
    expect(view.rebuildResultIndex).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(120); });

    expect(view.rebuildResultIndex).toHaveBeenCalledTimes(1);
    expect(view.scheduleDiffActionUpdate).toHaveBeenCalled();
  });

  it('refreshes on a window resize', () => {
    const view = mountLayout();
    flushFrames();
    view.rebuildResultIndex.mockClear();

    act(() => { window.dispatchEvent(new Event('resize')); });
    act(() => { vi.advanceTimersByTime(120); });

    expect(view.rebuildResultIndex).toHaveBeenCalledTimes(1);
  });

  it('re-aligns from the driving pane after a resize', () => {
    const view = mountLayout({ driver: 'B' });
    flushFrames();
    view.syncPaneFrom.mockClear();

    act(() => { observers[0]?.trigger(); });
    act(() => { vi.advanceTimersByTime(120); });

    expect(view.syncPaneFrom).toHaveBeenCalledWith('B');
    expect(view.syncInProgress.current).toBe(true);
    expect(view.scheduleSyncRelease).toHaveBeenCalled();
  });

  it('does not re-align after a resize when no pane is driving', () => {
    const view = mountLayout({ driver: null });
    flushFrames();
    view.syncPaneFrom.mockClear();

    act(() => { observers[0]?.trigger(); });
    act(() => { vi.advanceTimersByTime(120); });

    expect(view.syncPaneFrom).not.toHaveBeenCalled();
    expect(view.syncInProgress.current).toBe(false);
  });

  it('re-observes when the rendered markup changes', () => {
    const view = mountLayout();

    view.rerender({ hasComparisonResult: true, syncScroll: true, originalHtml: '<p>changed</p>', revisedHtml: '<p>b</p>' });

    expect(observers).toHaveLength(2);
    expect(observers[0]?.disconnected).toBe(true);
  });

  it('disconnects observers and drops pending work on unmount', () => {
    const view = mountLayout();
    flushFrames();
    view.rebuildResultIndex.mockClear();

    act(() => { observers[0]?.trigger(); });
    view.unmount();
    act(() => { vi.advanceTimersByTime(500); });

    expect(observers[0]?.disconnected).toBe(true);
    expect(view.rebuildResultIndex).not.toHaveBeenCalled();
  });

  it('stops refreshing on window resize after unmount', () => {
    const view = mountLayout();
    flushFrames();
    view.rebuildResultIndex.mockClear();
    view.unmount();

    act(() => { window.dispatchEvent(new Event('resize')); });
    act(() => { vi.advanceTimersByTime(500); });

    expect(view.rebuildResultIndex).not.toHaveBeenCalled();
  });
});
