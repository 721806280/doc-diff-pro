import { useEffect, useMemo, type RefObject } from 'react';
import { createBodyScrollLock } from '@/utils/bodyScrollLock';
import { createFocusTrap } from '@/utils/focusTrap';
import { useLatestRef } from './useLatestRef';

export function useDialog(open: boolean, panelRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  const bodyLock = useMemo(createBodyScrollLock, []);
  const focusTrap = useMemo(createFocusTrap, []);
  const onCloseRef = useLatestRef(onClose);

  useEffect(() => {
    if (!open) return;
    bodyLock.lock();
    focusTrap.activate(panelRef.current);
    return () => {
      focusTrap.deactivate();
      bodyLock.release();
    };
  }, [bodyLock, focusTrap, open, panelRef]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      focusTrap.handleKeydown(event);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusTrap, onCloseRef, open]);
}
