export default function CompareToast({ message, comparing }: { message: string; comparing: boolean }) {
  if (!message) return null;
  return (
    <div className="compare-toast" role="status" aria-live="polite" aria-atomic="true">
      <div className={`compare-toast-dot ${comparing ? '' : 'done'}`} />
      <span>{message}</span>
    </div>
  );
}
