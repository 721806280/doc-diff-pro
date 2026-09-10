import { useI18n } from '@/i18n';

export default function CompareToast({
  message,
  comparing,
  onCancel
}: {
  message: string;
  comparing: boolean;
  onCancel?: () => void;
}) {
  const { messages: i18n } = useI18n();
  if (!message) return null;
  return (
    <div className="compare-toast" role="status" aria-live="polite" aria-atomic="true">
      <div className={`compare-toast-dot ${comparing ? '' : 'done'}`} />
      <span>{message}</span>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          {i18n.app.cancelProcessing}
        </button>
      )}
    </div>
  );
}
