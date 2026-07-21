import { createPortal } from 'react-dom';
import type { I18nMessages } from '@/i18n/messages';
import type { DiffActionPosition } from '@/types/diff';

export default function DiffActionPopover({ open, position, label, ignored, similarCount, i18n, onIgnore, onRestore, onShowSimilar }: { open: boolean; position: DiffActionPosition | null; label: string; ignored: boolean; similarCount: number; i18n: I18nMessages; onIgnore: () => void; onRestore: () => void; onShowSimilar: () => void }) {
  if (!open || !position) return null;
  const actionTitle = i18n.diffNavigator.shortcutTitle(ignored ? i18n.diffNavigator.unignoreHereTitle : i18n.diffNavigator.ignoreHereTitle, 'I');
  return createPortal(
    <div className={`diff-action-popover ${ignored ? 'ignored' : ''}`} style={{ top: position.top, left: position.left }}>
      <span className="diff-action-popover__rail" aria-hidden="true" />
      <span className="diff-action-popover__label"><span className="diff-action-popover__label-dot" aria-hidden="true" />{label}</span>
      <button type="button" className="diff-action-popover__button diff-action-popover__button--main" title={actionTitle} aria-label={actionTitle} aria-keyshortcuts="I" onClick={ignored ? onRestore : onIgnore}>
        <span className="diff-action-popover__icon" aria-hidden="true">
          {ignored ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12a8 8 0 0 1 13.7-5.7" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-13.7 5.7" /><path d="M4 20v-5h5" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M7 5l10 14" /></svg>}
        </span>
        <span className="diff-action-popover__button-text">{ignored ? i18n.diffNavigator.unignoreHere : i18n.diffNavigator.ignoreHere}</span>
      </button>
      {!ignored && similarCount > 0 && (
        <button type="button" className="diff-action-popover__button diff-action-popover__button--similar" title={i18n.diffNavigator.similarDiffsTitle(similarCount)} aria-label={i18n.diffNavigator.similarDiffsTitle(similarCount)} onClick={onShowSimilar}>
          <span className="diff-action-popover__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M8 8h8" /><path d="M8 16h8" /><path d="M5 5l14 14" /></svg></span>
          <span className="diff-action-popover__button-text">{i18n.diffNavigator.similarDiffsLabel}</span>
          <span className="diff-action-popover__count">{similarCount}</span>
        </button>
      )}
    </div>,
    document.body
  );
}
