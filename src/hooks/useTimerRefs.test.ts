import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnimationFrameRef } from './useAnimationFrameRef';
import { useTimeoutRef } from './useTimeoutRef';

describe('useAnimationFrameRef', () => {
  let frames: Array<() => void>;

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      frames[handle - 1] = () => undefined;
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const runFrames = () => act(() => frames.splice(0).forEach((frame) => frame()));

  it('keeps a stable handle across renders', () => {
    const { result, rerender } = renderHook(() => useAnimationFrameRef());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it('collapses repeated scheduling within one frame into the last callback', () => {
    const ran: string[] = [];
    const { result } = renderHook(() => useAnimationFrameRef());

    act(() => {
      result.current.schedule(() => ran.push('stale'));
      result.current.schedule(() => ran.push('current'));
    });
    runFrames();

    expect(ran).toEqual(['current']);
  });

  it('drops a scheduled callback when cancelled explicitly', () => {
    const ran: string[] = [];
    const { result } = renderHook(() => useAnimationFrameRef());

    act(() => result.current.schedule(() => ran.push('dropped')));
    act(() => result.current.cancel());
    // A second cancel has nothing left to release.
    act(() => result.current.cancel());
    runFrames();

    expect(ran).toEqual([]);
  });

  it('drops a scheduled callback on unmount', () => {
    const ran: string[] = [];
    const { result, unmount } = renderHook(() => useAnimationFrameRef());

    act(() => result.current.schedule(() => ran.push('dropped')));
    unmount();
    runFrames();

    expect(ran).toEqual([]);
  });
});

describe('useTimeoutRef', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps a stable handle across renders', () => {
    const { result, rerender } = renderHook(() => useTimeoutRef());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it('replaces a pending callback rather than stacking a second one', () => {
    const ran: string[] = [];
    const { result } = renderHook(() => useTimeoutRef());

    act(() => {
      result.current.set(() => ran.push('stale'), 10);
      result.current.set(() => ran.push('current'), 10);
    });
    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(ran).toEqual(['current']);
  });

  it('drops a pending callback when cleared explicitly', () => {
    const ran: string[] = [];
    const { result } = renderHook(() => useTimeoutRef());

    act(() => result.current.set(() => ran.push('dropped'), 10));
    act(() => result.current.clear());
    // A second clear has nothing left to release.
    act(() => result.current.clear());
    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(ran).toEqual([]);
  });

  it('drops a pending callback on unmount', () => {
    const ran: string[] = [];
    const { result, unmount } = renderHook(() => useTimeoutRef());

    act(() => result.current.set(() => ran.push('dropped'), 10));
    unmount();
    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(ran).toEqual([]);
  });
});
