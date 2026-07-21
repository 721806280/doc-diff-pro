import type { I18nMessages } from '@/i18n/messages';

export default function MobilePaneSwitch({ activePane, i18n, onChange }: { activePane: 'A' | 'B'; i18n: I18nMessages; onChange: (pane: 'A' | 'B') => void }) {
  return (
    <div className="mobile-pane-switch" role="radiogroup" aria-label={i18n.documentPane.mobileViewLabel}>
      <button type="button" role="radio" className={`mobile-pane-switch__option is-original ${activePane === 'A' ? 'active' : ''}`} aria-checked={activePane === 'A'} onClick={() => onChange('A')}><span aria-hidden="true" />{i18n.documentPane.mobileOriginal}</button>
      <button type="button" role="radio" className={`mobile-pane-switch__option is-revised ${activePane === 'B' ? 'active' : ''}`} aria-checked={activePane === 'B'} onClick={() => onChange('B')}><span aria-hidden="true" />{i18n.documentPane.mobileRevised}</button>
    </div>
  );
}
