import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_USER_SETTINGS, type UserSettings } from '@/config/userSettings';
import { useI18n } from '@/i18n';
import { createFocusTrap } from '@/utils/focusTrap';
import {
  getThemeSwatchStyle,
  THEME_COLORS
} from '@/utils/themeColor';

export type HeaderSettings = UserSettings;

type AppHeaderProps = {
  canSwapDocuments: boolean;
  canResetDocuments: boolean;
  showGithubLink: boolean;
  settings: HeaderSettings;
  onSettingsChange: (settings: UserSettings) => void;
  onSwapDocuments: () => void;
  onResetDocuments: () => void;
  onSettingsReset: () => void;
  onSettingsOpenChange: (open: boolean) => void;
};

const GITHUB_REPOSITORY_URL = 'https://github.com/721806280/doc-diff-vision';
type SimilarOption = UserSettings['similarDiffLevel'] | 'off';
const SIMILAR_OPTIONS: SimilarOption[] = ['off', 'strict', 'balanced', 'loose'];

export default function AppHeader({
  canSwapDocuments,
  canResetDocuments,
  showGithubLink,
  settings,
  onSettingsChange,
  onSwapDocuments,
  onResetDocuments,
  onSettingsReset,
  onSettingsOpenChange
}: AppHeaderProps) {
  const { locale, messages: i18n, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [brandResetting, setBrandResetting] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const focusTrap = useMemo(createFocusTrap, []);
  const restoreFocus = useRef(true);
  const brandResetTimer = useRef<number | null>(null);

  const usingDefaults = Object.entries(DEFAULT_USER_SETTINGS).every(
    ([key, value]) => settings[key as keyof HeaderSettings] === value
  );
  const appearanceLabel = settings.appearanceMode === 'dark'
    ? i18n.header.switchToLightMode
    : i18n.header.switchToNightMode;

  useEffect(() => {
    onSettingsOpenChange(open);
    if (!open) return;
    focusTrap.activate(popoverRef.current);
    return () => {
      focusTrap.deactivate({ restoreFocus: restoreFocus.current });
      restoreFocus.current = true;
    };
  }, [focusTrap, onSettingsOpenChange, open]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (!open || !(event.target instanceof Node) || controlRef.current?.contains(event.target)) return;
      restoreFocus.current = false;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (!open) return;
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      focusTrap.handleKeydown(event);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [focusTrap, open]);

  useEffect(() => () => {
    if (brandResetTimer.current !== null) window.clearTimeout(brandResetTimer.current);
    focusTrap.deactivate({ restoreFocus: false });
  }, [focusTrap]);

  function closeSettings(shouldRestoreFocus = true): void {
    restoreFocus.current = shouldRestoreFocus;
    setOpen(false);
  }

  function resetFromBrand(): void {
    if (!canResetDocuments || brandResetTimer.current !== null) return;
    closeSettings(false);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onResetDocuments();
      return;
    }
    setBrandResetting(true);
    brandResetTimer.current = window.setTimeout(() => {
      setBrandResetting(false);
      brandResetTimer.current = null;
      onResetDocuments();
    }, 240);
  }

  function resetSettings(): void {
    if (usingDefaults) return;
    onSettingsChange({ ...DEFAULT_USER_SETTINGS });
    onSettingsReset();
  }

  function updateSetting<Key extends keyof UserSettings>(key: Key, value: UserSettings[Key]): void {
    onSettingsChange({ ...settings, [key]: value });
  }

  function setSimilarOption(value: SimilarOption): void {
    if (value === 'off') {
      updateSetting('enableSimilarDiffs', false);
      return;
    }
    onSettingsChange({ ...settings, enableSimilarDiffs: true, similarDiffLevel: value });
  }

  return (
    <header className={`app-toolbar ${open ? 'app-toolbar--settings-open' : ''}`}>
      <h1 className="visually-hidden">DocDiff Pro</h1>
      <button
        type="button"
        className={`brand-zone ${brandResetting ? 'is-resetting' : ''}`}
        disabled={!canResetDocuments}
        aria-label={canResetDocuments ? i18n.header.newComparisonTitle : 'DocDiff Pro'}
        title={canResetDocuments ? i18n.header.newComparisonTitle : undefined}
        onClick={resetFromBrand}
      >
        <span className="brand-logo-glow" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <g className="brand-logo__document brand-logo__document--accent">
              <rect className="brand-logo__page brand-logo__page--accent" x="3" y="3" width="12" height="26" rx="2" strokeWidth="1.5" />
              <path className="brand-logo__line brand-logo__line--accent" d="M6 9h6M6 13h6M6 17h5" strokeWidth="1.5" strokeLinecap="round" />
            </g>
            <g className="brand-logo__document brand-logo__document--revision">
              <rect className="brand-logo__page brand-logo__page--revision" x="17" y="3" width="12" height="26" rx="2" strokeWidth="1.5" />
              <path className="brand-logo__line brand-logo__line--revision" d="M20 9h6M20 13h6M20 17h5" strokeWidth="1.5" strokeLinecap="round" />
            </g>
            <g className="brand-logo__plus">
              <path d="M14 16h4" strokeWidth="2" strokeLinecap="round" />
              <path d="M16 14v4" strokeWidth="2" strokeLinecap="round" />
            </g>
          </svg>
        </span>
        <span className="brand-text" aria-hidden="true">
          <span className="brand-title">DocDiff <span className="badge-pro">Pro</span></span>
        </span>
      </button>

      <div ref={controlRef} className="header-actions">
        {canSwapDocuments && (
          <button type="button" className="toolbar-icon-button swap-documents-trigger" aria-label={i18n.header.swapDocumentsTitle} title={i18n.header.swapDocumentsTitle} onClick={onSwapDocuments}>
            <svg className="session-action-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M7 7h11" /><path d="M15 4l3 3-3 3" /><path d="M17 17H6" /><path d="M9 14l-3 3 3 3" />
            </svg>
          </button>
        )}

        <div className={`settings-control ${open ? 'settings-control--open' : ''}`}>
          <button
            type="button"
            className={`toolbar-icon-button settings-trigger ${open ? 'active' : ''}`}
            aria-label={i18n.header.compareSettingsAria}
            aria-expanded={open}
            aria-haspopup="dialog"
            title={i18n.header.compareSettingsAria}
            onClick={() => open ? closeSettings() : setOpen(true)}
          >
            <svg className="settings-sliders-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.05">
              <path d="M4.5 8h15" /><circle cx="9" cy="8" r="2.4" fill="var(--bg-panel-solid)" />
              <path d="M4.5 16h15" /><circle cx="15" cy="16" r="2.4" fill="var(--bg-panel-solid)" />
            </svg>
          </button>

          {open && (
            <div ref={popoverRef} className="settings-popover" role="dialog" aria-labelledby="compare-settings-title">
              <div className="settings-popover__header">
                <div className="settings-popover__title">
                  <span className="settings-popover__mark" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 4l5 5" /><path d="M13 6l5 5" /><path d="M4 20l10.5-10.5" /></svg>
                  </span>
                  <span id="compare-settings-title">{i18n.header.compareSettingsAria}</span>
                </div>
                {!usingDefaults && (
                  <button type="button" className="settings-reset-button" aria-label={i18n.header.resetSettingsTitle} title={i18n.header.resetSettingsTitle} onClick={resetSettings}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="M7.2 7.8A6.9 6.9 0 1 1 5.9 13" /><path d="M7.2 4.7v3.2H4" /><path d="M12 8.9v3.8l2.5 1.5" /></svg>
                    <span>{i18n.header.resetSettingsLabel}</span>
                  </button>
                )}
              </div>

              <fieldset className="settings-section settings-section--framed">
                <legend className="settings-section__title">{i18n.header.diffGranularityLabel}</legend>
                <div className="granularity-segmented" role="radiogroup" aria-label={i18n.header.diffGranularityLabel}>
                  {(['semantic', 'word', 'char'] as const).map((value) => (
                    <button key={value} type="button" role="radio" className={`granularity-segmented__option ${settings.diffGranularity === value ? 'active' : ''}`} aria-checked={settings.diffGranularity === value} title={i18n.header.granularityOptions[value]} onClick={() => updateSetting('diffGranularity', value)}>
                      {i18n.header.granularityCompactOptions[value]}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="settings-section settings-section--framed">
                <legend className="settings-section__title">{i18n.header.compareRulesLabel}</legend>
                <div className="settings-toggle-list settings-toggle-list--primary" aria-label={i18n.header.compareRulesLabel}>
                  <SettingsToggle label={i18n.header.ignoreSpaces} title={i18n.header.ignoreSpacesTitle} active={settings.ignoreSpaces} onClick={() => updateSetting('ignoreSpaces', !settings.ignoreSpaces)} />
                  <SettingsToggle label={i18n.header.ignoreFullHalfWidth} title={i18n.header.ignoreFullHalfWidthTitle} active={settings.ignoreFullHalfWidth} onClick={() => updateSetting('ignoreFullHalfWidth', !settings.ignoreFullHalfWidth)} />
                  <SettingsToggle label={i18n.header.filterLayoutNoise} title={i18n.header.filterLayoutNoiseTitle} active={settings.filterLayoutNoise} onClick={() => updateSetting('filterLayoutNoise', !settings.filterLayoutNoise)} />
                </div>
              </fieldset>

              <fieldset className="settings-section settings-section--framed settings-section--view">
                <legend className="settings-section__title">{i18n.header.viewOptionsLabel}</legend>
                <div className="theme-color-control" role="radiogroup" aria-label={i18n.header.themeColorLabel}>
                  <span>{i18n.header.themeColorLabel}</span>
                  <div className="theme-color-swatches">
                    {THEME_COLORS.map((option) => (
                      <button key={option} type="button" role="radio" className={`theme-color-swatch ${settings.themeColor === option ? 'active' : ''}`} style={getThemeSwatchStyle(option)} aria-checked={settings.themeColor === option} aria-label={i18n.header.themeColorOptions[option]} title={i18n.header.themeColorOptions[option]} onClick={() => updateSetting('themeColor', option)}>
                        <span className="theme-color-swatch__dot" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-toggle-list settings-toggle-list--plain" aria-label={i18n.header.viewOptionsLabel}>
                  <SettingsToggle label={i18n.header.showDiffMap} title={i18n.header.showDiffMapTitle} active={settings.showDiffMap} onClick={() => updateSetting('showDiffMap', !settings.showDiffMap)} />
                  <SettingsToggle label={i18n.header.syncScroll} title={i18n.header.syncScrollTitle} active={settings.syncScroll} onClick={() => updateSetting('syncScroll', !settings.syncScroll)} />
                  <SettingsToggle label={i18n.header.showReportExport} title={i18n.header.showReportExportTitle} active={settings.showReportExport} onClick={() => updateSetting('showReportExport', !settings.showReportExport)} />
                  <SettingsToggle label={i18n.header.showTableHints} title={i18n.header.showTableHintsTitle} active={settings.showTableHints} onClick={() => updateSetting('showTableHints', !settings.showTableHints)} />
                  <SettingsToggle label={i18n.header.enableDiffIgnore} title={i18n.header.enableDiffIgnoreTitle} active={settings.enableDiffIgnore} onClick={() => updateSetting('enableDiffIgnore', !settings.enableDiffIgnore)} />
                  {settings.enableDiffIgnore && (
                    <div className="settings-subgroup">
                      <div className="similar-level-control" role="radiogroup" aria-label={i18n.header.enableSimilarDiffs}>
                        <span>{i18n.header.enableSimilarDiffs}</span>
                        <div className="similar-level-segmented">
                          {SIMILAR_OPTIONS.map((option) => {
                            const active = option === 'off' ? !settings.enableSimilarDiffs : settings.enableSimilarDiffs && settings.similarDiffLevel === option;
                            return <button key={option} type="button" role="radio" aria-checked={active} className={active ? 'active' : ''} title={option === 'off' ? i18n.header.enableSimilarDiffsOffTitle : i18n.header.similarDiffLevelTitle[option]} onClick={() => setSimilarOption(option)}>{option === 'off' ? i18n.header.enableSimilarDiffsOff : i18n.header.similarDiffLevel[option]}</button>;
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </fieldset>
            </div>
          )}
        </div>

        <button type="button" className={`toolbar-icon-button appearance-trigger ${settings.appearanceMode === 'dark' ? 'active' : ''}`} aria-label={appearanceLabel} title={appearanceLabel} onClick={() => { closeSettings(false); updateSetting('appearanceMode', settings.appearanceMode === 'dark' ? 'light' : 'dark'); }}>
          {settings.appearanceMode === 'dark' ? (
            <svg className="appearance-icon appearance-icon--sun" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.85"><circle cx="12" cy="12" r="4.2" /><path d="M12 3.2v2.1M12 18.7v2.1M4.2 12h2.1M17.7 12h2.1M6.45 6.45l1.5 1.5M16.05 16.05l1.5 1.5M17.55 6.45l-1.5 1.5M7.95 16.05l-1.5 1.5" /></svg>
          ) : (
            <svg className="appearance-icon appearance-icon--moon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M20.45 14.65A8.2 8.2 0 0 1 9.35 3.55A8.65 8.65 0 1 0 20.45 14.65z" /></svg>
          )}
        </button>

        <button type="button" className="toolbar-icon-button language-trigger" aria-label={`${i18n.header.languageLabel}: ${locale === 'en' ? i18n.header.chinese : i18n.header.english}`} title={`${i18n.header.languageLabel}: ${locale === 'en' ? i18n.header.chinese : i18n.header.english}`} onClick={() => { closeSettings(false); setLocale(locale === 'en' ? 'zh-CN' : 'en'); }}>
          <svg className={`language-icon ${locale === 'en' ? 'is-en' : ''}`} viewBox="0 0 24 24" aria-hidden="true" fill="none"><text className="language-icon__symbol language-icon__symbol--zh" x="1.2" y="12">中</text><path className="language-icon__corner language-icon__corner--top" d="M16 4L19.5 4Q21 4 21 5.5L21 8" /><text className="language-icon__symbol language-icon__symbol--en" x="12.2" y="22">A</text><path className="language-icon__corner" d="M8 20L4.5 20Q3 20 3 18.5L3 16" /></svg>
        </button>

        {showGithubLink && (
          <a className="toolbar-icon-button github-link" href={GITHUB_REPOSITORY_URL} aria-label={i18n.header.githubLabel} title={i18n.header.githubLabel} target="_blank" rel="noreferrer" onClick={() => closeSettings(false)}>
            <svg className="github-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.85"><path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" /></svg>
          </a>
        )}
      </div>
    </header>
  );
}

function SettingsToggle({ label, title, active, onClick }: { label: string; title: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`settings-toggle ${active ? 'active' : ''}`} title={title} aria-pressed={active} onClick={onClick}>
      <span className="settings-toggle__label">{label}</span>
      <span className="settings-toggle__switch" aria-hidden="true"><span className="settings-toggle__switch-thumb" /></span>
    </button>
  );
}
