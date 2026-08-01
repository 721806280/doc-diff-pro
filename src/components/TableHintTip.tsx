import type { I18nMessages } from '@/i18n/messages';
import type { DiffTableContextHint } from '@/types/diff';

type TableHintTipProps = {
  hint: DiffTableContextHint | null;
  open: boolean;
  i18n: I18nMessages;
  onHoldOpen: () => void;
  onDismiss: () => void;
};

export default function TableHintTip({ hint, open, i18n, onHoldOpen, onDismiss }: TableHintTipProps) {
  if (!hint || !open) return null;

  return (
    <div
      id="table-hint-panel"
      className="table-hint-tip"
      role="status"
      aria-live="polite"
      onMouseEnter={onHoldOpen}
      onMouseLeave={onDismiss}
    >
      <span>{formatTableHint(hint, i18n)}</span>
      <button
        type="button"
        className="table-hint-tip__close"
        aria-label={i18n.diffNavigator.closeDetails}
        title={i18n.diffNavigator.closeDetails}
        onClick={onDismiss}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export function formatTableHint(hint: DiffTableContextHint, i18n: I18nMessages): string {
  const messages = i18n.diffNavigator.tableHintMessages;
  const row = formatRowRange(hint);

  if (hint.kind === 'single-row-inserted') return messages.singleRowInserted(hint.tableNumber, row);
  if (hint.kind === 'single-row-deleted') return messages.singleRowDeleted(hint.tableNumber, row);
  if (hint.kind === 'row-content-shift') {
    const side = hint.candidateSide ? i18n.diffNavigator.tableHintSides[hint.candidateSide] : '';
    return messages.rowContentShift(hint.tableNumber, side, row);
  }
  return messages.cellCountMismatch(hint.tableNumber, row);
}

function formatRowRange(hint: DiffTableContextHint): string {
  if (hint.candidateRow === undefined) return '';
  if (hint.candidateRowEnd && hint.candidateRowEnd !== hint.candidateRow) {
    return `${hint.candidateRow}-${hint.candidateRowEnd}`;
  }
  return String(hint.candidateRow);
}
