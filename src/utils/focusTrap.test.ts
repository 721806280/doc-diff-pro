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
});

function createContainer(): HTMLElement {
  const container = document.createElement('section');
  container.innerHTML = `
    <button id="first" type="button">First</button>
    <button id="last" type="button">Last</button>
  `;
  return container;
}
