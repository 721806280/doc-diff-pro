import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { UserSettings } from '@/config/userSettings';
import type { I18nMessages } from '@/i18n/messages';
import { compareDocuments } from '@/services/diffEngine';
import { cancelPendingTextDiffs } from '@/services/diffWorkerClient';
import type { DiffSummary } from '@/types/diff';
import type { DocumentPair } from '@/types/document';

const EMPTY_SUMMARY: DiffSummary = {
  total: 0, inserted: 0, deleted: 0, modified: 0, similarity: 1, layoutNoiseFiltered: 0, layoutNoiseItems: []
};

type ComparisonSessionOptions = {
  documents: DocumentPair;
  i18n: I18nMessages;
  ready: boolean;
  rules: Pick<UserSettings, 'diffGranularity' | 'filterLayoutNoise' | 'ignoreFullHalfWidth' | 'ignoreSpaces'>;
  setDocuments: Dispatch<SetStateAction<DocumentPair>>;
  onClearReviewState: () => void;
  onResult: (summary: DiffSummary) => void;
  onNotice: (message: string) => void;
};

export function useComparisonSession({ documents, i18n, ready, rules, setDocuments, onClearReviewState, onResult, onNotice }: ComparisonSessionOptions) {
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DiffSummary>(EMPTY_SUMMARY);
  const compareSequence = useRef(0);

  const cancelCompare = useCallback(() => {
    compareSequence.current++;
    cancelPendingTextDiffs();
    setComparing(false);
    setError('');
  }, []);

  const runCompare = useCallback(async (nextDocuments: DocumentPair, showDoneNotice = false) => {
    if (nextDocuments.A.status !== 'ready' || nextDocuments.B.status !== 'ready') return;
    const sequence = ++compareSequence.current;
    cancelPendingTextDiffs();
    setComparing(true);
    setError('');
    onClearReviewState();
    try {
      const result = await compareDocuments(nextDocuments.A.originalHtml, nextDocuments.B.originalHtml, {
        granularity: rules.diffGranularity,
        ignoreSpaces: rules.ignoreSpaces,
        ignoreFullHalfWidth: rules.ignoreFullHalfWidth,
        filterLayoutNoise: rules.filterLayoutNoise,
        layoutNoise: { original: nextDocuments.A.layoutNoise, revised: nextDocuments.B.layoutNoise }
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
      if (sequence === compareSequence.current) setComparing(false);
    }
  }, [i18n, onClearReviewState, onNotice, onResult, rules.diffGranularity, rules.filterLayoutNoise, rules.ignoreFullHalfWidth, rules.ignoreSpaces, setDocuments]);

  const clearComparison = useCallback(() => {
    cancelCompare();
    onClearReviewState();
    setSummary(EMPTY_SUMMARY);
  }, [cancelCompare, onClearReviewState]);

  useEffect(() => () => {
    compareSequence.current++;
    cancelPendingTextDiffs();
  }, []);

  useEffect(() => {
    if (!ready || documents.A.highlightedHtml || documents.B.highlightedHtml) return;
    void runCompare(documents);
  }, [documents, ready, runCompare]);

  return { comparing, error, summary, runCompare, cancelCompare, clearComparison };
}
