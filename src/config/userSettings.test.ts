import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_USER_SETTINGS,
  readSavedUserSettings,
  writeSavedUserSettings
} from './userSettings';

type FakeStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  clear(): void;
};

function createFakeStorage(): FakeStorage {
  const data = new Map<string, string>();

  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    clear() {
      data.clear();
    }
  };
}

describe('userSettings', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = createFakeStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns defaults when nothing has been saved', () => {
    expect(readSavedUserSettings()).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('reads and validates saved settings', () => {
    storage.setItem('doc-diff-settings', JSON.stringify({
      diffGranularity: 'word',
      themeColor: 'teal',
      appearanceMode: 'dark',
      ignoreSpaces: false,
      ignoreFullHalfWidth: false,
      filterLayoutNoise: true,
      syncScroll: false,
      showReportExport: true,
      showTableHints: true,
      showDiffMap: false,
      enableDiffIgnore: false,
      enableSimilarDiffs: false,
      similarDiffLevel: 'strict'
    }));

    expect(readSavedUserSettings()).toEqual({
      diffGranularity: 'word',
      themeColor: 'teal',
      appearanceMode: 'dark',
      ignoreSpaces: false,
      ignoreFullHalfWidth: false,
      filterLayoutNoise: true,
      syncScroll: false,
      showReportExport: true,
      showTableHints: true,
      showDiffMap: false,
      enableDiffIgnore: false,
      enableSimilarDiffs: false,
      similarDiffLevel: 'strict'
    });
  });

  it('falls back field-by-field for malformed saved settings', () => {
    storage.setItem('doc-diff-settings', JSON.stringify({
      diffGranularity: 'line',
      themeColor: 'purple',
      appearanceMode: 'midnight',
      ignoreSpaces: 'nope',
      ignoreFullHalfWidth: false,
      filterLayoutNoise: null,
      syncScroll: true,
      showReportExport: 'yes',
      showTableHints: 'yes',
      showDiffMap: 'yes',
      enableDiffIgnore: 'sure',
      enableSimilarDiffs: 1,
      similarDiffLevel: 'wide'
    }));

    expect(readSavedUserSettings()).toEqual({
      diffGranularity: 'char',
      themeColor: 'indigo',
      appearanceMode: 'light',
      ignoreSpaces: true,
      ignoreFullHalfWidth: false,
      filterLayoutNoise: false,
      syncScroll: true,
      showReportExport: false,
      showTableHints: false,
      showDiffMap: true,
      enableDiffIgnore: false,
      enableSimilarDiffs: true,
      similarDiffLevel: 'balanced'
    });
  });

  it('writes settings when storage is available', () => {
    writeSavedUserSettings({
      diffGranularity: 'char',
      themeColor: 'rose',
      appearanceMode: 'dark',
      ignoreSpaces: false,
      ignoreFullHalfWidth: true,
      filterLayoutNoise: false,
      syncScroll: false,
      showReportExport: true,
      showTableHints: true,
      showDiffMap: false,
      enableDiffIgnore: true,
      enableSimilarDiffs: false,
      similarDiffLevel: 'loose'
    });

    expect(JSON.parse(storage.getItem('doc-diff-settings') ?? 'null')).toEqual({
      diffGranularity: 'char',
      themeColor: 'rose',
      appearanceMode: 'dark',
      ignoreSpaces: false,
      ignoreFullHalfWidth: true,
      filterLayoutNoise: false,
      syncScroll: false,
      showReportExport: true,
      showTableHints: true,
      showDiffMap: false,
      enableDiffIgnore: true,
      enableSimilarDiffs: false,
      similarDiffLevel: 'loose'
    });
  });

  it('returns defaults when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);

    expect(readSavedUserSettings()).toEqual(DEFAULT_USER_SETTINGS);
  });
});
