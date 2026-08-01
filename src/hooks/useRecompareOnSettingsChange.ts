import { useEffect, useRef } from 'react';
import type { UserSettings } from '@/config/userSettings';
import type { DocumentPair } from '@/types/document';
import { useLatestRef } from './useLatestRef';

type ComparisonRules = Pick<
  UserSettings,
  'diffGranularity' | 'filterLayoutNoise' | 'ignoreFullHalfWidth' | 'ignoreSpaces'
>;

type RecompareOnSettingsChangeOptions = {
  documents: DocumentPair;
  ready: boolean;
  rules: ComparisonRules;
  notice: string;
  onCompare: (documents: DocumentPair, showDoneNotice: boolean) => Promise<void>;
  onNotice: (notice: string) => void;
};

export function useRecompareOnSettingsChange({
  documents,
  ready,
  rules,
  notice,
  onCompare,
  onNotice
}: RecompareOnSettingsChangeOptions): void {
  const { diffGranularity, filterLayoutNoise, ignoreFullHalfWidth, ignoreSpaces } = rules;
  const previousRules = useRef(rules);
  // Read at debounce-fire time, so the newest values are used without
  // restarting the timer whenever a document or callback identity changes.
  const latestDocuments = useLatestRef(documents);
  const latestCompare = useLatestRef(onCompare);
  const latestNotice = useLatestRef(notice);
  const latestOnNotice = useLatestRef(onNotice);

  useEffect(() => {
    const currentRules = { diffGranularity, filterLayoutNoise, ignoreFullHalfWidth, ignoreSpaces };
    const changed = !sameRules(previousRules.current, currentRules);
    previousRules.current = currentRules;
    if (!changed || !ready) return;

    latestOnNotice.current(latestNotice.current);
    const timer = window.setTimeout(() => {
      void latestCompare.current(latestDocuments.current, true);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [
    diffGranularity,
    filterLayoutNoise,
    ignoreFullHalfWidth,
    ignoreSpaces,
    latestCompare,
    latestDocuments,
    latestNotice,
    latestOnNotice,
    ready
  ]);
}

function sameRules(left: ComparisonRules, right: ComparisonRules): boolean {
  return (
    left.diffGranularity === right.diffGranularity &&
    left.filterLayoutNoise === right.filterLayoutNoise &&
    left.ignoreFullHalfWidth === right.ignoreFullHalfWidth &&
    left.ignoreSpaces === right.ignoreSpaces
  );
}
