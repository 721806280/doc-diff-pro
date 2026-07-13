import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DEPLOYMENT_CONFIG } from '@/config/deploymentConfig';
import { DEFAULT_USER_SETTINGS } from '@/config/userSettings';
import { createMountRegistry } from '@/test-utils/mountComponent';
import AppHeader from './AppHeader.vue';

vi.mock('@/i18n', () => import('@/test-utils/i18nMock'));

const mounts = createMountRegistry();

describe('AppHeader', () => {
  afterEach(() => {
    vi.useRealTimers();
    mounts.cleanup();
  });

  it('resets the persisted appearance mode with the rest of the settings', async () => {
    const { root, events } = mountHeader({ appearanceMode: 'dark' });

    root.querySelector<HTMLButtonElement>('.settings-trigger')?.click();
    await nextTick();

    const resetButton = root.querySelector<HTMLButtonElement>('.settings-reset-button');
    expect(resetButton).toBeTruthy();
    expect(resetButton?.textContent?.trim()).toBe('恢复默认');

    resetButton?.click();

    expect(events).toContain(`appearanceMode:${DEFAULT_USER_SETTINGS.appearanceMode}`);
    expect(events).toContain('settingsReset');
  });

  it('hides the reset button while using the default settings', async () => {
    const { root } = mountHeader();

    root.querySelector<HTMLButtonElement>('.settings-trigger')?.click();
    await nextTick();

    expect(root.querySelector('.settings-reset-button')).toBeNull();
  });

  it('groups compare settings with titled borders', async () => {
    const { root } = mountHeader();
    root.querySelector<HTMLButtonElement>('.settings-trigger')?.click();
    await nextTick();

    const legends = Array.from(root.querySelectorAll('.settings-section--framed > legend'))
      .map((legend) => legend.textContent?.trim());

    expect(legends).toEqual(['比对粒度', '比对规则', '查看方式']);
  });

  it('emits document session actions from swap and the brand', async () => {
    vi.useFakeTimers();
    const { root, events } = mountHeader({ canSwapDocuments: true, canResetDocuments: true });

    root.querySelector<HTMLButtonElement>('.swap-documents-trigger')?.click();
    const brand = root.querySelector<HTMLButtonElement>('.brand-zone');
    brand?.click();
    await nextTick();

    expect(events).toContain('swapDocuments');
    expect(events).not.toContain('resetDocuments');
    expect(brand?.classList.contains('is-resetting')).toBe(true);

    vi.advanceTimersByTime(240);
    await nextTick();

    expect(events).toContain('resetDocuments');
    expect(brand?.classList.contains('is-resetting')).toBe(false);
  });

  it('keeps the brand inactive without a document session', () => {
    const { root } = mountHeader();
    expect(root.querySelector<HTMLButtonElement>('.brand-zone')?.disabled).toBe(true);
  });

  it('updates report export visibility from user settings', async () => {
    const { root, events } = mountHeader();
    root.querySelector<HTMLButtonElement>('.settings-trigger')?.click();
    await nextTick();

    const reportToggle = Array.from(root.querySelectorAll<HTMLButtonElement>('.settings-toggle'))
      .find((button) => button.textContent?.trim() === '导出报告');
    reportToggle?.click();

    expect(events).toContain('showReportExport:true');
  });

  it('hides the repository link when deployment disables it', async () => {
    const { root } = mountHeader({
      canSwapDocuments: true,
      showGithubLink: false
    });

    expect(root.querySelector('.github-link')).toBeNull();
    expect(root.querySelector('.brand-zone')).toBeTruthy();
    expect(root.querySelector('.swap-documents-trigger')).toBeTruthy();
    expect(root.querySelector('.appearance-trigger')).toBeTruthy();
    expect(root.querySelector('.language-trigger')).toBeTruthy();

    root.querySelector<HTMLButtonElement>('.settings-trigger')?.click();
    await nextTick();

    expect(Array.from(root.querySelectorAll<HTMLButtonElement>('.settings-toggle'))
      .some((button) => button.textContent?.trim() === '导出报告')).toBe(true);
    expect(root.textContent).toContain('结构标记');
    expect(root.textContent).toContain('差异忽略');
  });
});

function mountHeader(overrides: Record<string, unknown> = {}) {
  const events: string[] = [];
  const props = {
    ...DEFAULT_USER_SETTINGS,
    canSwapDocuments: false,
    canResetDocuments: false,
    showGithubLink: DEFAULT_DEPLOYMENT_CONFIG.showGithubLink,
    ...overrides,
    'onUpdate:diffGranularity': (value: string) => events.push(`diffGranularity:${value}`),
    'onUpdate:themeColor': (value: string) => events.push(`themeColor:${value}`),
    'onUpdate:appearanceMode': (value: string) => events.push(`appearanceMode:${value}`),
    'onUpdate:ignoreSpaces': (value: boolean) => events.push(`ignoreSpaces:${value}`),
    'onUpdate:ignoreFullHalfWidth': (value: boolean) => events.push(`ignoreFullHalfWidth:${value}`),
    'onUpdate:filterLayoutNoise': (value: boolean) => events.push(`filterLayoutNoise:${value}`),
    'onUpdate:syncScroll': (value: boolean) => events.push(`syncScroll:${value}`),
    'onUpdate:showReportExport': (value: boolean) => events.push(`showReportExport:${value}`),
    'onUpdate:showTableHints': (value: boolean) => events.push(`showTableHints:${value}`),
    'onUpdate:showDiffMap': (value: boolean) => events.push(`showDiffMap:${value}`),
    'onUpdate:enableDiffIgnore': (value: boolean) => events.push(`enableDiffIgnore:${value}`),
    'onUpdate:enableSimilarDiffs': (value: boolean) => events.push(`enableSimilarDiffs:${value}`),
    'onUpdate:similarDiffLevel': (value: string) => events.push(`similarDiffLevel:${value}`),
    onSwapDocuments: () => events.push('swapDocuments'),
    onResetDocuments: () => events.push('resetDocuments'),
    onSettingsReset: () => events.push('settingsReset'),
    onSettingsOpenChange: (value: boolean) => events.push(`settingsOpen:${value}`)
  };

  return { ...mounts.mount(AppHeader, props), events };
}
