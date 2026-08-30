import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectInitialLocale, getCurrentLocale, setLocale } from './index';

describe('i18n locale selection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses configured locale before saved and browser preferences', () => {
    vi.stubGlobal('localStorage', storageWith('en'));
    vi.stubGlobal('navigator', { languages: ['en-US'] });

    expect(detectInitialLocale('zh-CN')).toBe('zh-CN');
  });

  it('uses a valid saved locale before browser preferences', () => {
    vi.stubGlobal('localStorage', storageWith('zh-CN'));
    vi.stubGlobal('navigator', { languages: ['en-US'] });

    expect(detectInitialLocale()).toBe('zh-CN');
  });

  it('normalizes browser locales and falls back to English', () => {
    vi.stubGlobal('localStorage', storageWith(null));
    vi.stubGlobal('navigator', { languages: ['fr-FR', 'zh-HK'] });
    expect(detectInitialLocale()).toBe('zh-CN');

    vi.stubGlobal('navigator', { languages: ['fr-FR'] });
    expect(detectInitialLocale()).toBe('en');
  });

  // Older browsers and some embeds expose only `navigator.language`, and a
  // locale list can carry a blank entry. Either one used to be the difference
  // between reading the reader's own language and defaulting to English.
  it('reads a single browser language and skips blank entries', () => {
    vi.stubGlobal('localStorage', storageWith(null));

    vi.stubGlobal('navigator', { language: 'zh-CN' });
    expect(detectInitialLocale()).toBe('zh-CN');

    vi.stubGlobal('navigator', { languages: [], language: 'zh-TW' });
    expect(detectInitialLocale()).toBe('zh-CN');

    vi.stubGlobal('navigator', { languages: ['  ', 'en-GB'] });
    expect(detectInitialLocale()).toBe('en');
  });

  it('defaults to English where there is no navigator at all', () => {
    vi.stubGlobal('localStorage', storageWith(null));
    vi.stubGlobal('navigator', undefined);

    expect(detectInitialLocale()).toBe('en');
  });

  it('updates reactive messages and persists the selected locale', () => {
    const storage = storageWith(null);
    vi.stubGlobal('localStorage', storage);

    setLocale('zh-CN');
    expect(getCurrentLocale()).toBe('zh-CN');
    expect(storage.setItem).toHaveBeenCalledWith('doc-diff-locale', 'zh-CN');

    storage.setItem.mockClear();
    setLocale('zh-CN');
    expect(storage.setItem).not.toHaveBeenCalled();

    setLocale('en');
  });
});

function storageWith(locale: string | null) {
  return {
    getItem: vi.fn(() => locale),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: locale ? 1 : 0
  };
}
