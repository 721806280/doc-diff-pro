import { describe, expect, it, vi } from 'vitest';
import { guardDocumentSessionUnload } from './documentSession';

describe('guardDocumentSessionUnload', () => {
  it('requests confirmation only for an active document session', () => {
    const inactiveEvent = createBeforeUnloadEvent();
    guardDocumentSessionUnload(inactiveEvent.event, false);
    expect(inactiveEvent.preventDefault).not.toHaveBeenCalled();

    const activeEvent = createBeforeUnloadEvent();
    guardDocumentSessionUnload(activeEvent.event, true);
    expect(activeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(activeEvent.event.returnValue).toBe('');
  });
});

function createBeforeUnloadEvent() {
  const preventDefault = vi.fn();
  const event = { preventDefault, returnValue: undefined } as unknown as BeforeUnloadEvent;
  return { event, preventDefault };
}
