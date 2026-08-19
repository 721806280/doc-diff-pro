/**
 * Placement maths for the floating difference action popover.
 *
 * The popover has to sit next to the difference it acts on, but the panes are
 * dense running text: an overlay parked blindly above the difference lands on
 * the previous line and hides the words the reviewer is comparing. So the
 * candidate slots — above/below, and a sideways slide within the pane — are
 * scored against the line boxes actually rendered around the difference, and
 * the cheapest slot wins.
 */

export type DiffActionSide = 'above' | 'below';

export type PlacementBox = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type PlacementSize = {
  width: number;
  height: number;
};

export type PlacementResult = {
  top: number;
  left: number;
  side: DiffActionSide;
  arrow: number;
};

/** Clearance between the difference and the popover's nearest edge. */
export const DIFF_ACTION_GAP = 9;

/** Breathing room left between the popover and the text it slides past. */
const SLIDE_CLEARANCE = 6;

/** Bound on the slots scored per side, so a huge table cannot stall a frame. */
const MAX_CANDIDATES = 48;

/** Keeps the arrow inside the popover's rounded corners. */
const ARROW_INSET = 14;

/**
 * Scoring weights. Covered text is measured in px², the slide in px, so the
 * slide is amplified to stay comparable: sliding 100px only pays off when it
 * frees roughly two CJK glyphs' worth of text. Flipping sides costs about a
 * 15px slide, which keeps the familiar "above" placement unless the other side
 * is genuinely clearer.
 */
const SLIDE_WEIGHT = 8;
const FLIP_COST = 120;

const TEXT_BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, caption, blockquote, pre, figcaption';
const NEIGHBOUR_REACH = 3;

/** Bounds on DOM measurement so a huge table cannot stall a scroll frame. */
const MAX_SCANNED_RECTS = 600;

export function resolveDiffActionPlacement(options: {
  target: HTMLElement;
  bounds: PlacementBox;
  size: PlacementSize;
  /** Gap kept between the popover's outer edge and the window's. */
  margin: number;
  windowWidth: number;
  /** Injected by tests; measured from the DOM when omitted. */
  obstacles?: PlacementBox[];
}): PlacementResult | null {
  const { target, bounds, size, margin, windowWidth } = options;
  const rect = target.getBoundingClientRect();
  const half = size.width / 2;

  const slots: { side: DiffActionSide; top: number }[] = [];
  const aboveTop = rect.top - DIFF_ACTION_GAP - size.height;
  if (aboveTop >= bounds.top) slots.push({ side: 'above', top: aboveTop });
  const belowTop = rect.bottom + DIFF_ACTION_GAP;
  if (belowTop + size.height <= bounds.bottom) slots.push({ side: 'below', top: belowTop });
  if (slots.length === 0) return null;

  const targetCentre = rect.left + rect.width / 2;
  const obstacles =
    options.obstacles ??
    collectLineBoxes(target, {
      top: Math.min(aboveTop, rect.top),
      bottom: Math.max(belowTop + size.height, rect.bottom)
    });
  const centres = candidateCentres(targetCentre, bounds, half, margin, windowWidth, obstacles);

  let best: (PlacementResult & { score: number }) | null = null;
  for (const slot of slots) {
    for (const centre of centres) {
      const box = { top: slot.top, bottom: slot.top + size.height, left: centre - half, right: centre + half };
      const covered = obstacles.reduce((total, obstacle) => total + overlapArea(box, obstacle), 0);
      const score = covered + Math.abs(centre - targetCentre) * SLIDE_WEIGHT + (slot.side === 'below' ? FLIP_COST : 0);
      if (best && score >= best.score) continue;
      best = {
        score,
        side: slot.side,
        top: slot.top,
        left: centre,
        arrow: clamp(targetCentre - (centre - half), ARROW_INSET, Math.max(ARROW_INSET, size.width - ARROW_INSET))
      };
    }
  }
  if (!best) return null;
  return { top: best.top, left: best.left, side: best.side, arrow: best.arrow };
}

