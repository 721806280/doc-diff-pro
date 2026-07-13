import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMountRegistry } from '@/test-utils/mountComponent';
import SimilarDiffModal from './SimilarDiffModal.vue';

vi.mock('@/i18n', () => import('@/test-utils/i18nMock'));

const mounts = createMountRegistry();

describe('SimilarDiffModal', () => {
  afterEach(() => mounts.cleanup());

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
});

function item(id: string, index: number) {
  return { id, index, kind: 'modified' as const, originalPreview: 'before', revisedPreview: 'after' };
}
