import { useCallback, useEffect, useRef, useState } from 'react';
import AppHeader from '@/components/AppHeader';
import CompareToast from '@/components/CompareToast';
import DiffActionPopover from '@/components/DiffActionPopover';
import DiffMap from '@/components/DiffMap';
import DiffNavigator from '@/components/DiffNavigator';
import DocumentPane from '@/components/DocumentPane';
import MobilePaneSwitch from '@/components/MobilePaneSwitch';
import { SimilarDiffModal } from '@/components/ReviewModals';
import TableHintTip from '@/components/TableHintTip';
import { deploymentConfig } from '@/config/deploymentConfig';
import { readSavedUserSettings, type UserSettings, writeSavedUserSettings } from '@/config/userSettings';
import { useI18n } from '@/i18n';
import { useComparisonSession } from '@/hooks/useComparisonSession';
import { useAnimationFrameRef } from '@/hooks/useAnimationFrameRef';
import { useAutoClearNotice } from '@/hooks/useAutoClearNotice';
import { useComparisonResultIndex } from '@/hooks/useComparisonResultIndex';
import { useComparisonLayout } from '@/hooks/useComparisonLayout';
import { useDiffActionPosition } from '@/hooks/useDiffActionPosition';
import { useDocumentSession } from '@/hooks/useDocumentSession';
import { useBindLatest, useLatestRef } from '@/hooks/useLatestRef';
import { useRecompareOnSettingsChange } from '@/hooks/useRecompareOnSettingsChange';
import { useReviewShortcuts } from '@/hooks/useReviewShortcuts';
import { useReviewSummary } from '@/hooks/useReviewSummary';
import { useReviewActions } from '@/hooks/useReviewActions';
import { useTableStructureHint } from '@/hooks/useTableStructureHint';
import { useTimeoutRef } from '@/hooks/useTimeoutRef';
import { exportComparisonReport } from '@/services/exportComparisonReport';
import type { DiffSummary, IgnoredDiffItem } from '@/types/diff';
import type { PaneSide } from '@/types/document';
import { DIFF_ELEMENT_SELECTOR } from '@/utils/diffElementIndex';
import {
  clearReviewClass,
  diffReviewId,
  diffReviewIndex,
  findActiveReviewIndex,
  firstReviewElement,
  setReviewClass
} from '@/utils/diffReview';
import { applyThemeVariables, clearThemeVariables, getThemeStyle } from '@/utils/themeColor';

type Side = PaneSide;

/** Fraction of the viewport height kept above a focused difference. */
const FOCUS_VIEWPORT_OFFSET = 0.28;

function elementScrollTop(container: HTMLElement, element: HTMLElement): number {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  return elementRect.top - containerRect.top + container.scrollTop;
}

function alignElement(container: HTMLElement, element: HTMLElement, behavior: ScrollBehavior): number {
  const top = elementScrollTop(container, element)
    - (container.clientHeight * FOCUS_VIEWPORT_OFFSET)
    + (element.offsetHeight / 2);
  container.scrollTo({ top, behavior });
  return top;
}

