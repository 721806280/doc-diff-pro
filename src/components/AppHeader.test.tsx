import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_USER_SETTINGS } from '@/config/userSettings';
import { setLocale } from '@/i18n';
import { createRenderRegistry } from '@/test-utils/renderReact';
import AppHeader, { type HeaderSettings } from './AppHeader';

const renders = createRenderRegistry();

beforeEach(() => setLocale('zh-CN'));

afterEach(() => {
  renders.cleanup();
  setLocale('zh-CN');
  vi.useRealTimers();
});

describe('AppHeader', () => {
  it('resets all settings including appearance', () => {
    const events: string[] = [];
    const { host, settingsChanges } = mountHeader({ appearanceMode: 'dark' }, events);
    act(() => host.querySelector<HTMLButtonElement>('.settings-trigger')?.click());
    const reset = host.querySelector<HTMLButtonElement>('.settings-reset-button');
    expect(reset?.textContent?.trim()).toBe('恢复默认');
    act(() => reset?.click());
    expect(settingsChanges).toEqual([{ ...DEFAULT_USER_SETTINGS }]);
    expect(events).toContain(`appearanceMode:${DEFAULT_USER_SETTINGS.appearanceMode}`);
    expect(events).toContain('settingsReset');
  });

  it('uses titled groups and hides reset for defaults', () => {
    const { host } = mountHeader();
    act(() => host.querySelector<HTMLButtonElement>('.settings-trigger')?.click());
    expect(host.querySelector('.settings-reset-button')).toBeNull();
    expect(Array.from(host.querySelectorAll('.settings-section--framed > legend')).map((node) => node.textContent?.trim())).toEqual(['比对粒度', '比对规则', '查看方式']);
  });

  it('resets from the brand after its motion', () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const { host } = mountHeader({ canSwapDocuments: true, canResetDocuments: true }, events);
    act(() => host.querySelector<HTMLButtonElement>('.swap-documents-trigger')?.click());
    const brand = host.querySelector<HTMLButtonElement>('.brand-zone')!;
    act(() => brand.click());
    expect(events).toContain('swapDocuments');
    expect(events).not.toContain('resetDocuments');
    expect(brand.classList.contains('is-resetting')).toBe(true);
    act(() => vi.advanceTimersByTime(240));
    expect(events).toContain('resetDocuments');
    expect(brand.classList.contains('is-resetting')).toBe(false);
  });

  it('closes settings on Escape with focus restoration and outside pointer without stealing focus', () => {
    const { host } = mountHeader();
    const trigger = host.querySelector<HTMLButtonElement>('.settings-trigger')!;
    trigger.focus();
    act(() => trigger.click());
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('.settings-popover')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    const outside = document.createElement('button');
    document.body.append(outside);
    act(() => trigger.click());
    outside.focus();
    act(() => outside.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(host.querySelector('.settings-popover')).toBeNull();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('switches locale and supports hiding the repository link', () => {
    const { host } = mountHeader({ showGithubLink: false });
    expect(host.querySelector('.github-link')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('.settings-trigger')?.click());
    expect(host.textContent).toContain('结构标记');
    act(() => host.querySelector<HTMLButtonElement>('.language-trigger')?.click());
    expect(host.querySelector('.settings-popover')).toBeNull();
    expect(host.querySelector('.language-icon')?.classList).toContain('is-en');
  });
});

function mountHeader(overrides: Partial<HeaderSettings & { canSwapDocuments: boolean; canResetDocuments: boolean; showGithubLink: boolean }> = {}, events: string[] = []) {
  const settings: HeaderSettings = { ...DEFAULT_USER_SETTINGS, ...overrides };
  const settingsChanges: HeaderSettings[] = [];
  const onSettingsChange = (nextSettings: HeaderSettings) => {
    settingsChanges.push(nextSettings);
    (Object.keys(settings) as Array<keyof HeaderSettings>).forEach((key) => {
      if (settings[key] !== nextSettings[key]) events.push(`${key}:${nextSettings[key]}`);
    });
  };
  return {
    ...renders.render(<AppHeader canSwapDocuments={Boolean(overrides.canSwapDocuments)} canResetDocuments={Boolean(overrides.canResetDocuments)} showGithubLink={overrides.showGithubLink ?? true} settings={settings} onSettingsChange={onSettingsChange} onSwapDocuments={() => events.push('swapDocuments')} onResetDocuments={() => events.push('resetDocuments')} onSettingsReset={() => events.push('settingsReset')} onSettingsOpenChange={(value) => events.push(`settingsOpen:${value}`)} />),
    settingsChanges
  };
}
