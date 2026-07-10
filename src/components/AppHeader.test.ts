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

    expect(root.querySelector('.settings-trigger')?.classList.contains('has-overrides')).toBe(true);

    root.querySelector<HTMLButtonElement>('.settings-trigger')?.click();
    await nextTick();

    const resetButton = root.querySelector<HTMLButtonElement>('.settings-reset-button');
    expect(resetButton).toBeTruthy();
    expect(resetButton?.textContent?.trim()).toBe('恢复默认');

    resetButton?.click();

    expect(events).toContain(`appearanceMode:${DEFAULT_APP_SETTINGS.appearanceMode}`);
    expect(events).toContain('settingsReset');
  });

  it('hides the reset button while using the default settings', async () => {
    const { root } = mountHeader();

    expect(root.querySelector('.settings-trigger')?.classList.contains('has-overrides')).toBe(false);

    root.querySelector<HTMLButtonElement>('.settings-trigger')?.click();
    await nextTick();

    expect(root.querySelector('.settings-reset-button')).toBeNull();
  });

  it('emits document session actions when they are available', () => {
    const { root, events } = mountHeader({ canSwapDocuments: true, canResetDocuments: true });

    root.querySelector<HTMLButtonElement>('.swap-documents-trigger')?.click();
    root.querySelector<HTMLButtonElement>('.reset-documents-trigger')?.click();

    expect(events).toContain('swapDocuments');
    expect(events).toContain('resetDocuments');
  });
});

function mountHeader(overrides: Record<string, unknown> = {}): MountedHeader {
  const root = document.createElement('div');
  const events: string[] = [];
  const props = {
    ...DEFAULT_APP_SETTINGS,
    canSwapDocuments: false,
    canResetDocuments: false,
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
    onSwapDocuments: () => events.push('swapDocuments'),
    onResetDocuments: () => events.push('resetDocuments'),
    onSettingsReset: () => events.push('settingsReset'),
    onSettingsOpenChange: (value: boolean) => events.push(`settingsOpen:${value}`)
  };

  document.body.append(root);
  const app = createApp(AppHeader, props);
  app.mount(root);
  const mounted = { app, root, events };
  mountedHeaders.push(mounted);

  return mounted;
}
