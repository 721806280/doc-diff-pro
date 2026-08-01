import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReviewShortcuts } from './useReviewShortcuts';

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });
}

function mountShortcuts(overrides: { enabled?: boolean; canIgnore?: boolean } = {}) {
  const onPrevious = vi.fn();
  const onNext = vi.fn();
  const onToggleIgnore = vi.fn();
  const view = renderHook(
    (props: { enabled: boolean; canIgnore: boolean }) =>
      useReviewShortcuts({
        enabled: props.enabled,
        canIgnore: props.canIgnore,
        onPrevious,
        onNext,
        onToggleIgnore
      }),
    { initialProps: { enabled: overrides.enabled ?? true, canIgnore: overrides.canIgnore ?? true } }
  );
  return { ...view, onPrevious, onNext, onToggleIgnore };
}

describe('useReviewShortcuts', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('maps Alt+ArrowUp and Alt+ArrowDown to previous and next', () => {
    const { onPrevious, onNext } = mountShortcuts();

    press('ArrowUp', { altKey: true });
    press('ArrowDown', { altKey: true });

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('maps the i key to the ignore toggle', () => {
    const { onToggleIgnore } = mountShortcuts();

    press('i');

    expect(onToggleIgnore).toHaveBeenCalledTimes(1);
  });

  it('does not toggle ignore when ignoring is unavailable', () => {
    const { onToggleIgnore } = mountShortcuts({ canIgnore: false });

    press('i');

    expect(onToggleIgnore).not.toHaveBeenCalled();
  });

  it('stays inert while disabled', () => {
    const { onNext } = mountShortcuts({ enabled: false });

    press('ArrowDown', { altKey: true });

    expect(onNext).not.toHaveBeenCalled();
  });

  // The listener is registered once with an empty dependency array and reads
  // options through a ref, so prop updates must still be observed.
  it('observes option changes without re-registering the listener', () => {
    const view = mountShortcuts({ enabled: false });

    press('ArrowDown', { altKey: true });
    expect(view.onNext).not.toHaveBeenCalled();

    view.rerender({ enabled: true, canIgnore: true });
    press('ArrowDown', { altKey: true });

    expect(view.onNext).toHaveBeenCalledTimes(1);
  });

  it('ignores shortcuts typed inside form controls', () => {
    const input = document.createElement('input');
    document.body.append(input);
    const { onToggleIgnore, onNext } = mountShortcuts();

    press('i', {}, input);
    press('ArrowDown', { altKey: true }, input);

    expect(onToggleIgnore).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('ignores shortcuts while a modal dialog is open', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    const { onNext } = mountShortcuts();

    press('ArrowDown', { altKey: true });

    expect(onNext).not.toHaveBeenCalled();
  });

  it('ignores shortcuts combined with other modifiers', () => {
    const { onNext, onToggleIgnore } = mountShortcuts();

    press('ArrowDown', { altKey: true, shiftKey: true });
    press('i', { ctrlKey: true });
    press('i', { metaKey: true });

    expect(onNext).not.toHaveBeenCalled();
    expect(onToggleIgnore).not.toHaveBeenCalled();
  });

  it('stops listening after unmount', () => {
    const view = mountShortcuts();
    view.unmount();

    press('ArrowDown', { altKey: true });

    expect(view.onNext).not.toHaveBeenCalled();
  });
});
