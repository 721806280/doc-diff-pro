import { defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMountRegistry } from '@/test-utils/mountComponent';
import IgnoredDiffModal from './IgnoredDiffModal.vue';

vi.mock('@/i18n', () => import('@/test-utils/i18nMock'));

const mounts = createMountRegistry();

describe('IgnoredDiffModal', () => {
  afterEach(async () => {
    mounts.cleanup();
    await nextTick();
    document.body.querySelectorAll('.ignored-diff-overlay').forEach((element) => element.remove());
    document.body.style.overflow = '';
  });

  it('renders ignored differences and emits row actions', async () => {
    const events: string[] = [];
    mounts.mount(IgnoredDiffModal, {
      open: true,
      items: [item()],
      onLocate: (id: string) => events.push(`locate:${id}`),
      onRestore: (id: string) => events.push(`restore:${id}`),
      onRestoreAll: () => events.push('restoreAll')
    });
    await nextTick();

    document.body.querySelector<HTMLButtonElement>('.ignored-diff-row-actions button')?.click();
    document.body.querySelector<HTMLButtonElement>('.ignored-diff-row-actions .restore')?.click();
    document.body.querySelector<HTMLButtonElement>('.ignored-diff-restore-all')?.click();

    expect(document.body.textContent).toContain('旧条款');
    expect(events).toEqual(['locate:diff-2', 'restore:diff-2', 'restoreAll']);
  });

  it('closes on Escape and backdrop click', async () => {
    const closes: string[] = [];
    mounts.mount(IgnoredDiffModal, { open: true, items: [item()], onClose: () => closes.push('close') });
    await nextTick();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.body.querySelector<HTMLElement>('.ignored-diff-overlay')?.click();

    expect(closes).toEqual(['close', 'close']);
  });

  it('locks scrolling and restores focus across the open lifecycle', async () => {
    const open = ref(false);
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const Harness = defineComponent(() => () => h(IgnoredDiffModal, { open: open.value, items: [item()] }));
    mounts.mount(Harness);

    open.value = true;
    await nextTick();
    await nextTick();

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(document.body.querySelector('.ignored-diff-close'));

    open.value = false;
    await nextTick();

    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

function item() {
  return {
    id: 'diff-2',
    index: 2,
    kind: 'modified' as const,
    originalPreview: '旧条款',
    revisedPreview: '新条款'
  };
}
