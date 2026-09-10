import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ComparisonRules } from '@/config/userSettings';
import type { I18nMessages } from '@/i18n/messages';
import { cancelPendingTextDiffs } from '@/services/diffWorkerClient';
import type { ComparisonPhase } from '@/services/diffEngine';
import { throwIfAborted } from '@/utils/comparisonScheduling';
import type { DiffSummary } from '@/types/diff';
import type { DocumentPair } from '@/types/document';
import { createEmptyImageComparisonSummary } from '@/utils/textDiffCore';

const EMPTY_SUMMARY: DiffSummary = {
  total: 0,
  inserted: 0,
  deleted: 0,
  modified: 0,
  similarity: 1,
  images: createEmptyImageComparisonSummary(),
  layoutNoiseFiltered: 0,
  layoutNoiseItems: []
};

type ComparisonSessionOptions = {
  documents: DocumentPair;
  i18n: I18nMessages;
  ready: boolean;
  rules: ComparisonRules;
  setDocuments: Dispatch<SetStateAction<DocumentPair>>;
  onClearReviewState: () => void;
  onResult: (summary: DiffSummary) => void;
  onNotice: (message: string) => void;
};

export function useComparisonSession({
  documents,
  i18n,
  ready,
  rules,
  setDocuments,
  onClearReviewState,
  onResult,
  onNotice
}: ComparisonSessionOptions) {
  const [comparing, setComparing] = useState(false);
  const [phase, setPhase] = useState<ComparisonPhase | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DiffSummary>(EMPTY_SUMMARY);
  const compareSequence = useRef(0);
  const activeCompare = useRef<AbortController | null>(null);

  const cancelCompare = useCallback(() => {
    setCancelled(activeCompare.current !== null);
    compareSequence.current++;
    activeCompare.current?.abort();
    activeCompare.current = null;
    cancelPendingTextDiffs();
    setComparing(false);
    setPhase(null);
    setError('');
  }, []);

  const runCompare = useCallback(
    async (nextDocuments: DocumentPair, showDoneNotice = false) => {
      if (nextDocuments.A.status !== 'ready' || nextDocuments.B.status !== 'ready') return;
      const sequence = ++compareSequence.current;
      // Stops the previous run at its next phase boundary. Its result was
      // going to be discarded either way; this stops it being computed.
      activeCompare.current?.abort();
      const compare = new AbortController();
      activeCompare.current = compare;
      cancelPendingTextDiffs();
      setComparing(true);
      setPhase('preparing');
      setCancelled(false);
      setError('');
      onClearReviewState();
      try {
        // The comparison engine and diff-match-patch behind it are worth a few
        // hundred kilobytes that the landing screen has no use for. By the time
        // this runs the reader has already picked and parsed two documents, so
        // the fetch overlaps work they were waiting on anyway.
        const { compareDocuments } = await import('@/services/diffEngine');
        throwIfAborted(compare.signal);
        const result = await compareDocuments(nextDocuments.A.originalHtml, nextDocuments.B.originalHtml, {
          granularity: rules.diffGranularity,
          ignoreSpaces: rules.ignoreSpaces,
          ignoreFullHalfWidth: rules.ignoreFullHalfWidth,
          filterLayoutNoise: rules.filterLayoutNoise,
          layoutNoise: { original: nextDocuments.A.layoutNoise, revised: nextDocuments.B.layoutNoise },
          images: { original: nextDocuments.A.imageDescriptors, revised: nextDocuments.B.imageDescriptors },
          imageLabel: i18n.documentPane.imageDifferenceLabel,
          unrenderableImageLabel: i18n.documentPane.unrenderableImageLabel,
          signal: compare.signal,
          onProgress: (nextPhase) => {
            if (sequence === compareSequence.current) setPhase(nextPhase);
          }
        });
        if (sequence !== compareSequence.current) return;
        setDocuments({
          A: { ...nextDocuments.A, highlightedHtml: result.originalHtml },
          B: { ...nextDocuments.B, highlightedHtml: result.revisedHtml }
        });
        setSummary(result.summary);
        onResult(result.summary);
        if (showDoneNotice) onNotice(i18n.app.notices.compareRefreshed);
        return;
      } catch (reason) {
        if (sequence !== compareSequence.current) return;
        const detail = reason instanceof Error ? reason.message : String(reason);
        setError(i18n.app.errors.compareFailed(detail));
        onNotice(i18n.app.notices.compareFailed);
      } finally {
        if (sequence === compareSequence.current) {
          activeCompare.current = null;
          setComparing(false);
          setPhase(null);
        }
      }
    },
    [
      i18n,
      onClearReviewState,
      onNotice,
      onResult,
      rules.diffGranularity,
      rules.filterLayoutNoise,
      rules.ignoreFullHalfWidth,
      rules.ignoreSpaces,
      setDocuments
    ]
  );

  const clearComparison = useCallback(() => {
    cancelCompare();
    onClearReviewState();
    setSummary(EMPTY_SUMMARY);
    setCancelled(false);
  }, [cancelCompare, onClearReviewState]);

  useEffect(
    () => () => {
      compareSequence.current++;
      activeCompare.current?.abort();
      activeCompare.current = null;
      cancelPendingTextDiffs();
    },
    []
  );

  useEffect(() => {
    if (
      !ready ||
      activeCompare.current ||
      cancelled ||
      error ||
      documents.A.highlightedHtml ||
      documents.B.highlightedHtml
    )
      return;
    void runCompare(documents);
  }, [documents, ready, runCompare, cancelled, error]);

  return { comparing, phase, cancelled, error, summary, runCompare, cancelCompare, clearComparison };
}
