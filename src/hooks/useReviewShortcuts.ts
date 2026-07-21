import { useEffect, useRef } from 'react';
import { resolveReviewShortcut } from '@/utils/diffReview';

type ReviewShortcutOptions = {
  enabled: boolean;
  canIgnore: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToggleIgnore: () => void;
};

export function useReviewShortcuts(options: ReviewShortcutOptions): void {
  const latestOptions = useRef(options);
  latestOptions.current = options;

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const current = latestOptions.current;
      if (!current.enabled || event.defaultPrevented || event.isComposing || document.querySelector('[aria-modal="true"]')) return;
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
  }, []);
}
