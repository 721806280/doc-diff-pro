import { createApp } from 'vue';
import { describe, expect, it } from 'vitest';
import CompareToast from './CompareToast.vue';

describe('CompareToast', () => {
  it('announces comparison notices without moving focus', () => {
    const root = document.createElement('div');
    const app = createApp(CompareToast, { message: '已恢复默认比对设置', comparing: false });

    app.mount(root);
    const toast = root.querySelector('.compare-toast');

    expect(toast?.getAttribute('role')).toBe('status');
    expect(toast?.getAttribute('aria-live')).toBe('polite');
    expect(toast?.getAttribute('aria-atomic')).toBe('true');

    app.unmount();
  });
});
