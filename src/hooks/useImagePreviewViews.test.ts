import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useImagePreviewViews } from './useImagePreviewViews';

describe('useImagePreviewViews', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('schedules one feedback timer per committed zoom in StrictMode', () => {
    const schedule = vi.spyOn(window, 'setTimeout');
    const { result, unmount } = renderHook(() => useImagePreviewViews(), { wrapper: StrictMode });
    const zoom = () => {
      result.current.setViews(
        (previous) => ({ ...previous, A: { ...previous.A, scale: (previous.A.scale ?? 1) * 2 } }),
        'A'
      );
    };

    act(zoom);
    expect(result.current.views.A.scale).toBe(2);
    expect(result.current.zoomFeedback).toBe('A');
    expect(schedule.mock.calls.filter(([, delay]) => delay === 700)).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(zoom);
    expect(result.current.views.A.scale).toBe(4);
    expect(schedule.mock.calls.filter(([, delay]) => delay === 700)).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.zoomFeedback).toBe('A');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.zoomFeedback).toBeNull();

    act(zoom);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves batched view changes and keeps comparison and difference views independent', () => {
    const { result } = renderHook(() => useImagePreviewViews(), { wrapper: StrictMode });

    act(() => {
      result.current.setViews((previous) => ({ ...previous, A: { ...previous.A, rotation: 90 } }));
      result.current.setViews((previous) => ({ ...previous, A: { ...previous.A, scale: 2 } }), 'A');
      result.current.setDifferenceViews((previous) => ({ ...previous, B: { ...previous.B, scale: 3 } }), 'B');
    });

    expect(result.current.views.A).toMatchObject({ rotation: 90, scale: 2 });
    expect(result.current.views.B.scale).toBeNull();
    expect(result.current.differenceViews.B.scale).toBe(3);
    expect(result.current.differenceViews.A.rotation).toBe(0);
    expect(result.current.zoomFeedback).toBe('B');

    act(() => result.current.resetDifferenceViews());
    expect(result.current.differenceViews.B.scale).toBeNull();
    expect(result.current.views.A).toMatchObject({ rotation: 90, scale: 2 });
    expect(result.current.zoomFeedback).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not restart feedback for a bounded zoom or pan', () => {
    const { result } = renderHook(() => useImagePreviewViews());
    act(() => result.current.setViews((previous) => previous, 'B'));
    expect(result.current.zoomFeedback).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    act(() => result.current.setViews((previous) => ({ ...previous, B: { ...previous.B, scale: 2 } }), 'B'));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => result.current.setViews((previous) => ({ ...previous, B: { ...previous.B, x: 0.6 } })));
    act(() => result.current.setViews((previous) => previous, 'B'));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.zoomFeedback).toBeNull();
    expect(result.current.views.B.x).toBe(0.6);

    act(() => result.current.clearZoomFeedback());
    expect(vi.getTimerCount()).toBe(0);
  });
});
