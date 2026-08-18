import { useSyncExternalStore } from 'react';
import { deploymentConfig, type ConfiguredLocale } from '@/config/deploymentConfig';
import { getLocalStorage, readString, writeString } from '@/config/storage';
import { messages, SUPPORTED_LOCALES, type Locale } from './messages';

const STORAGE_KEY = 'doc-diff-locale';

let locale = detectInitialLocale(deploymentConfig.locale);
const listeners = new Set<() => void>();

export function useI18n() {
  const currentLocale = useSyncExternalStore(subscribe, getCurrentLocale, getCurrentLocale);
  return {
    locale: currentLocale,
    messages: messages[currentLocale],
    setLocale
  };
}

export function setLocale(nextLocale: Locale): void {
  if (locale === nextLocale) return;
  locale = nextLocale;
  writeSavedLocale(nextLocale);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCurrentLocale(): Locale {
  return locale;
}

export function detectInitialLocale(configuredLocale: ConfiguredLocale = 'auto'): Locale {
  if (configuredLocale !== 'auto') return configuredLocale;
  return readSavedLocale() ?? detectBrowserLocale();
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';

  const browserLocales = navigator.languages?.length ? navigator.languages : [navigator.language];

  for (const browserLocale of browserLocales) {
    const normalized = normalizeLocale(browserLocale);
    if (normalized) return normalized;
  }

  return 'en';
}

function normalizeLocale(value: string): Locale | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';

  return null;
}

function readSavedLocale(): Locale | null {
  const saved = readString(getLocalStorage(), STORAGE_KEY);
  return isSupportedLocale(saved) ? saved : null;
}

function writeSavedLocale(nextLocale: Locale): void {
  writeString(getLocalStorage(), STORAGE_KEY, nextLocale);
}

function isSupportedLocale(value: string | null): value is Locale {
  return SUPPORTED_LOCALES.some((localeOption) => localeOption === value);
}

export type { Locale };
