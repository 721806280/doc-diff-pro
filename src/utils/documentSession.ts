export function guardDocumentSessionUnload(event: BeforeUnloadEvent, hasActiveSession: boolean): void {
  if (!hasActiveSession) return;

  event.preventDefault();
  event.returnValue = '';
}
