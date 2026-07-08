import { afterEach, describe, expect, it } from 'vitest';
import { createBodyScrollLock } from './bodyScrollLock';

describe('bodyScrollLock', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('keeps body locked until every owner releases it', () => {
    document.body.style.overflow = 'auto';
    const first = createBodyScrollLock();
    const second = createBodyScrollLock();

    first.lock();
    second.lock();
    expect(document.body.style.overflow).toBe('hidden');

    first.release();
    expect(document.body.style.overflow).toBe('hidden');

    second.release();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('is safe to release more than once', () => {
    const lock = createBodyScrollLock();

    lock.lock();
    lock.release();
    lock.release();

    expect(document.body.style.overflow).toBe('');
  });

  it('does not change body overflow when an unlocked owner releases', () => {
    document.body.style.overflow = 'auto';

    createBodyScrollLock().release();

    expect(document.body.style.overflow).toBe('auto');
  });
});
