import { describe, expect, it, vi } from 'vitest';
import { getLocalStorage, readJson, readString, writeJson, writeString } from './storage';

/**
 * Storage that throws on every access, which is what a browser in private mode
 * or a locked-down embed does — the object exists, so feature detection passes,
 * and the failure only shows up on use. Preferences are a convenience: losing
 * them has to be silent, never an error the reader sees.
 */
function hostileStorage(): Storage {
  const reject = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return { getItem: reject, setItem: reject, removeItem: reject, clear: reject, key: reject, length: 0 };
}

describe('storage', () => {
  it('reports no storage when the browser exposes none', () => {
    vi.stubGlobal('localStorage', undefined);

    expect(getLocalStorage()).toBeNull();

    vi.unstubAllGlobals();
  });

  it('hands back the browser store when there is one', () => {
    expect(getLocalStorage()).toBe(localStorage);
  });

  it('reads nothing and writes nothing without a store', () => {
    expect(readJson(null, 'key')).toBeNull();
    expect(readString(null, 'key')).toBeNull();
    expect(() => writeJson(null, 'key', { value: 1 })).not.toThrow();
    expect(() => writeString(null, 'key', 'value')).not.toThrow();
  });

  it('survives a store that throws on every access', () => {
    const storage = hostileStorage();

    expect(readJson(storage, 'key')).toBeNull();
    expect(readString(storage, 'key')).toBeNull();
    expect(() => writeJson(storage, 'key', { value: 1 })).not.toThrow();
    expect(() => writeString(storage, 'key', 'value')).not.toThrow();
  });

  it('treats a missing key and corrupted json alike', () => {
    localStorage.clear();
    localStorage.setItem('broken', '{"half":');

    expect(readJson(localStorage, 'absent')).toBeNull();
    expect(readJson(localStorage, 'broken')).toBeNull();
    expect(readString(localStorage, 'absent')).toBeNull();

    localStorage.clear();
  });

  it('round-trips a value through the store', () => {
    writeJson(localStorage, 'settings', { theme: 'indigo' });
    writeString(localStorage, 'locale', 'zh-CN');

    expect(readJson(localStorage, 'settings')).toEqual({ theme: 'indigo' });
    expect(readString(localStorage, 'locale')).toBe('zh-CN');

    localStorage.clear();
  });
});
