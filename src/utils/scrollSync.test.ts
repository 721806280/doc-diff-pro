import { describe, expect, it } from 'vitest';
import { findNextAnchorIndex, resolveSyncScrollTop, type ScrollAnchor } from './scrollSync';

const anchors: ScrollAnchor[] = [
  { topA: 100, topB: 80 },
  { topA: 300, topB: 260 },
  { topA: 700, topB: 640 }
];

describe('resolveSyncScrollTop', () => {
  it('keeps both panes aligned at scroll edges', () => {
    expect(resolveSyncScrollTop({
      sourceKey: 'A',
      sourceTop: 3,
      maxSourceTop: 1000,
      maxTargetTop: 800,
      anchors
    })).toBe(0);

    expect(resolveSyncScrollTop({
      sourceKey: 'A',
      sourceTop: 997,
      maxSourceTop: 1000,
      maxTargetTop: 800,
      anchors
    })).toBe(800);
  });

  it('falls back to proportional scrolling when no anchors are available', () => {
    expect(resolveSyncScrollTop({
      sourceKey: 'A',
      sourceTop: 250,
      maxSourceTop: 1000,
      maxTargetTop: 800,
      anchors: []
    })).toBe(200);
  });

  it('interpolates before the first anchor', () => {
    expect(resolveSyncScrollTop({
      sourceKey: 'A',
      sourceTop: 50,
      maxSourceTop: 1000,
      maxTargetTop: 800,
      anchors
    })).toBe(40);
  });

  it('interpolates between anchors', () => {
    expect(resolveSyncScrollTop({
      sourceKey: 'A',
      sourceTop: 200,
      maxSourceTop: 1000,
      maxTargetTop: 800,
      anchors
    })).toBe(170);
  });

  it('interpolates after the last anchor', () => {
    expect(resolveSyncScrollTop({
      sourceKey: 'A',
      sourceTop: 850,
      maxSourceTop: 1000,
      maxTargetTop: 800,
      anchors
    })).toBe(720);
  });

  it('uses the revised pane as the source when requested', () => {
    expect(resolveSyncScrollTop({
      sourceKey: 'B',
      sourceTop: 170,
      maxSourceTop: 800,
      maxTargetTop: 1000,
      anchors
    })).toBe(200);
  });
});

describe('findNextAnchorIndex', () => {
  it('finds the first anchor at or after the source top', () => {
    expect(findNextAnchorIndex(anchors, 'topA', 301)).toBe(2);
    expect(findNextAnchorIndex(anchors, 'topA', 700)).toBe(2);
  });

  it('returns -1 when the source top is beyond all anchors', () => {
    expect(findNextAnchorIndex(anchors, 'topB', 641)).toBe(-1);
  });
});
