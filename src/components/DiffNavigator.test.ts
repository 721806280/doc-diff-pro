import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiffSummary } from '@/types/diff';
import { createMountRegistry } from '@/test-utils/mountComponent';
import DiffNavigator from './DiffNavigator.vue';

vi.mock('@/i18n', () => import('@/test-utils/i18nMock'));

const mounts = createMountRegistry();

describe('DiffNavigator', () => {
  afterEach(() => {
    mounts.cleanup();
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

  it('emits report export from the summary strip', () => {
    const { root, events } = mountNavigator();

    clickButton(root, '导出报告');

    expect(events).toContain('exportReport');
  });

  it('hides report export when the deployment disables it', () => {
    const { root } = mountNavigator({ canExportReport: false });

    expect(root.textContent).not.toContain('导出报告');
  });
});

function mountNavigator(overrides: Record<string, unknown> = {}) {
  const events: string[] = [];
  const props = {
    summary: createSummary(),
    activeDiffCount: 3,
    activeDiffIndex: 1,
    ignoredDiffCount: 0,
    ignoredDiffs: [],
    canPrevious: false,
    canNext: true,
    canExportReport: true,
    onPrevious: () => events.push('previous'),
    onNext: () => events.push('next'),
    onLocateIgnored: (id: string) => events.push(`locateIgnored:${id}`),
    onRestoreIgnored: (id: string) => events.push(`restoreIgnored:${id}`),
    onRestoreAllIgnored: () => events.push('restoreAllIgnored'),
    onExportReport: () => events.push('exportReport'),
    ...overrides
  };

  return { ...mounts.mount(DiffNavigator, props), events };
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
