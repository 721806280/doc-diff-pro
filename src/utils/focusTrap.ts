const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export type FocusTrap = {
  activate: (container: HTMLElement | null) => void;
  deactivate: (options?: { restoreFocus?: boolean }) => void;
  handleKeydown: (event: KeyboardEvent) => void;
};

export function createFocusTrap(): FocusTrap {
  let container: HTMLElement | null = null;
  let previousFocus: HTMLElement | null = null;

  function activate(nextContainer: HTMLElement | null): void {
    if (!nextContainer || typeof document === 'undefined') return;

    container = nextContainer;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    focusInitialElement(container);
  }

  function deactivate(options: { restoreFocus?: boolean } = {}): void {
    const focusTarget = previousFocus;
    container = null;
    previousFocus = null;

    if (options.restoreFocus !== false && focusTarget?.isConnected) {
      focusTarget.focus({ preventScroll: true });
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !container) return;

    const focusableElements = getFocusableElements(container);
    if (focusableElements.length === 0) {
      event.preventDefault();
      container.focus({ preventScroll: true });
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    if (!first || !last) return;

    if (event.shiftKey && (activeElement === first || !container.contains(activeElement))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
      return;
    }

    if (
      !event.shiftKey &&
      (activeElement === last || activeElement === container || !container.contains(activeElement))
    ) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  return { activate, deactivate, handleKeydown };
}

function focusInitialElement(container: HTMLElement): void {
  const focusTarget = getFocusableElements(container)[0] ?? container;

  if (!container.hasAttribute('tabindex')) {
    container.tabIndex = -1;
  }

  focusTarget.focus({ preventScroll: true });
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisibleFocusableElement);
}

function isVisibleFocusableElement(element: HTMLElement): boolean {
  if (
    element.tabIndex < 0 ||
    element.matches(':disabled') ||
    element.closest('[hidden], [inert], [aria-hidden="true"]')
  )
    return false;

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  // A child of display:none still reports its own display value. Such controls
  // must not become the trap's first or last stop when a pane is hidden.
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (window.getComputedStyle(parent).display === 'none') return false;
  }
  return true;
}
