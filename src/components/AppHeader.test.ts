import { createApp, nextTick, type App as VueApp } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@/utils/appSettings';
import AppHeader from './AppHeader.vue';

vi.mock('@/i18n', async () => {
  const { messages } = await vi.importActual<typeof import('@/i18n/messages')>('@/i18n/messages');
  const { computed, ref } = await vi.importActual<typeof import('vue')>('vue');
  const locale = ref('zh-CN');

  return {
    useI18n: () => ({
      locale,
      messages: computed(() => messages['zh-CN']),
      setLocale: vi.fn()
    })
  };
});

type MountedHeader = {
  app: VueApp;
  root: HTMLElement;
  events: string[];
};

const mountedHeaders: MountedHeader[] = [];

describe('AppHeader', () => {
  afterEach(() => {
    mountedHeaders.splice(0).forEach(({ app, root }) => {
      app.unmount();
      root.remove();
    });
  });

  it('resets the persisted appearance mode with the rest of the settings', async () => {
    const { root, events } = mountHeader({ appearanceMode: 'dark' });

    root.querySelector<HTMLButtonElement>('.settings-trigger')?.click();
    await nextTick();

    const resetButton = root.querySelector<HTMLButtonElement>('.settings-reset-button');
    expect(resetButton).toBeTruthy();
    expect(resetButton?.getAttribute('aria-disabled')).toBe('false');

    resetButton?.click();

    expect(events).toContain(`appearanceMode:${DEFAULT_APP_SETTINGS.appearanceMode}`);
  });
});

function mountHeader(overrides: Record<string, unknown> = {}): MountedHeader {
  const root = document.createElement('div');
  const events: string[] = [];
  const props = {
    ...DEFAULT_APP_SETTINGS,
    ...overrides,
    'onUpdate:diffGranularity': (value: string) => events.push(`diffGranularity:${value}`),
    'onUpdate:themeColor': (value: string) => events.push(`themeColor:${value}`),
    'onUpdate:appearanceMode': (value: string) => events.push(`appearanceMode:${value}`),
    'onUpdate:ignoreSpaces': (value: boolean) => events.push(`ignoreSpaces:${value}`),
    'onUpdate:ignoreFullHalfWidth': (value: boolean) => events.push(`ignoreFullHalfWidth:${value}`),
    'onUpdate:filterLayoutNoise': (value: boolean) => events.push(`filterLayoutNoise:${value}`),
    'onUpdate:syncScroll': (value: boolean) => events.push(`syncScroll:${value}`),
    'onUpdate:showTableHints': (value: boolean) => events.push(`showTableHints:${value}`),
    'onUpdate:enableDiffIgnore': (value: boolean) => events.push(`enableDiffIgnore:${value}`),
    'onUpdate:enableSimilarDiffs': (value: boolean) => events.push(`enableSimilarDiffs:${value}`),
    'onUpdate:similarDiffLevel': (value: string) => events.push(`similarDiffLevel:${value}`),
    onSettingsOpenChange: (value: boolean) => events.push(`settingsOpen:${value}`)
  };

  document.body.append(root);
  const app = createApp(AppHeader, props);
  app.mount(root);
  const mounted = { app, root, events };
  mountedHeaders.push(mounted);

  return mounted;
}
