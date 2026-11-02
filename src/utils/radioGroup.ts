import type { KeyboardEvent } from 'react';

/** Arrow keys select and focus an option; Tab is reserved for leaving the group. */
export function handleRadioGroupKeyDown(event: KeyboardEvent<HTMLElement>): void {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
  if (!['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  if (!(event.target instanceof Element)) return;

  const current = event.target.closest<HTMLButtonElement>('button[role="radio"]');
  const group = event.currentTarget;
  if (!current || current.closest('[role="radiogroup"]') !== group) return;
  const options = Array.from(group.querySelectorAll<HTMLButtonElement>('button[role="radio"]:not(:disabled)')).filter(
    (option) => option.closest('[role="radiogroup"]') === group
  );
  const index = options.indexOf(current);
  if (index < 0) return;

  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
  event.preventDefault();
  const next = options[nextIndex]!;
  next.focus();
  if (next !== current) next.click();
}