/**
 * Slots the popover may occupy. Coverage only changes where the popover clears
 * a line of text, so the candidates are the difference's own centre, the
 * positions just past each line's edges, and the two clamps — the score's
 * breakpoints, rather than a blind sweep across the pane.
 *
 * The slide is capped at the arrow's reach: a popover parked further away than
 * that can no longer point at the difference it acts on, which reads as a
 * detached bubble even when it covers nothing.
 */
function candidateCentres(
  targetCentre: number,
  bounds: PlacementBox,
  half: number,
  margin: number,
  windowWidth: number,
  obstacles: PlacementBox[]
): number[] {
  // Derived from the popover's measured width so a narrow popover may sit as
  // close to a margin difference as the difference itself does.
  const windowMin = Math.min(margin + half, windowWidth / 2);
  const windowMax = Math.max(windowWidth - margin - half, windowWidth / 2);
  // Prefer keeping the popover inside its own pane, but a pane narrower than
  // the popover falls back to the window bounds rather than inverting.
  let min = Math.max(windowMin, bounds.left + half);
  let max = Math.min(windowMax, bounds.right - half);
  if (min > max) {
    min = windowMin;
    max = windowMax;
  }

  // A difference closer to a clamp than the arrow's reach cannot be pointed at
  // whatever the slide does; there the popover stays as near as the clamp lets
  // it rather than drifting off to hunt for free space.
  const reach = Math.max(0, half - ARROW_INSET);
  const reachMin = Math.max(min, targetCentre - reach);
  const reachMax = Math.min(max, targetCentre + reach);
  const reachable = reachMin <= reachMax;
  const low = reachable ? reachMin : clamp(targetCentre, min, max);
  const high = reachable ? reachMax : low;

  const centres: number[] = [];
  const seen = new Set<number>();
  const push = (value: number): boolean => {
    const centre = Math.round(clamp(value, low, high));
    if (!seen.has(centre)) {
      seen.add(centre);
      centres.push(centre);
    }
    return centres.length < MAX_CANDIDATES;
  };

  push(targetCentre);
  for (const obstacle of obstacles) {
    if (!push(obstacle.right + half + SLIDE_CLEARANCE)) break;
    if (!push(obstacle.left - half - SLIDE_CLEARANCE)) break;
  }
  push(low);
  push(high);
  return centres;
}

/**
 * Line boxes rendered around the difference. Only the difference's own block
 * and a few neighbours are measured: the popover is ~34px tall, so nothing
 * further away can reach the candidate slots.
 */
export function collectLineBoxes(target: HTMLElement, region: { top: number; bottom: number }): PlacementBox[] {
  const cell = target.closest('td, th');
  const block = (cell && target.closest('table')) ?? target.closest(TEXT_BLOCK_SELECTOR) ?? target.parentElement;
  if (!block) return [];

  const candidates: Element[] = [block];
  let previous = block.previousElementSibling;
  let next = block.nextElementSibling;
  for (let step = 0; step < NEIGHBOUR_REACH; step += 1) {
    if (previous) {
      candidates.push(previous);
      previous = previous.previousElementSibling;
    }
    if (next) {
      candidates.push(next);
      next = next.nextElementSibling;
    }
  }

  const boxes: PlacementBox[] = [];
  let scanned = 0;
  for (const element of candidates) {
    const outer = element.getBoundingClientRect();
    if (outer.bottom < region.top || outer.top > region.bottom) continue;
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    // jsdom has no layout, so Range line boxes are unavailable under test.
    const lines = typeof range.getClientRects === 'function' ? Array.from(range.getClientRects()) : [];
    for (const line of lines) {
      scanned += 1;
      if (scanned > MAX_SCANNED_RECTS) return boxes;
      if (line.width <= 0 || line.height <= 0) continue;
      if (line.bottom < region.top || line.top > region.bottom) continue;
      boxes.push({ top: line.top, bottom: line.bottom, left: line.left, right: line.right });
    }
  }
  return boxes;
}

function overlapArea(a: PlacementBox, b: PlacementBox): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