export default function App() {
  const { locale, messages: i18n } = useI18n();
  const [settings, setSettings] = useState<UserSettings>(readSavedUserSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [currentDiff, setCurrentDiff] = useState(0);
  const [mobilePane, setMobilePane] = useState<Side>('A');
  const [ignoredDiffs, setIgnoredDiffs] = useState<Map<string, IgnoredDiffItem>>(new Map());
  const [similarOpen, setSimilarOpen] = useState(false);
  const settingsResetNotice = useTimeoutRef();
  const syncReleaseFrame = useAnimationFrameRef();
  const mobilePaneFrame = useAnimationFrameRef();
  const paneA = useRef<HTMLDivElement>(null);
  const paneB = useRef<HTMLDivElement>(null);
  const syncInProgress = useRef(false);
  const activeDriver = useRef<Side | null>(null);
  const preferredDiffActionElement = useRef<HTMLElement | null>(null);
  const latestCurrentDiff = useLatestRef(currentDiff);

  // These three hold collaborators that are created further down: the hooks
  // below depend on each other's output, so one side takes a ref up front and
  // binds it with useBindLatest once the other side exists.
  const clearDiffActionPositionRef = useRef<() => void>(() => undefined);
  const comparisonClearRef = useRef<() => void>(() => undefined);
  const resetTableHintRef = useRef<() => void>(() => undefined);

  const {
    diffGranularity: granularity,
    themeColor,
    appearanceMode: appearance,
    ignoreSpaces,
    ignoreFullHalfWidth: ignoreWidth,
    filterLayoutNoise: filterLayout,
    syncScroll,
    showReportExport,
    showTableHints,
    showDiffMap,
    enableDiffIgnore,
    enableSimilarDiffs,
    similarDiffLevel
  } = settings;

  const allowsLocalInput = deploymentConfig.documentInput === 'local';

  const clearReviewState = useCallback(() => {
    setIgnoredDiffs(new Map());
    setSimilarOpen(false);
    preferredDiffActionElement.current = null;
    resetTableHintRef.current();
    clearDiffActionPositionRef.current();
  }, []);

  const scheduleSyncRelease = useCallback(() => {
    syncReleaseFrame.schedule(() => {
      syncInProgress.current = false;
    });
  }, [syncReleaseFrame]);

  useEffect(() => {
    document.title = i18n.app.documentTitle;
    document.documentElement.lang = locale;
  }, [i18n, locale]);

  useEffect(() => {
    applyThemeVariables(document.documentElement.style, themeColor, appearance);
    return () => clearThemeVariables(document.documentElement.style);
  }, [appearance, themeColor]);

  useEffect(() => {
    writeSavedUserSettings(settings);
  }, [settings]);

  const onBeforeDocumentChange = useCallback(() => {
    comparisonClearRef.current();
  }, []);

  const {
    documents,
    setDocuments,
    hasDocuments,
    ready,
    loadingSample,
    handleFile,
    loadSamples,
    resetDocuments,
    swapDocuments
  } = useDocumentSession({
    allowLocalInput: allowsLocalInput,
    i18n,
    maxSizeMb: deploymentConfig.maxDocxSizeMb,
    onBeforeDocumentChange,
    onNotice: setNotice
  });

  const handleComparisonResult = useCallback((result: DiffSummary) => {
    setCurrentDiff(result.total ? 1 : 0);
    setMobilePane('A');
  }, []);

  const {
    comparing,
    error,
    summary,
    runCompare,
    clearComparison
  } = useComparisonSession({
    documents,
    i18n,
    ready,
    rules: { diffGranularity: granularity, filterLayoutNoise: filterLayout, ignoreFullHalfWidth: ignoreWidth, ignoreSpaces },
    setDocuments,
    onClearReviewState: clearReviewState,
    onResult: handleComparisonResult,
    onNotice: setNotice
  });
  const hasComparisonResult = documents.A.highlightedHtml.length > 0 && documents.B.highlightedHtml.length > 0;
  const { diffIndex, items: diffMapItems, version: indexVersion, rebuild: rebuildResultIndex, syncPaneFrom, clear: clearResultIndex } = useComparisonResultIndex({ paneA, paneB, total: summary.total });
  const {
    position: diffActionPosition,
    schedule: scheduleDiffActionUpdate,
    clear: clearDiffActionPosition
  } = useDiffActionPosition({
    currentDiff,
    enabled: enableDiffIgnore,
    hasComparisonResult,
    indexVersion,
    mobilePane,
    settingsOpen,
    diffIndex,
    preferredElement: preferredDiffActionElement
  });
  const {
    hint: tableHint,
    open: tableHintOpen,
    clearMarkers: clearTableHintMarkers,
    reset: resetTableHint,
    resolveFor: resolveTableHintFor,
    show: showTableHint,
    hide: hideTableHint,
    holdOpen: holdTableHintOpen
  } = useTableStructureHint({
    enabled: showTableHints,
    ignoreSpaces,
    ignoreFullHalfWidth: ignoreWidth,
    diffIndex,
    paneA,
    paneB
  });

  const comparisonClear = useCallback(() => {
    clearResultIndex();
    activeDriver.current = null;
    clearComparison();
    setCurrentDiff(0);
    setMobilePane('A');
  }, [clearComparison, clearResultIndex]);

  useBindLatest(clearDiffActionPositionRef, clearDiffActionPosition);
  useBindLatest(comparisonClearRef, comparisonClear);
  useBindLatest(resetTableHintRef, resetTableHint);

  const clearNotice = useCallback(() => setNotice(''), []);
  useAutoClearNotice(notice, comparing, clearNotice);

  const { ignoredDiffIds, ignoredList, ignoredIndices, activeCount, activePosition, currentReviewItem, similarItems } = useReviewSummary({
    summary,
    currentDiff,
    ignoredDiffs,
    diffIndex,
    indexVersion,
    enableDiffIgnore,
    enableSimilarDiffs,
    similarDiffLevel
  });

  useRecompareOnSettingsChange({
    documents,
    ready,
    rules: {
      diffGranularity: granularity,
      filterLayoutNoise: filterLayout,
      ignoreFullHalfWidth: ignoreWidth,
      ignoreSpaces
    },
    notice: i18n.app.notices.settingsUpdated,
    onCompare: runCompare,
    onNotice: setNotice
  });

  useComparisonLayout({
    paneA,
    paneB,
    hasComparisonResult,
    originalHtml: documents.A.highlightedHtml,
    revisedHtml: documents.B.highlightedHtml,
    rebuildResultIndex,
    scheduleDiffActionUpdate,
    syncPaneFrom,
    syncScroll,
    activeDriver,
    syncInProgress,
    scheduleSyncRelease
  });

  const focusDiff = useCallback((index: number, behavior: ScrollBehavior = 'smooth', preferredElement: HTMLElement | null = null) => {
    clearReviewClass(diffIndex.current, 'focus-diff');
    clearTableHintMarkers();
    const group = diffIndex.current.get(diffReviewId(index));
    preferredDiffActionElement.current = preferredElement;
    clearDiffActionPosition();
    if (!group) return;
    setReviewClass(group, 'focus-diff', true);
    const targetA = firstReviewElement(group, 'A');
    const targetB = firstReviewElement(group, 'B');
    const alignedTopA = paneA.current && targetA ? alignElement(paneA.current, targetA, behavior) : null;
    const alignedTopB = paneB.current && targetB ? alignElement(paneB.current, targetB, behavior) : null;
    activeDriver.current = null;
    resolveTableHintFor(group);
    if (targetA && targetB) return;
    if (syncScroll && alignedTopA !== null) syncPaneFrom('A', alignedTopA);
    else if (syncScroll && alignedTopB !== null) syncPaneFrom('B', alignedTopB);
  }, [clearDiffActionPosition, clearTableHintMarkers, diffIndex, resolveTableHintFor, syncPaneFrom, syncScroll]);

  useEffect(() => {
    const index = latestCurrentDiff.current;
    if (hasComparisonResult && index > 0 && indexVersion > 0) {
      focusDiff(index, 'auto', preferredDiffActionElement.current);
    }
  }, [focusDiff, hasComparisonResult, indexVersion, latestCurrentDiff]);

  useEffect(() => {
    if (!hasComparisonResult || indexVersion === 0) return;
    ignoredDiffIds.forEach((id) => setReviewClass(diffIndex.current.get(id), 'ignored-diff', true));
  }, [diffIndex, hasComparisonResult, ignoredDiffIds, indexVersion]);

  const closeSimilarDiffs = useCallback(() => setSimilarOpen(false), []);
  const clearNoActiveDiff = useCallback(() => {
    resetTableHint();
    preferredDiffActionElement.current = null;
    clearDiffActionPosition();
  }, [clearDiffActionPosition, resetTableHint]);
  const { locateDiff, moveDiff, ignoreDiffsById, restoreIgnored, restoreAllIgnored } = useReviewActions({
    summary,
    currentDiff,
    setCurrentDiff,
    ignoredDiffs,
    setIgnoredDiffs,
    diffIndex,
    focusDiff,
    onIgnore: closeSimilarDiffs,
    onNoActiveDiff: clearNoActiveDiff
  });

  const onDiffInteraction = useCallback((event: React.MouseEvent | React.KeyboardEvent): void => {
    if ('key' in event && event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>(DIFF_ELEMENT_SELECTOR) : null;
    const id = target?.dataset.diffId;
    if (!id) return;
    if ('key' in event) event.preventDefault();
    const index = diffReviewIndex(id);
    setCurrentDiff(index);
    focusDiff(index, 'smooth', target);
    scheduleDiffActionUpdate();
    showTableHint();
  }, [focusDiff, scheduleDiffActionUpdate, showTableHint]);

  const onPaneScroll = useCallback((side: Side): void => {
    scheduleDiffActionUpdate();
    if (!syncScroll || syncInProgress.current || !hasComparisonResult || activeDriver.current !== side) return;
    syncInProgress.current = true;
    syncPaneFrom(side);
    scheduleSyncRelease();
  }, [hasComparisonResult, scheduleDiffActionUpdate, scheduleSyncRelease, syncPaneFrom, syncScroll]);

  const onPaneActivate = useCallback((side: Side): void => {
    activeDriver.current = side;
  }, []);

  useReviewShortcuts({
    enabled: !settingsOpen && !similarOpen,
    canIgnore: enableDiffIgnore && currentDiff > 0,
    onPrevious: () => moveDiff(-1),
    onNext: () => moveDiff(1),
    onToggleIgnore: () => {
      const id = diffReviewId(currentDiff);
      if (ignoredDiffIds.has(id)) restoreIgnored(id);
      else ignoreDiffsById([id]);
    }
  });

  const changeMobilePane = useCallback((side: Side): void => {
    setMobilePane(side);
    activeDriver.current = side;
    mobilePaneFrame.schedule(() => {
      if (latestCurrentDiff.current > 0) focusDiff(latestCurrentDiff.current, 'auto');
    });
  }, [focusDiff, latestCurrentDiff, mobilePaneFrame]);

  // Deferred so the notice lands after the settings panel has finished
  // applying the reset, which itself sets a notice.
  const announceSettingsReset = useCallback((): void => {
    settingsResetNotice.set(() => setNotice(i18n.app.notices.settingsReset), 0);
  }, [i18n, settingsResetNotice]);

  const exportReport = useCallback((): void => {
    exportComparisonReport({
      locale,
      i18n,
      documents,
      settings,
      summary,
      ignoredDiffs,
      diffIndex: diffIndex.current
    });
    setNotice(i18n.reviewReport.exportedNotice);
  }, [diffIndex, documents, i18n, ignoredDiffs, locale, settings, summary]);

  const previousAvailable = findActiveReviewIndex(currentDiff - 1, -1, summary.total, ignoredDiffIds) !== null;
  const nextAvailable = findActiveReviewIndex(currentDiff + 1, 1, summary.total, ignoredDiffIds) !== null;
  const themeStyle = getThemeStyle(themeColor, appearance) as React.CSSProperties;

  const changeSettings = useCallback((nextSettings: UserSettings): void => {
    const disablesDiffIgnore = settings.enableDiffIgnore && !nextSettings.enableDiffIgnore;
    setSettings(nextSettings);
    if (!disablesDiffIgnore) return;
    clearReviewClass(diffIndex.current, 'ignored-diff');
    setIgnoredDiffs(new Map());
    setSimilarOpen(false);
    clearDiffActionPosition();
    if (!currentDiff && summary.total) locateDiff(1, 'auto');
  }, [clearDiffActionPosition, currentDiff, diffIndex, locateDiff, settings.enableDiffIgnore, summary.total]);

  return (
    <div className="app-container" style={themeStyle}>
      {deploymentConfig.showHeader && (
        <AppHeader
          canSwapDocuments={ready && !comparing}
          canResetDocuments={hasDocuments}
          showGithubLink={deploymentConfig.showGithubLink}
          settings={settings}
          onSettingsChange={changeSettings}
          onSwapDocuments={swapDocuments}
          onResetDocuments={resetDocuments}
          onSettingsReset={announceSettingsReset}
          onSettingsOpenChange={setSettingsOpen}
        />
      )}

      {!hasDocuments && deploymentConfig.showSampleDocuments && <div className="local-processing-strip"><span className="local-processing-strip__status"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l7 3v5c0 4.6-2.8 8.1-7 10-4.2-1.9-7-5.4-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>{i18n.app.localProcessingNotice}</span><button type="button" disabled={loadingSample} onClick={() => void loadSamples()}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></svg>{loadingSample ? i18n.app.loadingSample : i18n.app.loadSample}</button></div>}
      <CompareToast message={notice} comparing={comparing} />
      {error && <div className="app-error-banner" role="alert"><span>{error}</span><button onClick={() => void runCompare(documents, true)}>{i18n.app.retryCompare}</button></div>}

      {hasComparisonResult && <DiffNavigator summary={summary} activeDiffCount={activeCount} activeDiffIndex={activePosition} ignoredDiffs={ignoredList} canPrevious={previousAvailable} canNext={nextAvailable} canExportReport={showReportExport} onPrevious={() => moveDiff(-1)} onNext={() => moveDiff(1)} onLocateIgnored={(id) => locateDiff(diffReviewIndex(id))} onRestoreIgnored={restoreIgnored} onRestoreAllIgnored={restoreAllIgnored} onExportReport={exportReport} />}

      {hasComparisonResult && <MobilePaneSwitch activePane={mobilePane} i18n={i18n} onChange={changeMobilePane} />}

      <main className={`workspace-container ${hasComparisonResult ? 'workspace-container--result' : ''}`}>
        <DocumentPane side="A" document={documents.A} active={!hasComparisonResult || mobilePane === 'A'} hasResult={hasComparisonResult} comparing={comparing} allowFileInput={allowsLocalInput} paneRef={paneA} onFile={handleFile} onScroll={onPaneScroll} onDiffInteraction={onDiffInteraction} onActivate={onPaneActivate} />
        <DiffMap items={diffMapItems} currentIndex={currentDiff} ignoredIndices={ignoredIndices} collapsed={!showDiffMap} i18n={i18n} onSelect={locateDiff} />
        <DocumentPane side="B" document={documents.B} active={!hasComparisonResult || mobilePane === 'B'} hasResult={hasComparisonResult} comparing={comparing} allowFileInput={allowsLocalInput} paneRef={paneB} onFile={handleFile} onScroll={onPaneScroll} onDiffInteraction={onDiffInteraction} onActivate={onPaneActivate} />
      </main>

      <DiffActionPopover open={enableDiffIgnore && currentDiff > 0} position={diffActionPosition} label={`${i18n.diffNavigator.difference} #${currentDiff}`} ignored={ignoredDiffIds.has(diffReviewId(currentDiff))} similarCount={similarItems.length} i18n={i18n} onIgnore={() => ignoreDiffsById([diffReviewId(currentDiff)])} onRestore={() => restoreIgnored(diffReviewId(currentDiff))} onShowSimilar={() => setSimilarOpen(true)} />
      <SimilarDiffModal open={similarOpen} current={currentReviewItem} items={similarItems} onClose={() => setSimilarOpen(false)} onLocate={(id) => { setSimilarOpen(false); locateDiff(diffReviewIndex(id)); }} onIgnore={ignoreDiffsById} />
      <TableHintTip hint={tableHint} open={tableHintOpen} i18n={i18n} onHoldOpen={holdTableHintOpen} onDismiss={hideTableHint} />
    </div>
  );
}
