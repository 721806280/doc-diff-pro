import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import type { DiffSummary, IgnoredDiffItem } from '@/types/diff';
import { IgnoredDiffModal, LayoutNoiseModal } from '@/components/ReviewModals';

type DiffNavigatorProps = {
  summary: DiffSummary;
  activeDiffCount: number;
  activeDiffIndex: number;
  ignoredDiffs: IgnoredDiffItem[];
  canPrevious: boolean;
  canNext: boolean;
  canExportReport: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onLocateIgnored: (id: string) => void;
  onRestoreIgnored: (id: string) => void;
  onRestoreAllIgnored: () => void;
  onExportReport: () => void;
};

export default function DiffNavigator({ summary, activeDiffCount, activeDiffIndex, ignoredDiffs, canPrevious, canNext, canExportReport, onPrevious, onNext, onLocateIgnored, onRestoreIgnored, onRestoreAllIgnored, onExportReport }: DiffNavigatorProps) {
  const { locale, messages: i18n } = useI18n();
  const [ignoredOpen, setIgnoredOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const ignoredCount = ignoredDiffs.length;
  const progressPercent = activeDiffCount > 0 ? Math.round((activeDiffIndex / activeDiffCount) * 100) : 0;
  const similarity = new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(summary.similarity);
  const diffCountLabel = summary.total === 0
    ? i18n.diffNavigator.noDiffsTag
    : ignoredCount === 0
      ? i18n.diffNavigator.differenceCount(summary.total)
      : i18n.diffNavigator.activeDifferenceCount(activeDiffCount, summary.total);

  useEffect(() => { if (ignoredCount === 0) setIgnoredOpen(false); }, [ignoredCount]);
  useEffect(() => { if (summary.layoutNoiseFiltered === 0) setLayoutOpen(false); }, [summary.layoutNoiseFiltered]);

  return (
    <>
      <div className="floating-navigator">
        <div className="navigator-summary">
          <div className="summary-strip">
            <span className="summary-chip similarity" title={i18n.diffNavigator.similarityTitle}>{i18n.diffNavigator.similarity} <strong>{similarity}</strong></span>
            <span className={`summary-chip total ${summary.total === 0 ? 'clean' : activeDiffCount === 0 ? 'muted' : 'alert'}`}>{diffCountLabel}</span>
            {summary.total > 0 && <><span className="summary-chip modified">{i18n.diffNavigator.modified} <strong>{summary.modified}</strong></span><span className="summary-chip inserted">{i18n.diffNavigator.inserted} <strong>{summary.inserted}</strong></span><span className="summary-chip deleted">{i18n.diffNavigator.deleted} <strong>{summary.deleted}</strong></span></>}
            {summary.layoutNoiseFiltered > 0 && <button type="button" className={`summary-chip layout-noise ${layoutOpen ? 'active' : ''}`} title={i18n.diffNavigator.layoutNoiseTitle} aria-expanded={layoutOpen} onClick={() => setLayoutOpen((value) => !value)}>{i18n.diffNavigator.layoutNoiseFiltered(summary.layoutNoiseFiltered)}</button>}
            {ignoredCount > 0 && <button type="button" className={`summary-chip ignored ${ignoredOpen ? 'active' : ''}`} title={i18n.diffNavigator.ignoredDetailsTitle} aria-expanded={ignoredOpen} aria-haspopup="dialog" onClick={() => setIgnoredOpen((value) => !value)}>{i18n.diffNavigator.ignoredDiffs(ignoredCount)}</button>}
            {canExportReport && <button type="button" className="summary-chip export-report" title={i18n.reviewReport.exportTitle} aria-label={i18n.reviewReport.exportTitle} onClick={onExportReport}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v11" /><path d="M8 10l4 4 4-4" /><path d="M5 18h14" /></svg>{i18n.reviewReport.exportLabel}</button>}
          </div>
        </div>

        {summary.total > 0 && activeDiffCount > 0 ? (
          <div className="navigator-controls">
            <div className="diff-progress" role="progressbar" aria-label={i18n.diffNavigator.currentPositionAria(activeDiffIndex, activeDiffCount)} aria-valuemin={1} aria-valuemax={activeDiffCount} aria-valuenow={activeDiffIndex}>
              <div className="diff-progress-meta"><span className="diff-progress-index"><span className="diff-progress-label">{i18n.diffNavigator.difference}</span><span className="diff-progress-count">{activeDiffIndex}<span className="slash">/</span>{activeDiffCount}</span></span><strong>{progressPercent}%</strong></div>
              <div className="diff-progress-track"><div className="diff-progress-bar" style={{ width: `${progressPercent}%` }} /></div>
            </div>
            <div className="nav-triggers">
              <button className="btn-action-nav btn-action-nav--previous" title={i18n.diffNavigator.shortcutTitle(i18n.diffNavigator.previous, 'Alt+↑')} aria-keyshortcuts="Alt+ArrowUp" onClick={onPrevious} disabled={!canPrevious}><span className="btn-action-nav__icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><polyline points="15 18 9 12 15 6" /></svg></span><span className="btn-action-nav__label">{i18n.diffNavigator.previous}</span></button>
              <button className="btn-action-nav btn-action-nav--next" title={i18n.diffNavigator.shortcutTitle(i18n.diffNavigator.next, 'Alt+↓')} aria-keyshortcuts="Alt+ArrowDown" onClick={onNext} disabled={!canNext}><span className="btn-action-nav__label">{i18n.diffNavigator.next}</span><span className="btn-action-nav__icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><polyline points="9 18 15 12 9 6" /></svg></span></button>
            </div>
          </div>
        ) : summary.total > 0 ? (
          <div className="ignored-empty"><span>{i18n.diffNavigator.allDiffsIgnored}</span><button type="button" onClick={onRestoreAllIgnored}>{i18n.diffNavigator.restoreIgnored}</button></div>
        ) : null}
      </div>

      <IgnoredDiffModal open={ignoredOpen} items={ignoredDiffs} onClose={() => setIgnoredOpen(false)} onLocate={(id) => { onLocateIgnored(id); setIgnoredOpen(false); }} onRestore={onRestoreIgnored} onRestoreAll={() => { onRestoreAllIgnored(); setIgnoredOpen(false); }} />
      <LayoutNoiseModal open={layoutOpen} total={summary.layoutNoiseFiltered} items={summary.layoutNoiseItems} onClose={() => setLayoutOpen(false)} />
    </>
  );
}
