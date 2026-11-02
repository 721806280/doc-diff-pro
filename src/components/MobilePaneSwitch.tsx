import { memo } from 'react';
import type { I18nMessages } from '@/i18n/messages';
import { handleRadioGroupKeyDown } from '@/utils/radioGroup';

type Pane = 'A' | 'B';

const PANES: readonly Pane[] = ['A', 'B'];

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
  return (
    <div
      className="mobile-pane-switch"
      role="radiogroup"
      tabIndex={-1}
      aria-label={i18n.documentPane.mobileViewLabel}
      onKeyDown={handleRadioGroupKeyDown}
    >
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
        >
          <span aria-hidden="true" />
          {pane === 'A' ? i18n.documentPane.mobileOriginal : i18n.documentPane.mobileRevised}
        </button>
      ))}
    </div>
  );
});
