import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '@/i18n';
import { messages } from '@/i18n/messages';
import { createRenderRegistry } from '@/test-utils/renderReact';
import CompareToast from './CompareToast';
import DiffMap from './DiffMap';
import MobilePaneSwitch from './MobilePaneSwitch';

const renders = createRenderRegistry();

beforeEach(() => setLocale('zh-CN'));

afterEach(() => {
  renders.cleanup();
  setLocale('zh-CN');
});

describe('presentation components', () => {
  it('announces comparison notices', () => {
    const { host } = renders.render(<CompareToast message="已恢复默认比对设置" comparing={false} />);
    const toast = host.querySelector('.compare-toast');
    expect(toast?.getAttribute('role')).toBe('status');
    expect(toast?.getAttribute('aria-live')).toBe('polite');
    expect(toast?.getAttribute('aria-atomic')).toBe('true');
  });

  it('marks the active mobile pane and emits selection', () => {
    const selected: string[] = [];
    const view = renders.render(
      <MobilePaneSwitch activePane="A" i18n={messages['zh-CN']} onChange={(pane) => selected.push(pane)} />
    );
    const buttons = view.host.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons[0]?.getAttribute('aria-checked')).toBe('true');
    act(() => buttons[1]?.click());
    view.rerender(
      <MobilePaneSwitch activePane="B" i18n={messages['zh-CN']} onChange={(pane) => selected.push(pane)} />
    );
    expect(buttons[1]?.getAttribute('aria-checked')).toBe('true');
    expect(buttons[0]?.classList.contains('active')).toBe(false);
    act(() => buttons[0]?.click());
    expect(selected).toEqual(['B', 'A']);
  });

  it('renders active and ignored map markers and selects one', () => {
    const selected: number[] = [];
    const { host } = renders.render(
      <DiffMap
        items={[
          { index: 1, kind: 'deleted', position: 10 },
          { index: 2, kind: 'modified', position: 52 },
          { index: 3, kind: 'inserted', position: 88 }
        ]}
        currentIndex={2}
        ignoredIndices={new Set([3])}
        collapsed={false}
        i18n={messages['zh-CN']}
        onSelect={(index) => selected.push(index)}
      />
    );
    const markers = host.querySelectorAll<HTMLButtonElement>('.diff-map__marker');
    expect(markers).toHaveLength(3);
    expect(markers[1]?.classList).toContain('is-active');
    expect(markers[2]?.classList).toContain('is-ignored');
    expect(markers[1]?.tabIndex).toBe(0);
    expect(markers[0]?.tabIndex).toBe(-1);
    act(() => markers[0]?.click());
    expect(selected).toEqual([1]);
  });

  it('walks the map with the arrow, Home and End keys', () => {
    const selected: number[] = [];
    const items = [
      { index: 1, kind: 'deleted' as const, position: 10 },
      { index: 2, kind: 'modified' as const, position: 52 },
      { index: 3, kind: 'inserted' as const, position: 88 }
    ];
    const view = renders.render(
      <DiffMap
        items={items}
        currentIndex={2}
        ignoredIndices={new Set()}
        collapsed={false}
        i18n={messages['zh-CN']}
        onSelect={(index) => selected.push(index)}
      />
    );
    const markers = view.host.querySelectorAll<HTMLButtonElement>('.diff-map__marker');
    const press = (from: HTMLButtonElement, key: string) => {
      act(() => {
        from.focus();
        from.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    };

    press(markers[1]!, 'ArrowDown');
    // Focus follows the selection so the next key press continues from there.
    expect(selected).toEqual([3]);
    expect(document.activeElement).toBe(markers[2]);

    press(markers[2]!, 'ArrowUp');
    press(markers[1]!, 'Home');
    press(markers[0]!, 'End');
    expect(selected).toEqual([3, 2, 1, 3]);

    // The edges stay put rather than wrapping around.
    press(markers[2]!, 'ArrowDown');
    press(markers[0]!, 'ArrowUp');
    expect(selected).toEqual([3, 2, 1, 3]);
  });

  it('keeps the map reachable by keyboard before a difference is active', () => {
    const { host } = renders.render(
      <DiffMap
        items={[{ index: 1, kind: 'modified', position: 30 }]}
        currentIndex={0}
        ignoredIndices={new Set()}
        collapsed={false}
        i18n={messages['zh-CN']}
        onSelect={() => undefined}
      />
    );

    expect(host.querySelector<HTMLButtonElement>('.diff-map__marker')?.tabIndex).toBe(0);
    expect(host.querySelector('.diff-map')?.getAttribute('aria-orientation')).toBe('vertical');
  });
});
