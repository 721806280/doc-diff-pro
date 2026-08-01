import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoClearNotice } from './useAutoClearNotice';

describe('useAutoClearNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the notice after the delay elapses', () => {
    const clear = vi.fn();
    renderHook(() => useAutoClearNotice('saved', false, clear, 1400));

    act(() => { vi.advanceTimersByTime(1399); });
    expect(clear).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('does not schedule a clear for an empty notice', () => {
    const clear = vi.fn();
    renderHook(() => useAutoClearNotice('', false, clear, 1400));

    act(() => { vi.advanceTimersByTime(5000); });

    expect(clear).not.toHaveBeenCalled();
  });

  it('holds the notice while paused', () => {
    const clear = vi.fn();
    const view = renderHook(
      (props: { paused: boolean }) => useAutoClearNotice('comparing', props.paused, clear, 1400),
      { initialProps: { paused: true } }
    );

    act(() => { vi.advanceTimersByTime(5000); });
    expect(clear).not.toHaveBeenCalled();

    view.rerender({ paused: false });
    act(() => { vi.advanceTimersByTime(1400); });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('restarts the timer when the notice changes', () => {
    const clear = vi.fn();
    const view = renderHook(
      (props: { notice: string }) => useAutoClearNotice(props.notice, false, clear, 1400),
      { initialProps: { notice: 'first' } }
    );

    act(() => { vi.advanceTimersByTime(1000); });
    view.rerender({ notice: 'second' });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(clear).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(400); });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending clear on unmount', () => {
    const clear = vi.fn();
    const view = renderHook(() => useAutoClearNotice('saved', false, clear, 1400));

    view.unmount();
    act(() => { vi.advanceTimersByTime(5000); });

    expect(clear).not.toHaveBeenCalled();
  });
});
