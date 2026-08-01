import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diffReviewId } from '@/utils/diffReview';
import { useComparisonResultIndex } from './useComparisonResultIndex';

type PaneGeometry = { scrollHeight: number; clientHeight: number };

/**
 * Builds a pane holding `total` diff elements stacked `spacing` px apart.
 * jsdom has no layout, so rects are declared explicitly.
 */
function buildPane(total: number, geometry: PaneGeometry, spacing = 100): HTMLDivElement {
  const pane = document.createElement('div');
  Object.defineProperty(pane, 'scrollHeight', { configurable: true, value: geometry.scrollHeight });
  Object.defineProperty(pane, 'clientHeight', { configurable: true, value: geometry.clientHeight });
  pane.scrollTop = 0;
  pane.getBoundingClientRect = () => ({ top: 0, left: 0, width: 800, height: geometry.clientHeight, right: 800, bottom: geometry.clientHeight, x: 0, y: 0, toJSON: () => ({}) });

  for (let position = 1; position <= total; position++) {
    const element = document.createElement('ins');
    element.dataset.diffId = diffReviewId(position);
    element.textContent = `difference ${position}`;
    const top = position * spacing;
    element.getBoundingClientRect = () => ({ top, left: 0, width: 200, height: 20, right: 200, bottom: top + 20, x: 0, y: top, toJSON: () => ({}) });
    pane.append(element);
  }
  document.body.append(pane);
  return pane;
}

function mountIndex(total: number, options: { spacingA?: number; spacingB?: number } = {}) {
  const paneA = { current: buildPane(total, { scrollHeight: 2000, clientHeight: 500 }, options.spacingA ?? 100) };
  const paneB = { current: buildPane(total, { scrollHeight: 2000, clientHeight: 500 }, options.spacingB ?? 100) };
  const view = renderHook(() => useComparisonResultIndex({ paneA, paneB, total }));
  return { ...view, paneA, paneB };
}

describe('useComparisonResultIndex', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('starts empty before the first rebuild', () => {
    const { result } = mountIndex(3);

    expect(result.current.items).toEqual([]);
    expect(result.current.version).toBe(0);
    expect(result.current.diffIndex.current.size).toBe(0);
  });

  it('indexes every difference on rebuild', () => {
    const view = mountIndex(3);

    act(() => view.result.current.rebuild());

    expect(view.result.current.diffIndex.current.size).toBe(3);
    expect(view.result.current.items).toHaveLength(3);
    expect(view.result.current.version).toBe(1);
  });

  it('makes indexed differences keyboard focusable', () => {
    const view = mountIndex(2);

    act(() => view.result.current.rebuild());

    view.paneA.current.querySelectorAll('ins').forEach((element) => {
      expect(element.tabIndex).toBe(0);
    });
  });

  it('bumps the version on each rebuild so dependents recompute', () => {
    const view = mountIndex(2);

    act(() => view.result.current.rebuild());
    act(() => view.result.current.rebuild());

    expect(view.result.current.version).toBe(2);
  });

  it('places map items inside the 1-99 band in document order', () => {
    const view = mountIndex(3);

    act(() => view.result.current.rebuild());

    const positions = view.result.current.items.map((item) => item.position);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    positions.forEach((position) => {
      expect(position).toBeGreaterThanOrEqual(1);
      expect(position).toBeLessThanOrEqual(99);
    });
  });

  it('reports the change kind for each difference', () => {
    const view = mountIndex(2);

    act(() => view.result.current.rebuild());

    // Both panes carry an <ins>, so each difference reads as modified.
    expect(view.result.current.items.every((item) => item.kind === 'modified')).toBe(true);
  });

  it('scrolls the opposite pane when syncing from a pane', () => {
    const view = mountIndex(3);
    act(() => view.result.current.rebuild());

    act(() => view.result.current.syncPaneFrom('A', 300));

    expect(view.paneB.current.scrollTop).toBeGreaterThan(0);
  });

  it('maps through anchors when the panes have different spacing', () => {
    const view = mountIndex(3, { spacingA: 100, spacingB: 200 });
    act(() => view.result.current.rebuild());

    act(() => view.result.current.syncPaneFrom('A', 200));

    // Pane B's matching anchor sits twice as far down as pane A's.
    expect(view.paneB.current.scrollTop).toBe(400);
  });

  it('clears the index and map items', () => {
    const view = mountIndex(3);
    act(() => view.result.current.rebuild());

    act(() => view.result.current.clear());

    expect(view.result.current.diffIndex.current.size).toBe(0);
    expect(view.result.current.items).toEqual([]);
  });

  it('produces no items when there are no differences', () => {
    const view = mountIndex(0);

    act(() => view.result.current.rebuild());

    expect(view.result.current.items).toEqual([]);
    expect(view.result.current.diffIndex.current.size).toBe(0);
  });
});
