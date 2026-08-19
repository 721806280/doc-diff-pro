import type { KeyboardEvent } from 'react';
import type { I18nMessages } from '@/i18n/messages';
import type { DiffMapItem } from '@/types/diff';

/**
 * The marker the given key moves to, or `null` when the key is not a
 * navigation key. Positions are offsets into `items`, not difference numbers.
 */
function nextMarker(key: string, position: number, total: number): number | null {
  switch (key) {
    case 'ArrowUp':
    case 'ArrowLeft':
      return Math.max(0, position - 1);
    case 'ArrowDown':
    case 'ArrowRight':
      return Math.min(total - 1, position + 1);
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return null;
  }
}

export default function DiffMap({
  items,
  currentIndex,
  ignoredIndices,
  collapsed,
  i18n,
  onSelect
}: {
  items: DiffMapItem[];
  currentIndex: number;
  ignoredIndices: ReadonlySet<number>;
  collapsed: boolean;
  i18n: I18nMessages;
  onSelect: (index: number) => void;
}) {
  if (!items.length) return null;

  // Roving tabindex: the active marker is the tab stop, falling back to the
  // first one so the map is still reachable before a difference is selected.
  const activePosition = items.findIndex((item) => item.index === currentIndex);
  const tabStop = activePosition === -1 ? 0 : activePosition;

  const navigate = (event: KeyboardEvent<HTMLButtonElement>, position: number) => {
    const target = nextMarker(event.key, position, items.length);
    if (target === null || target === position) return;
    const item = items[target];
    if (!item) return;
    event.preventDefault();
    onSelect(item.index);
    // The buttons are keyed by difference number, so the node already exists
    // and survives the re-render this selection triggers.
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-diff-index="${item.index}"]`)?.focus();
  };

  return (
    <div
      className={`diff-map ${collapsed ? 'is-collapsed' : ''}`}
      role="toolbar"
      aria-orientation="vertical"
      aria-label={i18n.diffNavigator.diffMapLabel}
    >
      {!collapsed &&
        items.map((item, position) => {
          const label = i18n.diffNavigator.diffMapItem(item.index, i18n.diffNavigator.ignoredDiffKind[item.kind]);
          return (
            <button
              key={item.index}
              type="button"
              data-diff-index={item.index}
              tabIndex={position === tabStop ? 0 : -1}
              className={`diff-map__marker is-${item.kind} ${item.index === currentIndex ? 'is-active' : ''} ${ignoredIndices.has(item.index) ? 'is-ignored' : ''}`}
              style={{ top: `${item.position}%` }}
              title={label}
              aria-label={label}
              aria-current={item.index === currentIndex ? 'true' : undefined}
              onClick={() => onSelect(item.index)}
              onKeyDown={(event) => navigate(event, position)}
            >
              <span aria-hidden="true" />
            </button>
          );
        })}
    </div>
  );
}
