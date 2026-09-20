import { useCallback, useRef, useState, type RefObject } from 'react';
import type { DiffMapItem } from '@/types/diff';
import type { PaneSide } from '@/types/document';
import { buildDiffElementIndex, type DiffElementIndex } from '@/utils/diffElementIndex';
import { diffReviewId, firstReviewElement, resolveReviewKind } from '@/utils/diffReview';
import { resolveSyncScrollTop, type ScrollAnchor } from '@/utils/scrollSync';

type ComparisonResultIndexOptions = {
  paneA: RefObject<HTMLDivElement | null>;
  paneB: RefObject<HTMLDivElement | null>;
  total: number;
};

export function useComparisonResultIndex({ paneA, paneB, total }: ComparisonResultIndexOptions) {
  const diffIndex = useRef<DiffElementIndex>(new Map());
  const alignmentAnchors = useRef<ScrollAnchor[]>([]);
  const [items, setItems] = useState<DiffMapItem[]>([]);
  const [version, setVersion] = useState(0);

  // Recompute scroll anchors and diff-map positions from the current index.
  // Pure geometry: reads layout, writes no DOM, and never bumps the version so
  // an incidental reflow (image load, scrollbar toggle, closing an overlay)
  // cannot trigger the current-diff re-alignment that a content rebuild does.
  const measure = useCallback(() => {
    const originalPane = paneA.current;
    const revisedPane = paneB.current;
    const paneTopA = originalPane?.getBoundingClientRect().top ?? 0;
    const paneTopB = revisedPane?.getBoundingClientRect().top ?? 0;
    const scrollTopA = originalPane?.scrollTop ?? 0;
    const scrollTopB = revisedPane?.scrollTop ?? 0;
    const heightA = Math.max(1, originalPane?.scrollHeight ?? 0);
    const heightB = Math.max(1, revisedPane?.scrollHeight ?? 0);
    const anchors: ScrollAnchor[] = [];
    const nextItems: DiffMapItem[] = [];
    for (let index = 1; index <= total; index++) {
      const group = diffIndex.current.get(diffReviewId(index));
      if (!group) continue;
      const elementA = firstReviewElement(group, 'A');
      const elementB = firstReviewElement(group, 'B');
      const topA = originalPane && elementA ? elementA.getBoundingClientRect().top - paneTopA + scrollTopA : null;
      const topB = revisedPane && elementB ? elementB.getBoundingClientRect().top - paneTopB + scrollTopB : null;
      if (topA !== null && topB !== null) {
        anchors.push({ topA, topB });
      }
      const sides = Number(topA !== null) + Number(topB !== null);
      if (sides > 0) {
        const position = ((topA === null ? 0 : topA / heightA) + (topB === null ? 0 : topB / heightB)) / sides;
        nextItems.push({
          index,
          kind: resolveReviewKind(group),
          position: Math.min(99, Math.max(1, position * 100))
        });
      }
    }
    alignmentAnchors.current = anchors;
    setItems(nextItems);
  }, [paneA, paneB, total]);

  // Rebuild the diff element index after a content change, then take a fresh
  // geometry snapshot. Bumping the version re-runs consumers that must react to
  // new elements, including the current-diff re-alignment.
  const rebuild = useCallback(() => {
    const nextIndex = buildDiffElementIndex(paneA.current, paneB.current);
    diffIndex.current = nextIndex;
    for (const group of nextIndex.values()) {
      for (const element of group.A) element.tabIndex = 0;
      for (const element of group.B) element.tabIndex = 0;
    }
    measure();
    setVersion((value) => value + 1);
  }, [measure, paneA, paneB]);

  const syncPaneFrom = useCallback(
    (sourceKey: PaneSide, sourceTop?: number) => {
      const source = sourceKey === 'A' ? paneA.current : paneB.current;
      const target = sourceKey === 'A' ? paneB.current : paneA.current;
      if (!source || !target) return;
      target.scrollTop = resolveSyncScrollTop({
        sourceKey,
        sourceTop: sourceTop ?? source.scrollTop,
        maxSourceTop: Math.max(0, source.scrollHeight - source.clientHeight),
        maxTargetTop: Math.max(0, target.scrollHeight - target.clientHeight),
        anchors: alignmentAnchors.current
      });
    },
    [paneA, paneB]
  );

  const clear = useCallback(() => {
    diffIndex.current.clear();
    alignmentAnchors.current = [];
    setItems([]);
  }, []);

  return { diffIndex, items, version, rebuild, remeasure: measure, syncPaneFrom, clear };
}
