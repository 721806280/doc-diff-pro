const activeLocks = new Set<symbol>();
let previousOverflow = '';

export function createBodyScrollLock(): {
  lock: () => void;
  release: () => void;
} {
  const token = Symbol('body-scroll-lock');

  return {
    lock() {
      setBodyScrollLock(token, true);
    },
    release() {
      setBodyScrollLock(token, false);
    }
  };
}

function setBodyScrollLock(token: symbol, locked: boolean): void {
  if (typeof document === 'undefined') return;

  if (locked) {
    if (activeLocks.size === 0) previousOverflow = document.body.style.overflow;
    activeLocks.add(token);
    document.body.style.overflow = 'hidden';
    return;
  }

  if (!activeLocks.has(token)) return;

  activeLocks.delete(token);
  if (activeLocks.size === 0) {
    document.body.style.overflow = previousOverflow;
    previousOverflow = '';
  }
}
