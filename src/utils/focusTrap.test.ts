import { afterEach, describe, expect, it } from 'vitest';
import { createFocusTrap } from './focusTrap';

describe('focusTrap', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses the first control and restores the previous focus', () => {
    const trigger = document.createElement('button');
    const container = createContainer();
    document.body.append(trigger, container);
    trigger.focus();

    const trap = createFocusTrap();
    trap.activate(container);

    expect(document.activeElement).toBe(container.querySelector('#first'));

    trap.deactivate();

    expect(document.activeElement).toBe(trigger);
  });

  it('keeps tab navigation inside the active container', () => {
    const container = createContainer();
    document.body.append(container);

    const trap = createFocusTrap();
    trap.activate(container);

    const first = container.querySelector<HTMLButtonElement>('#first');
    const last = container.querySelector<HTMLButtonElement>('#last');
    expect(first).toBeTruthy();
    expect(last).toBeTruthy();

    last?.focus();
    const forwardEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    });
    trap.handleKeydown(forwardEvent);

    expect(forwardEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const backwardEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    trap.handleKeydown(backwardEvent);

    expect(backwardEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('handles empty, hidden, and outside focus targets', () => {
    const empty = document.createElement('section');
    document.body.append(empty);
    const trap = createFocusTrap();
    trap.activate(empty);
    expect(document.activeElement).toBe(empty);

    const hiddenContainer = document.createElement('section');
    hiddenContainer.innerHTML = '<button id="hidden">Hidden</button><button id="visible">Visible</button>';
    document.body.append(hiddenContainer);
    const hidden = hiddenContainer.querySelector('#hidden') as HTMLElement;
    hidden.style.display = 'none';
    trap.activate(hiddenContainer);
    expect(document.activeElement?.id).toBe('visible');

    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    trap.handleKeydown(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('visible');
    trap.deactivate({ restoreFocus: false });
  });

  it('ignores activation and non-tab events when inactive', () => {
    const trap = createFocusTrap();
    expect(() => trap.activate(null)).not.toThrow();
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    trap.handleKeydown(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

function createContainer(): HTMLElement {
  const container = document.createElement('section');
  container.innerHTML = `
    <button id="first" type="button">First</button>
    <button id="last" type="button">Last</button>
  `;
  return container;
}
