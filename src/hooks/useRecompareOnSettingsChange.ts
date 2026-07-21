import { useEffect, useRef } from 'react';
import type { UserSettings } from '@/config/userSettings';
import type { DocumentPair } from '@/types/document';

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
  const latestDocuments = useRef(documents);
  const latestCompare = useRef(onCompare);
  const latestNotice = useRef(notice);
  const latestOnNotice = useRef(onNotice);

  latestDocuments.current = documents;
  latestCompare.current = onCompare;
  latestNotice.current = notice;
  latestOnNotice.current = onNotice;

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
  }, [diffGranularity, filterLayoutNoise, ignoreFullHalfWidth, ignoreSpaces, ready]);
}

function sameRules(left: ComparisonRules, right: ComparisonRules): boolean {
  return left.diffGranularity === right.diffGranularity
    && left.filterLayoutNoise === right.filterLayoutNoise
    && left.ignoreFullHalfWidth === right.ignoreFullHalfWidth
    && left.ignoreSpaces === right.ignoreSpaces;
}
