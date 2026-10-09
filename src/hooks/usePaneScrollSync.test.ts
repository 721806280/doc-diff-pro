import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePaneScrollSync } from './usePaneScrollSync';

function mountSync(enabled = true) {
  const syncPaneFrom = vi.fn();
  const view = renderHook((props) => usePaneScrollSync({ ...props, syncPaneFrom }), {
    initialProps: { enabled }
  });
  return { ...view, syncPaneFrom };
}

describe('usePaneScrollSync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const nextFrame = () => {
    act(() => {
      vi.advanceTimersToNextFrame();
    });
  };

  it('aligns the panes when synchronization becomes available', () => {
    const view = mountSync(false);
    nextFrame();
    expect(view.syncPaneFrom).not.toHaveBeenCalled();

    view.rerender({ enabled: true });
    nextFrame();
    expect(view.syncPaneFrom).toHaveBeenCalledExactlyOnceWith('A');
  });

  it.each(['A', 'B'] as const)('only follows the active %s pane and ignores follower feedback', (side) => {
    const view = mountSync();
    nextFrame();
    view.syncPaneFrom.mockClear();
    const follower = side === 'A' ? 'B' : 'A';

    act(() => view.result.current.onScroll(side));
    expect(view.syncPaneFrom).not.toHaveBeenCalled();

    act(() => {
      view.result.current.activate(side);
      view.result.current.onScroll(side);
      view.result.current.onScroll(follower);
      view.result.current.onScroll(side);
    });
    expect(view.syncPaneFrom).toHaveBeenCalledExactlyOnceWith(side);

    nextFrame();
    act(() => view.result.current.onScroll(follower));
    expect(view.syncPaneFrom).toHaveBeenCalledTimes(1);
    act(() => view.result.current.onScroll(side));
    expect(view.syncPaneFrom).toHaveBeenCalledTimes(2);
  });

  it('resynchronizes from the current driver after layout changes', () => {
    const view = mountSync();
    nextFrame();
    view.syncPaneFrom.mockClear();

    act(() => view.result.current.refresh());
    expect(view.syncPaneFrom).not.toHaveBeenCalled();
    act(() => {
      view.result.current.activate('B');
      view.result.current.refresh();
    });
    expect(view.syncPaneFrom).toHaveBeenCalledExactlyOnceWith('B');
  });

  it('resets the driver and pending frame guard before another interaction', () => {
    const view = mountSync();
    nextFrame();
    act(() => {
      view.result.current.activate('A');
      view.result.current.onScroll('A');
      view.result.current.reset();
    });
    view.syncPaneFrom.mockClear();

    act(() => view.result.current.refresh());
    expect(view.syncPaneFrom).not.toHaveBeenCalled();
    act(() => {
      view.result.current.activate('B');
      view.result.current.onScroll('B');
    });
    expect(view.syncPaneFrom).toHaveBeenCalledExactlyOnceWith('B');
  });

  it('cancels pending alignment and ignores input while disabled', () => {
    const view = mountSync();
    view.rerender({ enabled: false });
    nextFrame();
    act(() => {
      view.result.current.activate('A');
      view.result.current.onScroll('A');
      view.result.current.refresh();
    });
    expect(view.syncPaneFrom).not.toHaveBeenCalled();
  });

  it('cancels pending alignment when unmounted', () => {
    const view = mountSync();
    view.unmount();
    nextFrame();
    expect(view.syncPaneFrom).not.toHaveBeenCalled();
  });
});
