import { afterEach, describe, expect, it } from 'vitest';
import { createMountRegistry } from '@/test-utils/mountComponent';
import CompareToast from './CompareToast.vue';

const mounts = createMountRegistry();

describe('CompareToast', () => {
  afterEach(() => mounts.cleanup());

  it('announces comparison notices without moving focus', () => {
    const { root } = mounts.mount(CompareToast, { message: '已恢复默认比对设置', comparing: false });
    const toast = root.querySelector('.compare-toast');

    expect(toast?.getAttribute('role')).toBe('status');
    expect(toast?.getAttribute('aria-live')).toBe('polite');
    expect(toast?.getAttribute('aria-atomic')).toBe('true');
  });
});
