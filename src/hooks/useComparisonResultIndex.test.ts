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
  pane.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    width: 800,
    height: geometry.clientHeight,
    right: 800,
    bottom: geometry.clientHeight,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });

  for (let position = 1; position <= total; position++) {
    const element = document.createElement('ins');
    element.dataset.diffId = diffReviewId(position);
    element.textContent = `difference ${position}`;
    const top = position * spacing;
    element.getBoundingClientRect = () => ({
      top,
      left: 0,
      width: 200,
      height: 20,
      right: 200,
      bottom: top + 20,
      x: 0,
      y: top,
      toJSON: () => ({})
    });
    pane.append(element);
  }
  document.body.append(pane);
  return pane;
}

function mountIndex(
  total: number,
  options: { spacingA?: number; spacingB?: number; labelDiff?: (index: number, kind: string) => string } = {}
) {
  const paneA = { current: buildPane(total, { scrollHeight: 2000, clientHeight: 500 }, options.spacingA ?? 100) };
  const paneB = { current: buildPane(total, { scrollHeight: 2000, clientHeight: 500 }, options.spacingB ?? 100) };
  const view = renderHook(
    (props: { labelDiff?: (index: number, kind: string) => string }) =>
      useComparisonResultIndex({ paneA, paneB, total, labelDiff: props.labelDiff }),
    { initialProps: { labelDiff: options.labelDiff } }
  );
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

  it('names each difference for assistive technology and relabels on a locale change', () => {
    // `ins`/`del` carry no announceable name of their own, so a keyboard user
    // landing on one is otherwise told nothing about what it is. Every group
    // here has an element in both panes, so each reads as a modification.
    const view = mountIndex(2, { labelDiff: (index, kind) => `Difference ${index}: ${kind}` });

    act(() => view.result.current.rebuild());

    const elements = Array.from(view.paneB.current.querySelectorAll('ins'));
    expect(elements.map((element) => element.getAttribute('role'))).toEqual(['group', 'group']);
    expect(elements.map((element) => element.getAttribute('aria-label'))).toEqual([
      'Difference 1: modified',
      'Difference 2: modified'
    ]);

    view.rerender({ labelDiff: (index, kind) => `差异 ${index}：${kind}` });

    expect(elements.map((element) => element.getAttribute('aria-label'))).toEqual([
      '差异 1：modified',
      '差异 2：modified'
    ]);
    expect(view.result.current.version).toBe(1);
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

  it('measures geometry once per rebuild and refreshes it after layout changes', () => {
    const view = mountIndex(3, { spacingA: 100, spacingB: 200 });
    let paneTopA = 40;
    let paneTopB = 80;
    const rectA = view.paneA.current.getBoundingClientRect();
    const rectB = view.paneB.current.getBoundingClientRect();
    const measureA = vi
      .spyOn(view.paneA.current, 'getBoundingClientRect')
      .mockImplementation(() => ({ ...rectA, top: paneTopA }));
    const measureB = vi
      .spyOn(view.paneB.current, 'getBoundingClientRect')
      .mockImplementation(() => ({ ...rectB, top: paneTopB }));
    const elements = [...view.paneA.current.querySelectorAll('ins'), ...view.paneB.current.querySelectorAll('ins')];
    const measurements = elements.map((element) => vi.spyOn(element, 'getBoundingClientRect'));
    const previewReads = elements.map((element) => vi.spyOn(element, 'textContent', 'get'));
    view.paneA.current.scrollTop = 240;
    view.paneB.current.scrollTop = 180;

    act(() => view.result.current.rebuild());

    expect(view.result.current.items.map((item) => item.position)).toEqual([15, 22.5, 30]);
    expect(measureA).toHaveBeenCalledTimes(1);
    expect(measureB).toHaveBeenCalledTimes(1);
    measurements.forEach((measure) => expect(measure).toHaveBeenCalledTimes(1));
    previewReads.forEach((read) => expect(read).not.toHaveBeenCalled());

    paneTopA = 90;
    paneTopB = 120;
    view.paneA.current.scrollTop = 390;
    view.paneB.current.scrollTop = 220;
    Object.defineProperty(view.paneB.current, 'scrollHeight', { value: 4000 });
    act(() => view.result.current.rebuild());

    const positions = view.result.current.items.map((item) => item.position);
    expect(positions).toHaveLength(3);
    [13.75, 18.75, 23.75].forEach((position, index) => expect(positions[index]).toBeCloseTo(position, 12));
    expect(measureA).toHaveBeenCalledTimes(2);
    expect(measureB).toHaveBeenCalledTimes(2);
    measurements.forEach((measure) => expect(measure).toHaveBeenCalledTimes(2));
    previewReads.forEach((read) => expect(read).not.toHaveBeenCalled());
  });

  it('handles a missing pane and missing difference ids on either side', () => {
    const paneA: { current: HTMLDivElement | null } = { current: null };
    const paneB: { current: HTMLDivElement | null } = {
      current: buildPane(1, { scrollHeight: 1000, clientHeight: 500 }, 200)
    };
    const { result } = renderHook(() => useComparisonResultIndex({ paneA, paneB, total: 3 }));

    act(() => result.current.rebuild());
    expect(result.current.items).toEqual([{ index: 1, kind: 'inserted', position: 20 }]);

    paneA.current = buildPane(1, { scrollHeight: 2000, clientHeight: 500 });
    paneB.current = null;
    act(() => result.current.rebuild());
    expect(result.current.items).toEqual([{ index: 1, kind: 'deleted', position: 5 }]);
    expect(() => result.current.syncPaneFrom('A', 100)).not.toThrow();
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
