import { memo, useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import type { DocumentPaneState, PaneSide } from '@/types/document';
export type { DocumentPaneState, PaneSide } from '@/types/document';

type DocumentPaneProps = {
  side: PaneSide;
  document: DocumentPaneState;
  active: boolean;
  hasResult: boolean;
  comparing: boolean;
  allowFileInput: boolean;
  paneRef: React.RefObject<HTMLDivElement | null>;
  onFile: (side: PaneSide, file: File) => Promise<void>;
  onScroll: (side: PaneSide) => void;
  onDiffInteraction: (event: React.MouseEvent | React.KeyboardEvent) => void;
  onActivate: (side: PaneSide) => void;
};

export default function DocumentPane({ side, document, active, hasResult, comparing, allowFileInput, paneRef, onFile, onScroll, onDiffInteraction, onActivate }: DocumentPaneProps) {
  const { locale, messages: i18n } = useI18n();
  const [dragging, setDragging] = useState(false);
  const copy = i18n.app.documents[side];
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const sideClass = side === 'A' ? 'side-original' : 'side-revision';
  const statusLabel = i18n.documentPane.status[document.status];
  const fileSize = document.size <= 0
    ? ''
    : document.size < 1024 * 1024
      ? `${Math.max(1, Math.round(document.size / 1024))} KB`
      : `${(document.size / 1024 / 1024).toFixed(1)} MB`;
  const meta = [
    fileSize,
    document.textLength > 0 ? i18n.documentPane.textLength(numberFormatter.format(document.textLength), document.textLength) : '',
    document.imageCount > 0 ? i18n.documentPane.imageCount(numberFormatter.format(document.imageCount), document.imageCount) : ''
  ].filter(Boolean).join(' · ');

  function selectFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    if (file) void onFile(side, file);
    input.value = '';
  }

  function dropFile(event: React.DragEvent<HTMLDivElement>): void {
    setDragging(false);
    if (!allowFileInput) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void onFile(side, file);
  }

  function leaveDropZone(event: React.DragEvent<HTMLDivElement>): void {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setDragging(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && event.target.closest('[data-diff-id]')) {
      event.preventDefault();
      onDiffInteraction(event);
    }
  }

  return (
    <section className={`view-dock-panel ${sideClass} ${hasResult ? (active ? 'mobile-pane-active' : 'mobile-pane-inactive') : ''}`}>
      <div className="dock-banner">
        <div className="banner-title-area">
          <span className="bullet" />
          <span className="main-title">{copy.title}</span>
          {document.name ? (
            <div className="file-badge-inline" title={document.name}>
              <svg className="icon-file" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              <span className="file-name-text">{document.name}</span>
            </div>
          ) : <span className="file-badge-empty">{copy.emptyLabel}</span>}
        </div>
        {document.name && (
          <div className="indicator-group">
            <span className={`status-chip ${document.status}`}>{statusLabel}</span>
            {document.warnings.length > 0 && (
              <div className="warning-chip" tabIndex={0}>
                <span className="status-chip warning"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>{document.warnings.length}</span>
                <div className="warning-popover" role="tooltip"><strong>{i18n.documentPane.conversionWarnings}</strong><ul>{document.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>
              </div>
            )}
            {allowFileInput && (
              <label className="reupload-trigger" title={copy.reuploadTitle} aria-label={copy.reuploadTitle}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" /></svg>
                <span>{i18n.documentPane.changeDocument}</span>
                <input type="file" accept=".docx" onChange={(event) => selectFile(event.currentTarget)} />
              </label>
            )}
          </div>
        )}
      </div>

      <div
        ref={paneRef}
        className={`render-viewport ${!hasResult ? 'is-empty' : ''} ${allowFileInput && dragging ? 'is-dragging' : ''}`}
        onScroll={() => onScroll(side)}
        onClick={onDiffInteraction}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => onActivate(side)}
        onWheel={() => onActivate(side)}
        onPointerDown={() => onActivate(side)}
        onTouchStart={() => onActivate(side)}
        onDragEnter={(event) => { event.preventDefault(); if (allowFileInput) setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); if (allowFileInput) setDragging(true); }}
        onDragLeave={(event) => { event.preventDefault(); leaveDropZone(event); }}
        onDrop={(event) => { event.preventDefault(); dropFile(event); }}
      >
        {!document.name && allowFileInput ? (
          <label className={`pane-upload-zone ${dragging ? 'dragging' : ''}`} aria-label={copy.uploadTitle}>
            <div className="upload-icon-box"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></div>
            <h3>{copy.uploadTitle}</h3>
            <p>{copy.uploadHint}</p>
            <small>{i18n.documentPane.uploadSupport}</small>
            <input type="file" accept=".docx" onChange={(event) => selectFile(event.currentTarget)} />
          </label>
        ) : !document.name ? (
          <div className="pane-waiting-zone"><div className="waiting-card"><div className="pulse-dot" /><p>{copy.externalWaitingText}</p></div></div>
        ) : !hasResult ? (
          <div className="pane-waiting-zone">
            {document.status === 'parsing' || comparing ? (
              <div className="loading-spinner-wrapper"><div className="spinner-large" /><p>{document.status === 'parsing' ? i18n.documentPane.parsing : i18n.documentPane.comparing}</p></div>
            ) : document.status === 'error' ? (
              <div className="state-card error" role="alert"><div className="state-icon">!</div><div><strong>{i18n.documentPane.failedTitle}</strong><p>{document.error}</p></div></div>
            ) : (
              <div className="waiting-card"><div className="pulse-dot" /><p><span>{copy.waitingText}</span>{meta && <small>{meta}</small>}</p></div>
            )}
          </div>
        ) : (
          <DocumentHtml html={document.highlightedHtml} />
        )}
      </div>
    </section>
  );
}

const DocumentHtml = memo(function DocumentHtml({ html }: { html: string }) {
  return <div className="docx-render-content" dangerouslySetInnerHTML={{ __html: html }} />;
});
