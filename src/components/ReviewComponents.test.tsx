import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '@/i18n';
import { messages } from '@/i18n/messages';
import { createRenderRegistry } from '@/test-utils/renderReact';
import type { DiffSummary } from '@/types/diff';
import DiffActionPopover from './DiffActionPopover';
import DiffNavigator from './DiffNavigator';
import { IgnoredDiffModal, LayoutNoiseModal, SimilarDiffModal } from './ReviewModals';

const renders = createRenderRegistry();

beforeEach(() => setLocale('zh-CN'));

afterEach(() => {
  renders.cleanup();
  document.body.style.overflow = '';
  setLocale('zh-CN');
});

describe('review components', () => {
  it('runs ignore, restore, and similar actions from the contextual popover', () => {
    const events: string[] = [];
    const first = renders.render(<DiffActionPopover open position={{ top: 120, left: 240 }} label="差异 1" ignored={false} similarCount={2} i18n={messages['zh-CN']} onIgnore={() => events.push('ignore')} onRestore={() => events.push('restore')} onShowSimilar={() => events.push('similar')} />);
    act(() => document.body.querySelector<HTMLButtonElement>('.diff-action-popover__button--main')?.click());
    act(() => document.body.querySelector<HTMLButtonElement>('.diff-action-popover__button--similar')?.click());
    expect(events).toEqual(['ignore', 'similar']);
    first.rerender(<DiffActionPopover open position={{ top: 120, left: 240 }} label="差异 1" ignored similarCount={2} i18n={messages['zh-CN']} onIgnore={() => events.push('ignore')} onRestore={() => events.push('restore')} onShowSimilar={() => events.push('similar')} />);
    act(() => document.body.querySelector<HTMLButtonElement>('.diff-action-popover__button--main')?.click());
    expect(events).toEqual(['ignore', 'similar', 'restore']);
    expect(document.body.querySelector('.diff-action-popover__button--similar')).toBeNull();
  });

  it('exposes original navigation labels, shortcuts, ignored details, and report export', () => {
    const events: string[] = [];
    const { host } = renders.render(<DiffNavigator summary={summary()} activeDiffCount={2} activeDiffIndex={1} ignoredDiffs={[item('diff-2', 2)]} canPrevious canNext canExportReport onPrevious={() => events.push('previous')} onNext={() => events.push('next')} onLocateIgnored={(id) => events.push(`locate:${id}`)} onRestoreIgnored={(id) => events.push(`restore:${id}`)} onRestoreAllIgnored={() => events.push('restoreAll')} onExportReport={() => events.push('export')} />);
    expect(host.textContent).toContain('差异 2/3');
    const nav = host.querySelectorAll<HTMLButtonElement>('.btn-action-nav');
    expect(nav[0]?.getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowUp');
    expect(nav[1]?.title).toContain('Alt+↓');
    const ignored = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('忽略 1'));
    act(() => ignored?.click());
    expect(document.body.textContent).toContain('已忽略差异');
    act(() => document.body.querySelector<HTMLButtonElement>('.ignored-diff-row-actions button')?.click());
    const exportButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('导出报告'));
    act(() => exportButton?.click());
    expect(events).toEqual(['locate:diff-2', 'export']);
  });

  it('shows the restore-all state when every difference is ignored', () => {
    const events: string[] = [];
    const { host } = renders.render(<DiffNavigator summary={summary()} activeDiffCount={0} activeDiffIndex={0} ignoredDiffs={[item('diff-1', 1), item('diff-2', 2), item('diff-3', 3)]} canPrevious={false} canNext={false} canExportReport={false} onPrevious={() => undefined} onNext={() => undefined} onLocateIgnored={() => undefined} onRestoreIgnored={() => undefined} onRestoreAllIgnored={() => events.push('restoreAll')} onExportReport={() => undefined} />);
    expect(host.textContent).toContain('差异 0/3');
    expect(host.textContent).toContain('当前差异已全部忽略');
    const restore = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('恢复全部'));
    act(() => restore?.click());
    expect(events).toEqual(['restoreAll']);
  });

  it('locks body scrolling, traps focus, closes, and restores focus', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const entry = item('diff-2', 2);
    const onClose = () => undefined;
    const view = renders.render(<IgnoredDiffModal open={false} items={[entry]} onClose={onClose} onLocate={() => undefined} onRestore={() => undefined} onRestoreAll={() => undefined} />);
    view.rerender(<IgnoredDiffModal open items={[entry]} onClose={onClose} onLocate={() => undefined} onRestore={() => undefined} onRestoreAll={() => undefined} />);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(document.body.querySelector('.ignored-diff-close'));
    view.rerender(<IgnoredDiffModal open={false} items={[entry]} onClose={onClose} onLocate={() => undefined} onRestore={() => undefined} onRestoreAll={() => undefined} />);
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('runs ignored-difference actions and closes from the backdrop and Escape', () => {
    const events: string[] = [];
    renders.render(<IgnoredDiffModal open items={[item('diff-2', 2)]} onClose={() => events.push('close')} onLocate={(id) => events.push(`locate:${id}`)} onRestore={(id) => events.push(`restore:${id}`)} onRestoreAll={() => events.push('restoreAll')} />);

    act(() => document.body.querySelector<HTMLButtonElement>('.ignored-diff-row-actions button')?.click());
    act(() => document.body.querySelector<HTMLButtonElement>('.ignored-diff-row-actions .restore')?.click());
    act(() => document.body.querySelector<HTMLButtonElement>('.ignored-diff-restore-all')?.click());
    act(() => document.body.querySelector<HTMLElement>('.ignored-diff-overlay')?.click());
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    expect(document.body.textContent).toContain('旧条款');
    expect(events).toEqual(['locate:diff-2', 'restore:diff-2', 'restoreAll', 'close', 'close']);
  });

  it('renders layout-noise metadata and closes from every supported control', () => {
    const closes: string[] = [];
    renders.render(<LayoutNoiseModal open total={3} items={[{ side: 'original', reason: 'hint', source: 'native', count: 3, text: '内部资料' }]} onClose={() => closes.push('close')} />);

    expect(document.body.textContent).toContain('内部资料');
    expect(document.body.textContent).toContain('x3');
    expect(document.body.querySelector('.layout-noise-source')).toBeTruthy();

    act(() => document.body.querySelector<HTMLButtonElement>('.layout-noise-panel__close')?.click());
    act(() => document.body.querySelector<HTMLElement>('.layout-noise-overlay')?.click());
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(closes).toEqual(['close', 'close', 'close']);
  });

  it('selects, clears, locates, and submits a similar-difference batch', () => {
    const ignored: string[][] = [];
    const events: string[] = [];
    renders.render(<SimilarDiffModal open current={item('diff-1', 1)} items={[{ ...item('diff-2', 2), similarity: 0.9 }]} onClose={() => events.push('close')} onLocate={(id) => events.push(`locate:${id}`)} onIgnore={(ids) => ignored.push(ids)} />);

    const toggleAll = document.body.querySelector<HTMLButtonElement>('.similar-diff-footer .secondary');
    const submit = document.body.querySelector<HTMLButtonElement>('.similar-diff-footer .primary');
    act(() => toggleAll?.click());
    expect(submit?.disabled).toBe(true);
    act(() => toggleAll?.click());
    act(() => document.body.querySelector<HTMLButtonElement>('.similar-diff-locate')?.click());
    act(() => document.body.querySelector<HTMLButtonElement>('.similar-diff-footer .primary')?.click());
    expect(ignored).toEqual([['diff-1', 'diff-2']]);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(events).toEqual(['locate:diff-2', 'close']);
  });
});

function item(id: string, index: number) {
  return { id, index, kind: 'modified' as const, originalPreview: '旧条款', revisedPreview: '新条款' };
}

function summary(): DiffSummary {
  return { total: 3, inserted: 1, deleted: 1, modified: 1, similarity: 0.82, layoutNoiseFiltered: 0, layoutNoiseItems: [] };
}
