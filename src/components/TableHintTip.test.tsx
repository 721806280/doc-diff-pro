import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '@/i18n';
import { messages } from '@/i18n/messages';
import type { DiffTableContextHint } from '@/types/diff';
import { createRenderRegistry } from '@/test-utils/renderReact';
import TableHintTip, { formatTableHint } from './TableHintTip';

const renders = createRenderRegistry();
const i18n = messages['zh-CN'];

function hintWith(overrides: Partial<DiffTableContextHint> = {}): DiffTableContextHint {
  return {
    kind: 'single-row-inserted',
    confidence: 'high',
    tableNumber: 2,
    originalRows: 4,
    revisedRows: 5,
    candidateRow: 3,
    ...overrides
  };
}

beforeEach(() => setLocale('zh-CN'));

afterEach(() => {
  renders.cleanup();
  setLocale('zh-CN');
});

describe('TableHintTip', () => {
  it('stays out of the document until there is a hint to show', () => {
    const nothing = renders.render(
      <TableHintTip hint={null} open i18n={i18n} onHoldOpen={() => undefined} onDismiss={() => undefined} />
    );
    const closed = renders.render(
      <TableHintTip
        hint={hintWith()}
        open={false}
        i18n={i18n}
        onHoldOpen={() => undefined}
        onDismiss={() => undefined}
      />
    );

    expect(nothing.host.querySelector('.table-hint-tip')).toBeNull();
    expect(closed.host.querySelector('.table-hint-tip')).toBeNull();
  });

  it('announces the hint politely and labels its close control', () => {
    const { host } = renders.render(
      <TableHintTip hint={hintWith()} open i18n={i18n} onHoldOpen={() => undefined} onDismiss={() => undefined} />
    );
    const panel = host.querySelector('.table-hint-tip');

    expect(panel?.getAttribute('role')).toBe('status');
    expect(panel?.getAttribute('aria-live')).toBe('polite');
    expect(panel?.textContent).toContain(formatTableHint(hintWith(), i18n));
    expect(host.querySelector('.table-hint-tip__close')?.getAttribute('aria-label')).toBe(
      i18n.diffNavigator.closeDetails
    );
  });

  it('holds open while pointed at and dismisses on leave or close', () => {
    const events: string[] = [];
    const { host } = renders.render(
      <TableHintTip
        hint={hintWith()}
        open
        i18n={i18n}
        onHoldOpen={() => events.push('hold')}
        onDismiss={() => events.push('dismiss')}
      />
    );
    const panel = host.querySelector('.table-hint-tip')!;

    panel.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    panel.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    host.querySelector<HTMLButtonElement>('.table-hint-tip__close')!.click();

    expect(events).toEqual(['hold', 'dismiss', 'dismiss']);
  });
});

describe('formatTableHint', () => {
  it('describes an inserted and a deleted row', () => {
    expect(formatTableHint(hintWith({ kind: 'single-row-inserted' }), i18n)).toBe(
      i18n.diffNavigator.tableHintMessages.singleRowInserted(2, '3')
    );
    expect(formatTableHint(hintWith({ kind: 'single-row-deleted' }), i18n)).toBe(
      i18n.diffNavigator.tableHintMessages.singleRowDeleted(2, '3')
    );
  });

  it('names the side a row shifted towards', () => {
    const hint = hintWith({ kind: 'row-content-shift', candidateSide: 'revised' });

    expect(formatTableHint(hint, i18n)).toBe(
      i18n.diffNavigator.tableHintMessages.rowContentShift(2, i18n.diffNavigator.tableHintSides.revised, '3')
    );
  });

  it('leaves the side blank when the shift has no candidate', () => {
    const hint = hintWith({ kind: 'row-content-shift' });

    expect(formatTableHint(hint, i18n)).toBe(i18n.diffNavigator.tableHintMessages.rowContentShift(2, '', '3'));
  });

  it('renders a multi-row span as a range and a missing row as blank', () => {
    const range = hintWith({ kind: 'cell-count-mismatch', candidateRow: 3, candidateRowEnd: 5 });
    const single = hintWith({ kind: 'cell-count-mismatch', candidateRow: 3, candidateRowEnd: 3 });
    const missing = hintWith({ kind: 'cell-count-mismatch', candidateRow: undefined });

    expect(formatTableHint(range, i18n)).toBe(i18n.diffNavigator.tableHintMessages.cellCountMismatch(2, '3-5'));
    expect(formatTableHint(single, i18n)).toBe(i18n.diffNavigator.tableHintMessages.cellCountMismatch(2, '3'));
    expect(formatTableHint(missing, i18n)).toBe(i18n.diffNavigator.tableHintMessages.cellCountMismatch(2, ''));
  });
});
