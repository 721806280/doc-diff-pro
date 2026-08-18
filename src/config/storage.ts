/**
 * Shared browser-storage helpers for locally persisted preferences.
 *
 * Every persisted entry in the app goes through these helpers so that
 * unavailable storage (private browsing, locked-down embeds) and corrupted
 * data are handled consistently, without each caller reimplementing the same
 * try/catch and feature detection.
 */

/** Returns localStorage when available, otherwise null. */
export function getLocalStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

/**
 * Reads and parses a JSON value from storage.
 * Returns `null` when storage is unavailable, the key is missing, or the
 * payload cannot be parsed (corrupted). Callers fold `null` into their own
 * defaults.
 */
export function readJson<T>(storage: Storage | null, key: string): T | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Writes a JSON-serializable value, swallowing errors when storage is unavailable or full. */
export function writeJson(storage: Storage | null, key: string, value: unknown): void {
  if (!storage) return;

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private browsing or locked-down embeds.
  }
}

/** Reads a raw string value, or null when storage is unavailable / key missing. */
export function readString(storage: Storage | null, key: string): string | null {
  if (!storage) return null;

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes a raw string value, swallowing errors when storage is unavailable or full. */
export function writeString(storage: Storage | null, key: string, value: string): void {
  if (!storage) return;

  try {
    storage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private browsing or locked-down embeds.
  }
}
