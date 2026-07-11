import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMountRegistry } from '@/test-utils/mountComponent';
import MobilePaneSwitch from './MobilePaneSwitch.vue';

vi.mock('@/i18n', () => import('@/test-utils/i18nMock'));

const mounts = createMountRegistry();

describe('MobilePaneSwitch', () => {
  afterEach(() => mounts.cleanup());

  it('marks the active document and emits a view change', () => {
    const selections: string[] = [];
    const { root } = mounts.mount(MobilePaneSwitch, {
      activePane: 'A',
      'onUpdate:activePane': (value: string) => selections.push(value)
    });

    const buttons = root.querySelectorAll<HTMLButtonElement>('button');

    expect(buttons[0]?.getAttribute('aria-checked')).toBe('true');
    buttons[1]?.click();
    expect(selections).toEqual(['B']);
  });
});
