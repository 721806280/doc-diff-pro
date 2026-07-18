import { defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMountRegistry } from '@/test-utils/mountComponent';
import SimilarDiffModal from './SimilarDiffModal.vue';

vi.mock('@/i18n', () => import('@/test-utils/i18nMock'));

const mounts = createMountRegistry();

describe('SimilarDiffModal', () => {
  afterEach(async () => {
    mounts.cleanup();
    await nextTick();
    document.body.querySelectorAll('.similar-diff-overlay').forEach((element) => element.remove());
  });

  it('includes the current difference in the default batch selection', async () => {
    const ignored: string[][] = [];
    mounts.mount(SimilarDiffModal, {
      open: true,
      current: item('diff-1', 1),
      items: [{ ...item('diff-2', 2), similarity: 0.9 }],
      onIgnoreSelected: (ids: string[]) => ignored.push(ids)
    });
    await nextTick();

    document.body.querySelector<HTMLButtonElement>('.similar-diff-footer .primary')?.click();

    expect(ignored).toEqual([['diff-1', 'diff-2']]);
  });

  it('supports clearing and selecting the full batch', async () => {
    const ignored: string[][] = [];
    mounts.mount(SimilarDiffModal, {
      open: true,
      current: item('diff-1', 1),
      items: [{ ...item('diff-2', 2), similarity: 0.9 }],
      onIgnoreSelected: (ids: string[]) => ignored.push(ids)
    });
    await nextTick();

    const toggleAll = document.body.querySelector<HTMLButtonElement>('.similar-diff-footer .secondary');
    const submit = document.body.querySelector<HTMLButtonElement>('.similar-diff-footer .primary');
    toggleAll?.click();
    await nextTick();
    expect(submit?.disabled).toBe(true);

    toggleAll?.click();
    await nextTick();
    submit?.click();
    expect(ignored).toEqual([['diff-1', 'diff-2']]);
  });

  it('closes on Escape and emits locate for a candidate', async () => {
    const events: string[] = [];
    mounts.mount(SimilarDiffModal, {
      open: true,
      current: item('diff-1', 1),
      items: [{ ...item('diff-2', 2), similarity: 0.9 }],
      onClose: () => events.push('close'),
      onLocate: (id: string) => events.push(`locate:${id}`)
    });
    await nextTick();
    await nextTick();

    const locate = document.body.querySelector<HTMLButtonElement>('.similar-diff-locate');
    expect(locate).toBeTruthy();
    locate?.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(events).toEqual(['locate:diff-2', 'close']);
  });

  it('locks scrolling and restores focus when closed', async () => {
    const open = ref(false);
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const current = item('diff-1', 1);
    const items = [{ ...item('diff-2', 2), similarity: 0.9 }];
    const Harness = defineComponent(() => () => h(SimilarDiffModal, { open: open.value, current, items }));
    mounts.mount(Harness);

    open.value = true;
    await nextTick();
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(document.body.querySelector('.similar-diff-close'));

    open.value = false;
    await nextTick();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

function item(id: string, index: number) {
  return { id, index, kind: 'modified' as const, originalPreview: 'before', revisedPreview: 'after' };
}
