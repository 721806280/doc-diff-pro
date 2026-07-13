import type { DiffGranularity, SimilarDiffLevel } from '@/types/diff';
import { isAppearanceMode, isThemeColor, type AppearanceMode, type ThemeColor } from '@/utils/themeColor';

const STORAGE_KEY = 'doc-diff-settings';
const DIFF_GRANULARITIES: readonly DiffGranularity[] = ['semantic', 'word', 'char'];
const SIMILAR_DIFF_LEVELS: readonly SimilarDiffLevel[] = ['strict', 'balanced', 'loose'];

export type UserSettings = {
  diffGranularity: DiffGranularity;
  themeColor: ThemeColor;
  appearanceMode: AppearanceMode;
  ignoreSpaces: boolean;
  ignoreFullHalfWidth: boolean;
  filterLayoutNoise: boolean;
  syncScroll: boolean;
  showReportExport: boolean;
  showTableHints: boolean;
  showDiffMap: boolean;
  enableDiffIgnore: boolean;
  enableSimilarDiffs: boolean;
  similarDiffLevel: SimilarDiffLevel;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  diffGranularity: 'char',
  themeColor: 'indigo',
  appearanceMode: 'light',
  ignoreSpaces: true,
  ignoreFullHalfWidth: true,
  filterLayoutNoise: false,
  syncScroll: true,
  showReportExport: false,
  showTableHints: false,
  showDiffMap: true,
  enableDiffIgnore: false,
  enableSimilarDiffs: true,
  similarDiffLevel: 'balanced'
};

export function readSavedUserSettings(): UserSettings {
  const storage = getStorage();
  if (!storage) return { ...DEFAULT_USER_SETTINGS };

  try {
    const rawValue = storage.getItem(STORAGE_KEY);
    if (!rawValue) return { ...DEFAULT_USER_SETTINGS };

    return normalizeUserSettings(JSON.parse(rawValue));
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function writeSavedUserSettings(settings: UserSettings): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in private browsing or locked-down embeds.
  }
}

function normalizeUserSettings(value: unknown): UserSettings {
  if (!isRecord(value)) return { ...DEFAULT_USER_SETTINGS };

  return {
    diffGranularity: isDiffGranularity(value.diffGranularity)
      ? value.diffGranularity
      : DEFAULT_USER_SETTINGS.diffGranularity,
    themeColor: isThemeColor(value.themeColor)
      ? value.themeColor
      : DEFAULT_USER_SETTINGS.themeColor,
    appearanceMode: isAppearanceMode(value.appearanceMode)
      ? value.appearanceMode
      : DEFAULT_USER_SETTINGS.appearanceMode,
    ignoreSpaces: typeof value.ignoreSpaces === 'boolean'
      ? value.ignoreSpaces
      : DEFAULT_USER_SETTINGS.ignoreSpaces,
    ignoreFullHalfWidth: typeof value.ignoreFullHalfWidth === 'boolean'
      ? value.ignoreFullHalfWidth
      : DEFAULT_USER_SETTINGS.ignoreFullHalfWidth,
    filterLayoutNoise: typeof value.filterLayoutNoise === 'boolean'
      ? value.filterLayoutNoise
      : DEFAULT_USER_SETTINGS.filterLayoutNoise,
    syncScroll: typeof value.syncScroll === 'boolean'
      ? value.syncScroll
      : DEFAULT_USER_SETTINGS.syncScroll,
    showReportExport: typeof value.showReportExport === 'boolean'
      ? value.showReportExport
      : DEFAULT_USER_SETTINGS.showReportExport,
    showTableHints: typeof value.showTableHints === 'boolean'
      ? value.showTableHints
      : DEFAULT_USER_SETTINGS.showTableHints,
    showDiffMap: typeof value.showDiffMap === 'boolean'
      ? value.showDiffMap
      : DEFAULT_USER_SETTINGS.showDiffMap,
    enableDiffIgnore: typeof value.enableDiffIgnore === 'boolean'
      ? value.enableDiffIgnore
      : DEFAULT_USER_SETTINGS.enableDiffIgnore,
    enableSimilarDiffs: typeof value.enableSimilarDiffs === 'boolean'
      ? value.enableSimilarDiffs
      : DEFAULT_USER_SETTINGS.enableSimilarDiffs,
    similarDiffLevel: isSimilarDiffLevel(value.similarDiffLevel)
      ? value.similarDiffLevel
      : DEFAULT_USER_SETTINGS.similarDiffLevel
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
