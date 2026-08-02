import { useCallback, useRef, useState, type RefObject } from 'react';
import type { DiffTableContextHint } from '@/types/diff';
import type { DiffElementGroup, DiffElementIndex } from '@/utils/diffElementIndex';
import { resolveTableStructureHint } from '@/utils/tableStructureHint';
import { useTimeoutRef } from './useTimeoutRef';

const HINT_VISIBLE_MS = 3000;

type TableStructureHintOptions = {
  enabled: boolean;
  ignoreSpaces: boolean;
  ignoreFullHalfWidth: boolean;
  diffIndex: RefObject<DiffElementIndex>;
  paneA: RefObject<HTMLDivElement | null>;
  paneB: RefObject<HTMLDivElement | null>;
};

/**
 * Owns the table-structure hint: resolving it for the focused difference,
 * marking the rows it refers to, and auto-dismissing the tip.
 *
 * The DOM markers live outside React because they decorate the diff elements
 * rendered from parsed DOCX markup, so they are added and cleared explicitly
 * rather than through render output.
 */
export function useTableStructureHint({
  enabled,
  ignoreSpaces,
  ignoreFullHalfWidth,
  diffIndex,
  paneA,
  paneB
}: TableStructureHintOptions) {
  const [hint, setHint] = useState<DiffTableContextHint | null>(null);
  const [open, setOpen] = useState(false);
  const dismissTimer = useTimeoutRef();
  const resolvedForIndex = useRef<number | null>(null);

  const clearMarkers = useCallback(() => {
    diffIndex.current.forEach((group) =>
      [...group.A, ...group.B].forEach((element) => {
        element.classList.remove('table-structure-diff');
        delete element.dataset.tableHint;
      })
    );
  }, [diffIndex]);

  const reset = useCallback(() => {
    clearMarkers();
    dismissTimer.clear();
    resolvedForIndex.current = null;
    setHint(null);
    setOpen(false);
  }, [clearMarkers, dismissTimer]);

  /**
   * Resolves and marks the hint for a focused group.
   *
   * Only a move to a different difference closes an open tip. Re-resolving the
   * same difference must leave `open` alone: showing the tip changes the layout,
   * which trips the pane ResizeObserver, rebuilds the diff index and re-runs
   * focusDiff — so a blanket reset here would close the tip the instant it
   * opened.
   */
  const resolveFor = useCallback(
    (index: number, group: DiffElementGroup) => {
      if (resolvedForIndex.current !== index) {
        resolvedForIndex.current = index;
        dismissTimer.clear();
        setOpen(false);
      }
      setHint(null);
      if (!enabled) return;

      const resolution = resolveTableStructureHint(paneA.current, paneB.current, group.A, group.B, {
        ignoreSpaces,
        ignoreFullHalfWidth
      });
      if (!resolution) return;

      const rows = new Set([...resolution.contextRows, ...resolution.candidateRows]);
      [...group.A, ...group.B].forEach((element) => {
        const row = element.closest<HTMLElement>('tr');
        if (row && rows.has(row)) {
          element.classList.add('table-structure-diff');
          element.dataset.tableHint = 'true';
        }
      });
      setHint(resolution.hint);
    },
    [dismissTimer, enabled, ignoreFullHalfWidth, ignoreSpaces, paneA, paneB]
  );

  const show = useCallback(() => {
    if (!enabled) return;
    setOpen(true);
    dismissTimer.set(() => setOpen(false), HINT_VISIBLE_MS);
  }, [dismissTimer, enabled]);

  const hide = useCallback(() => {
    dismissTimer.clear();
    setOpen(false);
  }, [dismissTimer]);

  /** Keeps the tip on screen while the pointer rests on it. */
  const holdOpen = useCallback(() => dismissTimer.clear(), [dismissTimer]);

  return { hint, open, clearMarkers, reset, resolveFor, show, hide, holdOpen };
}
