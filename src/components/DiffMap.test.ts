import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMountRegistry } from '@/test-utils/mountComponent';
import DiffMap from './DiffMap.vue';

vi.mock('@/i18n', () => import('@/test-utils/i18nMock'));

const mounts = createMountRegistry();

describe('DiffMap', () => {
  afterEach(() => {
    mounts.cleanup();
  });

  it('shows change distribution and selects a marker', () => {
    const selected: number[] = [];
    const { root } = mounts.mount(DiffMap, {
      items: [
        { index: 1, kind: 'deleted', position: 10 },
        { index: 2, kind: 'modified', position: 52 },
        { index: 3, kind: 'inserted', position: 88 }
      ],
      currentIndex: 2,
      ignoredIndices: new Set([3]),
      onSelect: (index: number) => selected.push(index)
    });

    const markers = root.querySelectorAll<HTMLButtonElement>('.diff-map__marker');

    expect(markers).toHaveLength(3);
    expect(markers[1]?.classList.contains('is-active')).toBe(true);
    expect(markers[2]?.classList.contains('is-ignored')).toBe(true);
    markers[0]?.click();
    expect(selected).toEqual([1]);
  });
});
