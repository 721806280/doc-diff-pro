import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectLineBoxes, type PlacementBox, resolveDiffActionPlacement } from './diffActionPlacement';

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

/**
 * Line boxes are what the placement scores against, and jsdom renders nothing:
 * `Range.getClientRects` returns an empty list there. These tests stand in for
 * the layout, one list of rects per element, so the walk around the difference
 * can be pinned without a browser.
 */
describe('collectLineBoxes', () => {
  const REGION = { top: 0, bottom: 600 };
  const rects = new Map<Element, PlacementBox[]>();

  afterEach(() => {
    rects.clear();
    delete (Range.prototype as Partial<Range>).getClientRects;
    vi.restoreAllMocks();
  });

  // jsdom's Range has no `getClientRects` at all, which is the case the
  // collector guards against; defining one is what puts a layout under it.
  function stubLineRects(): void {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value(this: Range) {
        const boxes = rects.get(this.startContainer as Element) ?? [];
        return boxes.map((box) => ({ ...box, width: box.right - box.left, height: box.bottom - box.top }));
      }
    });
  }

  function paragraphs(count: number): HTMLElement[] {
    const body = document.createElement('div');
    for (let index = 0; index < count; index++) {
      const paragraph = document.createElement('p');
      paragraph.append(document.createElement('ins'));
      body.append(paragraph);
    }
    document.body.append(body);
    return Array.from(body.children) as HTMLElement[];
  }

  it('measures the difference block and its nearest neighbours only', () => {
    stubLineRects();
    const blocks = paragraphs(9);
    blocks.forEach((block, index) => rects.set(block, [line(index * 20, 0, 100 + index)]));
    const target = blocks[4]!.querySelector('ins') as HTMLElement;

    const boxes = collectLineBoxes(target, REGION);

    // Its own block plus three either side; the ninth paragraph is out of reach.
    expect(boxes).toHaveLength(7);
    expect(boxes.map((box) => box.right).sort((left, right) => left - right)).toEqual([
      101, 102, 103, 104, 105, 106, 107
    ]);
  });

  it('leaves out blocks and lines that fall outside the region', () => {
    stubLineRects();
    const blocks = paragraphs(2);
    const [first, second] = blocks as [HTMLElement, HTMLElement];
    second.getBoundingClientRect = () => ({ ...line(900, 0, 100), width: 100, height: 22, x: 0, y: 900 }) as DOMRect;
    rects.set(first, [line(100, 0, 100), line(700, 0, 100), { top: 200, bottom: 200, left: 0, right: 0 }]);
    rects.set(second, [line(900, 0, 100)]);

    const boxes = collectLineBoxes(first.querySelector('ins') as HTMLElement, REGION);

    // Only the first line: the empty rect carries no text, the 700px one is
    // past the region, and the second block never gets measured at all.
    expect(boxes).toEqual([{ top: 100, bottom: 122, left: 0, right: 100 }]);
  });

  it('stops measuring a block that reports more lines than the scan allows', () => {
    stubLineRects();
    const [block] = paragraphs(1) as [HTMLElement];
    rects.set(
      block,
      Array.from({ length: 700 }, (_value, index) => line(index % 500, 0, 100))
    );

    expect(collectLineBoxes(block.querySelector('ins') as HTMLElement, REGION).length).toBeLessThan(700);
  });

  it('measures the whole table around a difference inside a cell', () => {
    stubLineRects();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<table><tr><td><ins>changed</ins></td></tr></table><p>after</p>';
    document.body.append(wrapper);
    const table = wrapper.querySelector('table') as HTMLElement;
    rects.set(table, [line(40, 0, 400)]);
    rects.set(wrapper.querySelector('p') as HTMLElement, [line(80, 0, 200)]);

    const boxes = collectLineBoxes(wrapper.querySelector('ins') as HTMLElement, REGION);

    expect(boxes).toEqual([
      { top: 40, bottom: 62, left: 0, right: 400 },
      { top: 80, bottom: 102, left: 0, right: 200 }
    ]);
  });

  it('reports nothing for a difference with no block around it', () => {
    const orphan = document.createElement('ins');

    expect(collectLineBoxes(orphan, REGION)).toEqual([]);
  });
});
