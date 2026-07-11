import { computed, readonly, ref } from 'vue';
import { deploymentConfig, type ConfiguredLocale } from '@/config/deploymentConfig';
import { messages, SUPPORTED_LOCALES, type Locale } from './messages';

const STORAGE_KEY = 'doc-diff-locale';

const locale = ref<Locale>(detectInitialLocale(
  deploymentConfig.locale
));
const currentMessages = computed(() => messages[locale.value]);

export function useI18n() {
  return {
    locale: readonly(locale),
    messages: currentMessages,
    setLocale
  };
}

export function setLocale(nextLocale: Locale): void {
  locale.value = nextLocale;
  writeSavedLocale(nextLocale);
}

export function detectInitialLocale(configuredLocale: ConfiguredLocale = 'auto'): Locale {
  if (configuredLocale !== 'auto') return configuredLocale;
  return readSavedLocale() ?? detectBrowserLocale();
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';

  const browserLocales = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];

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
  if (typeof localStorage === 'undefined') return null;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isSupportedLocale(saved) ? saved : null;
  } catch {
    return null;
  }
}

function writeSavedLocale(nextLocale: Locale): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, nextLocale);
  } catch {
    // Storage can be unavailable in private browsing or locked-down embeds.
  }
}

function isSupportedLocale(value: string | null): value is Locale {
  return SUPPORTED_LOCALES.some((localeOption) => localeOption === value);
}

export type { Locale };
