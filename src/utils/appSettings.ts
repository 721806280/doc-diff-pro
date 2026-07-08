import type { DiffGranularity, SimilarDiffLevel } from '@/types/diff';
import { isThemeColor, type ThemeColor } from '@/utils/themeColor';

const STORAGE_KEY = 'doc-diff-settings';
const DIFF_GRANULARITIES: readonly DiffGranularity[] = ['semantic', 'word', 'char'];
const SIMILAR_DIFF_LEVELS: readonly SimilarDiffLevel[] = ['strict', 'balanced', 'loose'];

export type AppSettings = {
  diffGranularity: DiffGranularity;
  themeColor: ThemeColor;
  ignoreSpaces: boolean;
  ignoreFullHalfWidth: boolean;
  filterLayoutNoise: boolean;
  syncScroll: boolean;
  showTableHints: boolean;
  enableDiffIgnore: boolean;
  enableSimilarDiffs: boolean;
  similarDiffLevel: SimilarDiffLevel;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  diffGranularity: 'char',
  themeColor: 'indigo',
  ignoreSpaces: true,
  ignoreFullHalfWidth: true,
  filterLayoutNoise: false,
  syncScroll: true,
  showTableHints: false,
  enableDiffIgnore: true,
  enableSimilarDiffs: true,
  similarDiffLevel: 'balanced'
};

export function readSavedAppSettings(): AppSettings {
  const storage = getStorage();
  if (!storage) return { ...DEFAULT_APP_SETTINGS };

  try {
    const rawValue = storage.getItem(STORAGE_KEY);
    if (!rawValue) return { ...DEFAULT_APP_SETTINGS };

    return normalizeAppSettings(JSON.parse(rawValue));
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function writeSavedAppSettings(settings: AppSettings): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in private browsing or locked-down embeds.
  }
}

function normalizeAppSettings(value: unknown): AppSettings {
  if (!isRecord(value)) return { ...DEFAULT_APP_SETTINGS };

  return {
    diffGranularity: isDiffGranularity(value.diffGranularity)
      ? value.diffGranularity
      : DEFAULT_APP_SETTINGS.diffGranularity,
    themeColor: isThemeColor(value.themeColor)
      ? value.themeColor
      : DEFAULT_APP_SETTINGS.themeColor,
    ignoreSpaces: typeof value.ignoreSpaces === 'boolean'
      ? value.ignoreSpaces
      : DEFAULT_APP_SETTINGS.ignoreSpaces,
    ignoreFullHalfWidth: typeof value.ignoreFullHalfWidth === 'boolean'
      ? value.ignoreFullHalfWidth
      : DEFAULT_APP_SETTINGS.ignoreFullHalfWidth,
    filterLayoutNoise: typeof value.filterLayoutNoise === 'boolean'
      ? value.filterLayoutNoise
      : DEFAULT_APP_SETTINGS.filterLayoutNoise,
    syncScroll: typeof value.syncScroll === 'boolean'
      ? value.syncScroll
      : DEFAULT_APP_SETTINGS.syncScroll,
    showTableHints: typeof value.showTableHints === 'boolean'
      ? value.showTableHints
      : DEFAULT_APP_SETTINGS.showTableHints,
    enableDiffIgnore: typeof value.enableDiffIgnore === 'boolean'
      ? value.enableDiffIgnore
      : DEFAULT_APP_SETTINGS.enableDiffIgnore,
    enableSimilarDiffs: typeof value.enableSimilarDiffs === 'boolean'
      ? value.enableSimilarDiffs
      : DEFAULT_APP_SETTINGS.enableSimilarDiffs,
    similarDiffLevel: isSimilarDiffLevel(value.similarDiffLevel)
      ? value.similarDiffLevel
      : DEFAULT_APP_SETTINGS.similarDiffLevel
  };
}

function getStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDiffGranularity(value: unknown): value is DiffGranularity {
  return typeof value === 'string' && DIFF_GRANULARITIES.includes(value as DiffGranularity);
}

function isSimilarDiffLevel(value: unknown): value is SimilarDiffLevel {
  return typeof value === 'string' && SIMILAR_DIFF_LEVELS.includes(value as SimilarDiffLevel);
}
