import { memo, type KeyboardEvent } from 'react';
import type { I18nMessages } from '@/i18n/messages';

type Pane = 'A' | 'B';

const PANES: readonly Pane[] = ['A', 'B'];

/**
 * The pane the given key moves to, or `null` when the key is not one a radio
 * group answers to. Two options, so every arrow key means "the other one".
 */
function nextPane(key: string, activePane: Pane): Pane | null {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'ArrowRight':
    case 'ArrowDown':
      return activePane === 'A' ? 'B' : 'A';
    case 'Home':
      return 'A';
    case 'End':
      return 'B';
    default:
      return null;
  }
}

/**
 * A radio group: the checked option is the one tab stop and the arrow keys
 * move the selection, so the switch costs a keyboard user one key rather
 * than a tab through both options.
 */
export default memo(function MobilePaneSwitch({
  activePane,
  i18n,
  onChange
}: {
  activePane: Pane;
  i18n: I18nMessages;
  onChange: (pane: Pane) => void;
}) {
  const navigate = (event: KeyboardEvent<HTMLButtonElement>) => {
    const target = nextPane(event.key, activePane);
    if (target === null || target === activePane) return;
    event.preventDefault();
    onChange(target);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-pane="${target}"]`)?.focus();
  };

  return (
    <div className="mobile-pane-switch" role="radiogroup" aria-label={i18n.documentPane.mobileViewLabel}>
      {PANES.map((pane) => (
        <button
          key={pane}
          type="button"
          role="radio"
          data-pane={pane}
          tabIndex={pane === activePane ? 0 : -1}
          className={`mobile-pane-switch__option ${pane === 'A' ? 'is-original' : 'is-revised'} ${pane === activePane ? 'active' : ''}`}
          aria-checked={pane === activePane}
          onClick={() => onChange(pane)}
          onKeyDown={navigate}
        >
          <span aria-hidden="true" />
          {pane === 'A' ? i18n.documentPane.mobileOriginal : i18n.documentPane.mobileRevised}
        </button>
      ))}
    </div>
  );
});
