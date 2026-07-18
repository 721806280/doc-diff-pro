import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMountRegistry } from '@/test-utils/mountComponent';
import DiffActionPopover from './DiffActionPopover.vue';

vi.mock('@/i18n', () => import('@/test-utils/i18nMock'));

const mounts = createMountRegistry();

describe('DiffActionPopover', () => {
  afterEach(() => mounts.cleanup());

  it('emits ignore for an active difference and offers similar differences', () => {
    const events: string[] = [];
    mounts.mount(DiffActionPopover, props({
      similarCount: 2,
      onIgnore: () => events.push('ignore'),
      onShowSimilar: () => events.push('similar')
    }));

    document.body.querySelector<HTMLButtonElement>('.diff-action-popover__button--main')?.click();
    document.body.querySelector<HTMLButtonElement>('.diff-action-popover__button--similar')?.click();

    expect(events).toEqual(['ignore', 'similar']);
  });

  it('emits restore and hides similar actions for an ignored difference', () => {
    const events: string[] = [];
    mounts.mount(DiffActionPopover, props({
      ignored: true,
      similarCount: 2,
      onRestore: () => events.push('restore')
    }));

    document.body.querySelector<HTMLButtonElement>('.diff-action-popover__button--main')?.click();

    expect(events).toEqual(['restore']);
    expect(document.body.querySelector('.diff-action-popover__button--similar')).toBeNull();
  });
});

function props(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    top: 120,
    left: 240,
    label: '差异 1',
    ignored: false,
    similarCount: 0,
    ...overrides
  };
}
