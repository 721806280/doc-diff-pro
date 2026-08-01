import { useEffect } from 'react';
import { resolveReviewShortcut } from '@/utils/diffReview';
import { useLatestRef } from './useLatestRef';

type ReviewShortcutOptions = {
  enabled: boolean;
  canIgnore: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToggleIgnore: () => void;
};

export function useReviewShortcuts(options: ReviewShortcutOptions): void {
  // Callers pass inline handlers, so the listener is registered once and reads
  // the newest options at keypress time instead of re-subscribing per render.
  const latestOptions = useLatestRef(options);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const current = latestOptions.current;
      if (
        !current.enabled ||
        event.defaultPrevented ||
        event.isComposing ||
        document.querySelector('[aria-modal="true"]')
      )
        return;
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;

      const shortcut = resolveReviewShortcut(event);
      if (shortcut === 'previous') {
        event.preventDefault();
        current.onPrevious();
      } else if (shortcut === 'next') {
        event.preventDefault();
        current.onNext();
      } else if (shortcut === 'toggle-ignore' && current.canIgnore) {
        event.preventDefault();
        current.onToggleIgnore();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [latestOptions]);
}
