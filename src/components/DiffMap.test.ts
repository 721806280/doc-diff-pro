import { createApp, type App as VueApp } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DiffMap from './DiffMap.vue';

vi.mock('@/i18n', async () => {
  const { messages } = await vi.importActual<typeof import('@/i18n/messages')>('@/i18n/messages');
  const { computed } = await vi.importActual<typeof import('vue')>('vue');

  return {
    useI18n: () => ({ messages: computed(() => messages['zh-CN']) })
  };
});

let mountedApp: VueApp | null = null;

describe('DiffMap', () => {
  afterEach(() => {
    mountedApp?.unmount();
    mountedApp = null;
  });

  it('shows change distribution and selects a marker', () => {
    const root = document.createElement('div');
    const selected: number[] = [];
    mountedApp = createApp(DiffMap, {
      items: [
        { index: 1, kind: 'deleted', position: 10 },
        { index: 2, kind: 'modified', position: 52 },
        { index: 3, kind: 'inserted', position: 88 }
      ],
      currentIndex: 2,
      ignoredIndices: new Set([3]),
      onSelect: (index: number) => selected.push(index)
    });

    mountedApp.mount(root);
    const markers = root.querySelectorAll<HTMLButtonElement>('.diff-map__marker');

    expect(markers).toHaveLength(3);
    expect(markers[1]?.classList.contains('is-active')).toBe(true);
    expect(markers[2]?.classList.contains('is-ignored')).toBe(true);
    markers[0]?.click();
    expect(selected).toEqual([1]);
  });
});
