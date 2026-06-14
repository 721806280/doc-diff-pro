export type DiffPaneKey = 'A' | 'B';

export type DiffElementGroup = Record<DiffPaneKey, HTMLElement[]>;

export type DiffElementIndex = Map<string, DiffElementGroup>;

export const DIFF_ELEMENT_SELECTOR = 'ins[data-diff-id], del[data-diff-id]';

export function buildDiffElementIndex(
  paneA: HTMLElement | null,
  paneB: HTMLElement | null
): DiffElementIndex {
  const index: DiffElementIndex = new Map();

  indexPaneDiffElements(index, paneA, 'A');
  indexPaneDiffElements(index, paneB, 'B');
  return index;
}

function indexPaneDiffElements(
  index: DiffElementIndex,
  pane: HTMLElement | null,
  paneKey: DiffPaneKey
): void {
  if (!pane) return;

  pane.querySelectorAll<HTMLElement>(DIFF_ELEMENT_SELECTOR).forEach((element) => {
    const diffId = element.dataset.diffId;
    if (!diffId) return;

    const group = index.get(diffId) ?? { A: [], B: [] };
    group[paneKey].push(element);
    index.set(diffId, group);
  });
}
