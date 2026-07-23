import type { I18nMessages } from '@/i18n/messages';
import type { DiffMapItem } from '@/types/diff';

export default function DiffMap({ items, currentIndex, ignoredIndices, collapsed, i18n, onSelect }: { items: DiffMapItem[]; currentIndex: number; ignoredIndices: ReadonlySet<number>; collapsed: boolean; i18n: I18nMessages; onSelect: (index: number) => void }) {
  if (!items.length) return null;
  return (
    <aside className={`diff-map ${collapsed ? 'is-collapsed' : ''}`} aria-label={i18n.diffNavigator.diffMapLabel}>
      {!collapsed && items.map((item) => {
        const label = i18n.diffNavigator.diffMapItem(item.index, i18n.diffNavigator.ignoredDiffKind[item.kind]);
        return <button key={item.index} type="button" tabIndex={item.index === currentIndex ? 0 : -1} className={`diff-map__marker is-${item.kind} ${item.index === currentIndex ? 'is-active' : ''} ${ignoredIndices.has(item.index) ? 'is-ignored' : ''}`} style={{ top: `${item.position}%` }} title={label} aria-label={label} aria-current={item.index === currentIndex ? 'true' : undefined} onClick={() => onSelect(item.index)}><span aria-hidden="true" /></button>;
      })}
    </aside>
  );
}
