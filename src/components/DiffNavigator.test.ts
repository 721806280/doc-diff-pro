import { createApp, nextTick, type App as VueApp } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiffSummary } from '@/types/diff';
import DiffNavigator from './DiffNavigator.vue';

vi.mock('@/i18n', async () => {
  const { messages } = await vi.importActual<typeof import('@/i18n/messages')>('@/i18n/messages');
  const { computed, ref } = await vi.importActual<typeof import('vue')>('vue');
  const locale = ref('zh-CN');

  return {
    useI18n: () => ({
      locale,
      messages: computed(() => messages['zh-CN']),
      setLocale: vi.fn()
    })
  };
});

type MountedNavigator = {
  app: VueApp;
  root: HTMLElement;
  events: string[];
};

const mountedNavigators: MountedNavigator[] = [];

describe('DiffNavigator', () => {
  afterEach(() => {
    mountedNavigators.splice(0).forEach(({ app, root }) => {
      app.unmount();
      root.remove();
    });
  });

  it('opens ignored details and emits locate or restore actions', async () => {
    const { root, events } = mountNavigator({
      activeDiffCount: 2,
      activeDiffIndex: 1,
      ignoredDiffCount: 1,
      ignoredDiffs: [createIgnoredDiff()]
    });

    expect(root.textContent).toContain('差异 2/3');
    expect(root.textContent).toContain('忽略 1');

    clickButton(root, '忽略 1');
    await nextTick();

    expect(document.body.textContent).toContain('已忽略差异');

    clickButton(document.body, '定位');
    clickButton(root, '忽略 1');
    await nextTick();
    clickButton(document.body, '取消忽略');

    expect(events).toEqual(['locateIgnored:diff-2', 'restoreIgnored:diff-2']);
  });

  it('shows a restore state when every difference is ignored', () => {
    const { root, events } = mountNavigator({
      activeDiffCount: 0,
      activeDiffIndex: 0,
      ignoredDiffCount: 3,
      canNext: false,
      ignoredDiffs: [createIgnoredDiff()]
    });

    expect(root.textContent).toContain('差异 0/3');
    expect(root.textContent).toContain('当前差异已全部临时忽略');

    clickButton(root, '恢复全部');

    expect(events).toEqual(['restoreAllIgnored']);
  });

  it('exposes keyboard shortcuts on the navigation controls', () => {
    const { root } = mountNavigator({ canPrevious: true });
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.btn-action-nav'));

    expect(buttons[0]?.getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowUp');
    expect(buttons[0]?.title).toContain('Alt+↑');
    expect(buttons[1]?.getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowDown');
    expect(buttons[1]?.title).toContain('Alt+↓');
  });
});

function mountNavigator(overrides: Record<string, unknown> = {}): MountedNavigator {
  const events: string[] = [];
  const root = document.createElement('div');
  const props = {
    summary: createSummary(),
    activeDiffCount: 3,
    activeDiffIndex: 1,
    ignoredDiffCount: 0,
    ignoredDiffs: [],
    canPrevious: false,
    canNext: true,
    onPrevious: () => events.push('previous'),
    onNext: () => events.push('next'),
    onLocateIgnored: (id: string) => events.push(`locateIgnored:${id}`),
    onRestoreIgnored: (id: string) => events.push(`restoreIgnored:${id}`),
    onRestoreAllIgnored: () => events.push('restoreAllIgnored'),
    ...overrides
  };

  document.body.append(root);
  const app = createApp(DiffNavigator, props);
  app.mount(root);
  const mounted = { app, root, events };
  mountedNavigators.push(mounted);

  return mounted;
}

function createIgnoredDiff() {
  return {
    id: 'diff-2',
    index: 2,
    kind: 'modified' as const,
    originalPreview: '旧条款内容',
    revisedPreview: '新条款内容'
  };
}

function createSummary(): DiffSummary {
  return {
    total: 3,
    inserted: 1,
    deleted: 1,
    modified: 1,
    similarity: 0.82,
    layoutNoiseFiltered: 0,
    layoutNoiseItems: []
  };
}

function clickButton(root: HTMLElement, label: string): void {
  const button = Array.from(root.querySelectorAll('button'))
    .find((item) => item.textContent?.includes(label));

  expect(button).toBeTruthy();
  button?.click();
}
