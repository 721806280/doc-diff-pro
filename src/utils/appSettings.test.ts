import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_APP_SETTINGS,
  readSavedAppSettings,
  writeSavedAppSettings
} from './appSettings';

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

describe('appSettings', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = createFakeStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns defaults when nothing has been saved', () => {
    expect(readSavedAppSettings()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('reads and validates saved settings', () => {
    storage.setItem('doc-diff-settings', JSON.stringify({
      diffGranularity: 'word',
      ignoreSpaces: false,
      ignoreFullHalfWidth: false,
      filterLayoutNoise: true,
      syncScroll: false,
      showTableHints: true
    }));

    expect(readSavedAppSettings()).toEqual({
      diffGranularity: 'word',
      ignoreSpaces: false,
      ignoreFullHalfWidth: false,
      filterLayoutNoise: true,
      syncScroll: false,
      showTableHints: true
    });
  });

  it('falls back field-by-field for malformed saved settings', () => {
    storage.setItem('doc-diff-settings', JSON.stringify({
      diffGranularity: 'line',
      ignoreSpaces: 'nope',
      ignoreFullHalfWidth: false,
      filterLayoutNoise: null,
      syncScroll: true,
      showTableHints: 'yes'
    }));

    expect(readSavedAppSettings()).toEqual({
      diffGranularity: 'char',
      ignoreSpaces: true,
      ignoreFullHalfWidth: false,
      filterLayoutNoise: false,
      syncScroll: true,
      showTableHints: false
    });
  });

  it('writes settings when storage is available', () => {
    writeSavedAppSettings({
      diffGranularity: 'char',
      ignoreSpaces: false,
      ignoreFullHalfWidth: true,
      filterLayoutNoise: false,
      syncScroll: false,
      showTableHints: true
    });

    expect(JSON.parse(storage.getItem('doc-diff-settings') ?? 'null')).toEqual({
      diffGranularity: 'char',
      ignoreSpaces: false,
      ignoreFullHalfWidth: true,
      filterLayoutNoise: false,
      syncScroll: false,
      showTableHints: true
    });
  });

  it('returns defaults when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);

    expect(readSavedAppSettings()).toEqual(DEFAULT_APP_SETTINGS);
  });
});
