import { createApp } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import MobilePaneSwitch from './MobilePaneSwitch.vue';

vi.mock('@/i18n', async () => {
  const { messages } = await vi.importActual<typeof import('@/i18n/messages')>('@/i18n/messages');
  const { computed } = await vi.importActual<typeof import('vue')>('vue');

  return {
    useI18n: () => ({ messages: computed(() => messages['zh-CN']) })
  };
});

describe('MobilePaneSwitch', () => {
  it('marks the active document and emits a view change', () => {
    const root = document.createElement('div');
    const selections: string[] = [];
    const app = createApp(MobilePaneSwitch, {
      activePane: 'A',
      'onUpdate:activePane': (value: string) => selections.push(value)
    });

    app.mount(root);
    const buttons = root.querySelectorAll<HTMLButtonElement>('button');

    expect(buttons[0]?.getAttribute('aria-checked')).toBe('true');
    buttons[1]?.click();
    expect(selections).toEqual(['B']);

    app.unmount();
  });
});
