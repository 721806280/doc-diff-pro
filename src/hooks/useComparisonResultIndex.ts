import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { DiffChangeKind, DiffMapItem } from '@/types/diff';
import type { PaneSide } from '@/types/document';
import { buildDiffElementIndex, type DiffElementIndex } from '@/utils/diffElementIndex';
import { diffReviewId, diffReviewIndex, firstReviewElement, resolveReviewKind } from '@/utils/diffReview';
import { resolveSyncScrollTop, type ScrollAnchor } from '@/utils/scrollSync';
import { useLatestRef } from './useLatestRef';

type ComparisonResultIndexOptions = {
  paneA: RefObject<HTMLDivElement | null>;
  paneB: RefObject<HTMLDivElement | null>;
  total: number;
  /** Accessible name for a difference, e.g. "Difference 3: Added". */
  labelDiff?: (index: number, kind: DiffChangeKind) => string;
};

/**
 * Makes every difference reachable and announceable from the keyboard. The
 * `ins`/`del` elements are focusable and respond to Enter/Space, but their
 * native roles prohibit an author-supplied name and are not announced by most
 * screen readers, so without this a keyboard user is told nothing about what
 * they landed on and an insertion is told apart from a deletion by colour
 * alone. A group keeps the changed text itself readable, which a button's
 * label would replace.
 */
function labelDiffElements(index: DiffElementIndex, labelDiff: ComparisonResultIndexOptions['labelDiff']): void {
  for (const [id, group] of index) {
    const label = labelDiff?.(diffReviewIndex(id), resolveReviewKind(group));
    for (const element of [...group.A, ...group.B]) {
      element.tabIndex = 0;
      if (!label) continue;
      element.setAttribute('role', 'group');
      element.setAttribute('aria-label', label);
    }
  }
}

export function useComparisonResultIndex({ paneA, paneB, total, labelDiff }: ComparisonResultIndexOptions) {
  const diffIndex = useRef<DiffElementIndex>(new Map());
  const alignmentAnchors = useRef<ScrollAnchor[]>([]);
  const [items, setItems] = useState<DiffMapItem[]>([]);
  const [version, setVersion] = useState(0);
  // Read through a ref so a locale change does not change `rebuild`'s identity
  // and re-run the content-change effects that depend on it.
  const latestLabelDiff = useLatestRef(labelDiff);

  // A locale switch mid-review relabels the elements already in the index.
  useEffect(() => {
    labelDiffElements(diffIndex.current, labelDiff);
  }, [labelDiff]);

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
    labelDiffElements(nextIndex, latestLabelDiff.current);
    measure();
    setVersion((value) => value + 1);
  }, [latestLabelDiff, measure, paneA, paneB]);

  const syncPaneFrom = useCallback(
    (sourceKey: PaneSide, sourceTop?: number, behavior: ScrollBehavior = 'instant') => {
      const source = sourceKey === 'A' ? paneA.current : paneB.current;
      const target = sourceKey === 'A' ? paneB.current : paneA.current;
      if (!source || !target) return;
      const top = resolveSyncScrollTop({
        sourceKey,
        sourceTop: sourceTop ?? source.scrollTop,
        maxSourceTop: Math.max(0, source.scrollHeight - source.clientHeight),
        maxTargetTop: Math.max(0, target.scrollHeight - target.clientHeight),
        anchors: alignmentAnchors.current
      });
      // Following a scroll must land in the same frame as the source, so only a
      // navigation jump asks to glide alongside the pane it follows.
      if (behavior === 'smooth') target.scrollTo({ top, behavior });
      else target.scrollTop = top;
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
