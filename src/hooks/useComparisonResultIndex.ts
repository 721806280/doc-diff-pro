import { useCallback, useRef, useState, type RefObject } from 'react';
import type { DiffMapItem } from '@/types/diff';
import type { PaneSide } from '@/types/document';
import { buildDiffElementIndex, type DiffElementIndex } from '@/utils/diffElementIndex';
import { createReviewItem, diffReviewId, firstReviewElement } from '@/utils/diffReview';
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

  const rebuild = useCallback(() => {
    const nextIndex = buildDiffElementIndex(paneA.current, paneB.current);
    diffIndex.current = nextIndex;
    nextIndex.forEach((group) => [...group.A, ...group.B].forEach((element) => { element.tabIndex = 0; }));
    const anchors: ScrollAnchor[] = [];
    const nextItems: DiffMapItem[] = [];
    for (let index = 1; index <= total; index++) {
      const group = nextIndex.get(diffReviewId(index));
      const item = createReviewItem(index, group);
      const elementA = firstReviewElement(group, 'A');
      const elementB = firstReviewElement(group, 'B');
      if (paneA.current && paneB.current && elementA && elementB) {
        anchors.push({ topA: scrollTop(paneA.current, elementA), topB: scrollTop(paneB.current, elementB) });
      }
      if (!item) continue;
      const positions = [
        paneA.current && elementA ? scrollTop(paneA.current, elementA) / Math.max(1, paneA.current.scrollHeight) : null,
        paneB.current && elementB ? scrollTop(paneB.current, elementB) / Math.max(1, paneB.current.scrollHeight) : null
      ].filter((value): value is number => value !== null);
      if (positions.length) nextItems.push({ index, kind: item.kind, position: Math.min(99, Math.max(1, positions.reduce((sum, value) => sum + value, 0) / positions.length * 100)) });
    }
    alignmentAnchors.current = anchors;
    setItems(nextItems);
    setVersion((value) => value + 1);
  }, [paneA, paneB, total]);

  const syncPaneFrom = useCallback((sourceKey: PaneSide, sourceTop?: number) => {
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
  }, [paneA, paneB]);

  const clear = useCallback(() => {
    diffIndex.current.clear();
    alignmentAnchors.current = [];
    setItems([]);
  }, []);

  return { diffIndex, items, version, rebuild, syncPaneFrom, clear };
}

function scrollTop(container: HTMLElement, element: HTMLElement): number {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  return elementRect.top - containerRect.top + container.scrollTop;
}
