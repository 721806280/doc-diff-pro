import { describe, expect, it } from 'vitest';
import { type PlacementBox, resolveDiffActionPlacement } from './diffActionPlacement';

const BOUNDS: PlacementBox = { top: 0, bottom: 800, left: 0, right: 700 };
const SIZE = { width: 200, height: 34 };

function target(box: { top: number; left: number; width: number; height: number }): HTMLElement {
  const element = document.createElement('ins');
  element.getBoundingClientRect = () => ({
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
    right: box.left + box.width,
    bottom: box.top + box.height,
    x: box.left,
    y: box.top,
    toJSON: () => ({})
  });
  return element;
}

function placeAt(
  box: { top: number; left: number; width: number; height: number },
  obstacles: PlacementBox[] = [],
  bounds: PlacementBox = BOUNDS
) {
  return resolveDiffActionPlacement({
    target: target(box),
    bounds,
    size: SIZE,
    margin: 12,
    windowWidth: 1440,
    obstacles
  });
}

/** A rendered line of text spanning `left`..`right` at the given band. */
function line(top: number, left: number, right: number): PlacementBox {
  return { top, bottom: top + 22, left, right };
}

describe('resolveDiffActionPlacement', () => {
  it('sits above the difference when nothing is in the way', () => {
    expect(placeAt({ top: 400, left: 300, width: 60, height: 22 })).toEqual({
      top: 357,
      left: 330,
      side: 'above',
      arrow: 100
    });
  });

  it('flips below when the line above is covered but the one below is free', () => {
    const placement = placeAt({ top: 400, left: 300, width: 60, height: 22 }, [line(370, 0, 680)]);

    expect(placement?.side).toBe('below');
    expect(placement?.top).toBe(431);
  });

  it('slides sideways into free space instead of flipping', () => {
    // Both neighbouring lines are occupied, but the one above stops at 320px,
    // so there is room to its right.
    const placement = placeAt({ top: 400, left: 300, width: 60, height: 22 }, [line(370, 0, 320), line(430, 0, 680)]);

    expect(placement?.side).toBe('above');
    expect(placement?.left).toBeGreaterThan(400);
  });

  it('stops sliding where the arrow can no longer reach the difference', () => {
    // The line above runs to 620px, so clearing it entirely would park the
    // popover far to the right of the difference; the arrow's reach caps the
    // slide at half the popover's width minus the arrow inset.
    const placement = placeAt({ top: 400, left: 300, width: 60, height: 22 }, [line(370, 0, 620), line(430, 0, 680)]);

    expect(placement?.left).toBeLessThanOrEqual(330 + SIZE.width / 2 - 14);
    expect(placement?.arrow).toBeGreaterThanOrEqual(14);
  });

  it('keeps the arrow pointing at the difference after sliding', () => {
    const placement = placeAt({ top: 400, left: 300, width: 60, height: 22 }, [line(370, 0, 320), line(430, 0, 680)]);

    // Arrow offsets are measured from the popover's left edge and clamped into
    // its rounded corners.
    expect(placement?.arrow).toBeGreaterThanOrEqual(14);
    expect(placement?.arrow).toBeLessThanOrEqual(SIZE.width - 14);
  });

  it('accepts the smaller overlap when both sides are covered', () => {
    const placement = placeAt({ top: 400, left: 300, width: 60, height: 22 }, [
      line(370, 0, 680),
      line(430, 0, 680),
      line(348, 0, 680)
    ]);

    expect(placement?.side).toBe('below');
  });

  it('stays inside its own pane rather than spilling into the other one', () => {
    const placement = placeAt({ top: 400, left: 640, width: 40, height: 22 });

    expect(placement?.left).toBeLessThanOrEqual(BOUNDS.right - SIZE.width / 2);
  });

  it('falls back to the window clamp when the pane is narrower than the popover', () => {
    const placement = placeAt({ top: 400, left: 20, width: 40, height: 22 }, [], {
      top: 0,
      bottom: 800,
      left: 0,
      right: 120
    });

    // 12px window margin plus the popover's own half width.
    expect(placement?.left).toBe(112);
  });

  it('keeps a difference in the left margin as close as the window clamp allows', () => {
    // The difference sits at 20px, closer to the edge than the popover's centre
    // may go, so the popover parks at the clamp instead of sliding away.
    const placement = placeAt({ top: 400, left: 10, width: 20, height: 22 }, [line(370, 0, 680)]);

    expect(placement?.left).toBe(112);
    expect(placement?.arrow).toBe(14);
  });

  it('gives up when neither side fits inside the pane', () => {
    const placement = placeAt({ top: 10, left: 300, width: 60, height: 22 }, [], {
      top: 0,
      bottom: 60,
      left: 0,
      right: 700
    });

    expect(placement).toBeNull();
  });
});
