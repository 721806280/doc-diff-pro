export type ScrollPaneKey = 'A' | 'B';

export type ScrollAnchor = {
  topA: number;
  topB: number;
};

type AnchorTopKey = keyof ScrollAnchor;

type SyncScrollOptions = {
  sourceKey: ScrollPaneKey;
  sourceTop: number;
  maxSourceTop: number;
  maxTargetTop: number;
  anchors: readonly ScrollAnchor[];
};

const EDGE_TOLERANCE = 4;

export function resolveSyncScrollTop({
  sourceKey,
  sourceTop,
  maxSourceTop,
  maxTargetTop,
  anchors
}: SyncScrollOptions): number {
  const sourceMax = Math.max(0, maxSourceTop);
  const targetMax = Math.max(0, maxTargetTop);
  const currentTop = clampScrollTop(sourceTop, sourceMax);

  if (currentTop <= EDGE_TOLERANCE) return 0;
  if (currentTop >= sourceMax - EDGE_TOLERANCE) return targetMax;

  if (anchors.length === 0) {
    return sourceMax > 0 ? Math.round((currentTop / sourceMax) * targetMax) : 0;
  }

  return resolveAnchoredTop(sourceKey, currentTop, sourceMax, targetMax, anchors);
}

export function findNextAnchorIndex(
  anchors: readonly ScrollAnchor[],
  key: AnchorTopKey,
  sourceTop: number
): number {
  let start = 0;
  let end = anchors.length - 1;
  let nextIndex = -1;

  while (start <= end) {
    const middle = Math.floor((start + end) / 2);

    if (anchors[middle][key] >= sourceTop) {
      nextIndex = middle;
      end = middle - 1;
    } else {
      start = middle + 1;
    }
  }

  return nextIndex;
}

function resolveAnchoredTop(
  sourceKey: ScrollPaneKey,
  currentTop: number,
  maxSourceTop: number,
  maxTargetTop: number,
  anchors: readonly ScrollAnchor[]
): number {
  const sourceTopKey = sourceKey === 'A' ? 'topA' : 'topB';
  const targetTopKey = sourceKey === 'A' ? 'topB' : 'topA';
  const nextIndex = findNextAnchorIndex(anchors, sourceTopKey, currentTop);

  if (nextIndex === 0) {
    const first = anchors[0];
    return interpolateScrollTop(currentTop, 0, first[sourceTopKey], 0, first[targetTopKey]);
  }

  if (nextIndex === -1) {
    const last = anchors[anchors.length - 1];
    return interpolateScrollTop(
      currentTop,
      last[sourceTopKey],
      maxSourceTop,
      last[targetTopKey],
      maxTargetTop
    );
  }

  const previous = anchors[nextIndex - 1];
  const next = anchors[nextIndex];
  return interpolateScrollTop(
    currentTop,
    previous[sourceTopKey],
    next[sourceTopKey],
    previous[targetTopKey],
    next[targetTopKey]
  );
}

function clampScrollTop(value: number, maxScrollTop: number): number {
  return Math.min(Math.max(value, 0), maxScrollTop);
}

function interpolateScrollTop(
  sourceTop: number,
  sourceStart: number,
  sourceEnd: number,
  targetStart: number,
  targetEnd: number
): number {
  const sourceDistance = sourceEnd - sourceStart;
  if (sourceDistance <= 0) return targetStart;

  const ratio = (sourceTop - sourceStart) / sourceDistance;
  return targetStart + (ratio * (targetEnd - targetStart));
}
