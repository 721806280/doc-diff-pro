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

  // A dialog can be open before it has any controls — a list still loading, or
  // one whose only button is disabled. Tab has to stay inside it anyway, or the
  // reader lands behind the overlay with no way back.
  it('parks focus on a container with nothing focusable in it', () => {
    const empty = document.createElement('section');
    empty.innerHTML = '<p>Loading…</p><button disabled>Restore</button>';
    document.body.append(empty);

    const trap = createFocusTrap();
    trap.activate(empty);
    expect(document.activeElement).toBe(empty);

    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    trap.handleKeydown(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(empty);
  });

  it('ignores activation and non-tab events when inactive', () => {
    const trap = createFocusTrap();
    expect(() => trap.activate(null)).not.toThrow();
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    trap.handleKeydown(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('excludes negative tab stops and controls in hidden or disabled ancestors', () => {
    const container = document.createElement('section');
    container.innerHTML = `
      <button tabindex="-1">Unselected option</button>
      <fieldset disabled><button>Disabled by fieldset</button></fieldset>
      <div hidden><button>Hidden ancestor</button></div>
      <div style="display: none"><button>Hidden by CSS</button></div>
      <div inert><button>Inert ancestor</button></div>
      <div aria-hidden="true"><button>Hidden from assistive technology</button></div>
      <button id="first">First</button>
      <button id="last">Last selected option</button>
      <button tabindex="-1">Last unselected option</button>
    `;
    document.body.append(container);
    const trap = createFocusTrap();
    trap.activate(container);
    const first = container.querySelector<HTMLButtonElement>('#first')!;
    const last = container.querySelector<HTMLButtonElement>('#last')!;
    expect(document.activeElement).toBe(first);

    last.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    trap.handleKeydown(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    trap.handleKeydown(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('brings forward tab navigation back from outside or the container itself', () => {
    const container = createContainer();
    const outside = document.createElement('button');
    document.body.append(container, outside);
    const trap = createFocusTrap();
    trap.activate(container);
    for (const target of [outside, container]) {
      target.focus();
      const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
      trap.handleKeydown(event);
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(container.querySelector('#first'));
    }
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
