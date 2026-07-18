import { defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMountRegistry } from '@/test-utils/mountComponent';
import LayoutNoiseModal from './LayoutNoiseModal.vue';

vi.mock('@/i18n', () => import('@/test-utils/i18nMock'));

const mounts = createMountRegistry();

describe('LayoutNoiseModal', () => {
  afterEach(async () => {
    mounts.cleanup();
    await nextTick();
    document.body.querySelectorAll('.layout-noise-overlay').forEach((element) => element.remove());
    document.body.style.overflow = '';
  });

  it('renders noise metadata and closes from all supported controls', async () => {
    const closes: string[] = [];
    mounts.mount(LayoutNoiseModal, {
      open: true,
      total: 3,
      items: [{ side: 'original', reason: 'hint', source: 'native', count: 3, text: '内部资料' }],
      onClose: () => closes.push('close')
    });
    await nextTick();

    expect(document.body.textContent).toContain('内部资料');
    expect(document.body.textContent).toContain('x3');
    expect(document.body.querySelector('.layout-noise-source')).toBeTruthy();

    document.body.querySelector<HTMLButtonElement>('.layout-noise-panel__close')?.click();
    document.body.querySelector<HTMLElement>('.layout-noise-overlay')?.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closes).toEqual(['close', 'close', 'close']);
  });

  it('locks scrolling and restores focus when closed', async () => {
    const open = ref(false);
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const items = [{ side: 'original' as const, reason: 'hint' as const, source: 'native' as const, count: 1, text: '页眉' }];
    const Harness = defineComponent(() => () => h(LayoutNoiseModal, { open: open.value, total: 1, items }));
    mounts.mount(Harness);

    open.value = true;
    await nextTick();
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(document.body.querySelector('.layout-noise-panel__close'));

    open.value = false;
    await nextTick();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
