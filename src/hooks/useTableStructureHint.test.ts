import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffElementGroup, DiffElementIndex } from '@/utils/diffElementIndex';
import { useTableStructureHint } from './useTableStructureHint';

/**
 * Two tables differing by exactly one whole inserted row, which is the shape
 * resolveTableStructureHint reports as `single-row-inserted`.
 */
function buildScene() {
  const paneA: HTMLDivElement = document.createElement('div');
  const paneB: HTMLDivElement = document.createElement('div');
  paneA.innerHTML = '<table><tr><td>行A</td><td>值1</td></tr><tr><td>行C</td><td>值3</td></tr></table>';
  paneB.innerHTML =
    '<table><tr><td>行A</td><td>值1</td></tr>' +
    '<tr><td><ins data-diff-id="diff-1">行B</ins></td><td><ins data-diff-id="diff-1">值2</ins></td></tr>' +
    '<tr><td>行C</td><td>值3</td></tr></table>';
  document.body.append(paneA, paneB);

  const inserted = Array.from(paneB.querySelectorAll<HTMLElement>('ins'));
  const group: DiffElementGroup = { A: [], B: inserted };
  const index: DiffElementIndex = new Map([['diff-1', group]]);
  return { paneA, paneB, group, index };
}

function mountHint(enabled = true) {
  const scene = buildScene();
  const view = renderHook(() =>
    useTableStructureHint({
      enabled,
      ignoreSpaces: true,
      ignoreFullHalfWidth: true,
      diffIndex: { current: scene.index },
      paneA: { current: scene.paneA },
      paneB: { current: scene.paneB }
    })
  );
  return { ...view, ...scene };
}

describe('useTableStructureHint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('starts with nothing resolved', () => {
    const { result } = mountHint();

    expect(result.current.hint).toBeNull();
    expect(result.current.open).toBe(false);
  });

  it('resolves a hint and marks the rows it refers to', () => {
    const view = mountHint();

    act(() => view.result.current.resolveFor(1, view.group));

    expect(view.result.current.hint).toMatchObject({ kind: 'single-row-inserted', candidateSide: 'revised' });
    expect(view.paneB.querySelectorAll('.table-structure-diff').length).toBeGreaterThan(0);
    expect(view.result.current.open).toBe(false);
  });

  it('shows the tip and dismisses it after the visible window', () => {
    const view = mountHint();

    act(() => view.result.current.resolveFor(1, view.group));
    act(() => view.result.current.show());
    expect(view.result.current.open).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(view.result.current.open).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(view.result.current.open).toBe(false);
  });

  // Regression: showing the tip changes the layout, which trips the pane
  // ResizeObserver, rebuilds the diff index and re-runs focusDiff for the same
  // difference. When resolveFor reset `open` unconditionally, the tip closed
  // itself within a frame of opening and was never visible in the app.
  it('keeps the tip open when the same difference is resolved again', () => {
    const view = mountHint();

    act(() => view.result.current.resolveFor(1, view.group));
    act(() => view.result.current.show());
    expect(view.result.current.open).toBe(true);

    act(() => view.result.current.resolveFor(1, view.group));
    act(() => view.result.current.resolveFor(1, view.group));

    expect(view.result.current.open).toBe(true);
    expect(view.result.current.hint).toMatchObject({ kind: 'single-row-inserted' });
  });

  it('closes the tip when a different difference is focused', () => {
    const view = mountHint();

    act(() => view.result.current.resolveFor(1, view.group));
    act(() => view.result.current.show());
    expect(view.result.current.open).toBe(true);

    act(() => view.result.current.resolveFor(2, view.group));

    expect(view.result.current.open).toBe(false);
  });

  it('holds the tip open while the pointer rests on it', () => {
    const view = mountHint();

    act(() => view.result.current.resolveFor(1, view.group));
    act(() => view.result.current.show());
    act(() => {
      vi.advanceTimersByTime(2000);
      view.result.current.holdOpen();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(view.result.current.open).toBe(true);
  });

  it('hides on demand', () => {
    const view = mountHint();

    act(() => view.result.current.resolveFor(1, view.group));
    act(() => view.result.current.show());
    act(() => view.result.current.hide());

    expect(view.result.current.open).toBe(false);
  });

  it('clears hint, markers and timer on reset', () => {
    const view = mountHint();

    act(() => view.result.current.resolveFor(1, view.group));
    act(() => view.result.current.show());
    act(() => view.result.current.reset());

    expect(view.result.current.hint).toBeNull();
    expect(view.result.current.open).toBe(false);
    expect(view.paneB.querySelectorAll('.table-structure-diff')).toHaveLength(0);
  });

  it('re-opens after a reset because the index tracking is cleared too', () => {
    const view = mountHint();

    act(() => view.result.current.resolveFor(1, view.group));
    act(() => view.result.current.show());
    act(() => view.result.current.reset());

    act(() => view.result.current.resolveFor(1, view.group));
    act(() => view.result.current.show());

    expect(view.result.current.open).toBe(true);
  });

  it('stays inert when table hints are disabled', () => {
    const view = mountHint(false);

    act(() => view.result.current.resolveFor(1, view.group));
    act(() => view.result.current.show());

    expect(view.result.current.hint).toBeNull();
    expect(view.result.current.open).toBe(false);
    expect(view.paneB.querySelectorAll('.table-structure-diff')).toHaveLength(0);
  });
});
