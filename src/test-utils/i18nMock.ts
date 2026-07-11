import { computed, ref } from 'vue';
import { messages, type Locale } from '@/i18n/messages';

const locale = ref<Locale>('zh-CN');

export function useI18n() {
  return {
    locale,
    messages: computed(() => messages[locale.value]),
    setLocale(nextLocale: Locale): void {
      locale.value = nextLocale;
    }
  };
}
