import { memo, useEffect, useMemo, useRef, useState, type RefObject, type MouseEvent, type KeyboardEvent } from 'react';
import { useI18n } from '@/i18n';
import type { DocumentPaneState, PaneSide } from '@/types/document';
export type { DocumentPaneState, PaneSide } from '@/types/document';

export type ImagePreview = {
  src: string;
  alt: string;
};

type DocumentPaneProps = {
  side: PaneSide;
  document: DocumentPaneState;
  active: boolean;
  hasResult: boolean;
  comparing: boolean;
  allowFileInput: boolean;
  paneRef: RefObject<HTMLDivElement | null>;
  onFile: (side: PaneSide, file: File) => Promise<void>;
  onScroll: (side: PaneSide) => void;
  onDiffInteraction: (event: MouseEvent | KeyboardEvent) => void;
  onImagePreview: (side: PaneSide, image: ImagePreview) => void;
  onActivate: (side: PaneSide) => void;
};

export default function DocumentPane({
  side,
  document,
  active,
  hasResult,
  comparing,
  allowFileInput,
  paneRef,
  onFile,
  onScroll,
  onDiffInteraction,
  onImagePreview,
  onActivate
}: DocumentPaneProps) {
  const { locale, messages: i18n } = useI18n();
  const [dragging, setDragging] = useState(false);
  const copy = i18n.app.documents[side];
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const sideClass = side === 'A' ? 'side-original' : 'side-revision';
  const statusLabel = i18n.documentPane.status[document.status];
  const fileSize =
    document.size <= 0
      ? ''
      : document.size < 1024 * 1024
        ? `${Math.max(1, Math.round(document.size / 1024))} KB`
        : `${(document.size / 1024 / 1024).toFixed(1)} MB`;
  const meta = [
    fileSize,
    document.textLength > 0
      ? i18n.documentPane.textLength(numberFormatter.format(document.textLength), document.textLength)
      : '',
    document.imageCount > 0
      ? i18n.documentPane.imageCount(numberFormatter.format(document.imageCount), document.imageCount)
      : ''
  ]
    .filter(Boolean)
    .join(' · ');

  // One chip for everything the comparison could not look at, whatever the
  // reason: a reader needs to know the coverage was incomplete far more than they
  // need the categories separated. The breakdown lives in the popover.
  //
  // The sanitizer's refusals and the package scan see the same figures from two
  // sides — an OLE-embedded EMF arrives both as an <img> whose source is stripped
  // and as a `w:object` the scan counts — so only the stripped images the scan
  // cannot already account for are added. Three embedded equations were otherwise
  // reported as five.
  const unaccountedImages = Math.max(0, document.droppedImageCount - document.graphics.embeddedObjects);
  function embeddedObjectReasons(): string[] {
    const { embeddedObjects, embeddedObjectKinds } = document.graphics;
    if (embeddedObjects === 0) return [];
    const intro = i18n.documentPane.embeddedObjectDetail(embeddedObjects);
    const labels = embeddedObjectKinds.map((kind) => i18n.documentPane.embeddedObjectLabel(kind.progId, kind.title));
    return labels.length > 0 ? [intro, ...labels] : [intro];
  }
  const uncomparableReasons = [
    unaccountedImages > 0 ? i18n.documentPane.droppedImageTitle : '',
    document.graphics.nativeGraphics > 0
      ? i18n.documentPane.nativeGraphicsDetail(document.graphics.nativeGraphics)
      : '',
    ...embeddedObjectReasons(),
    document.graphics.formulas > 0 ? i18n.documentPane.formulaDetail(document.graphics.formulas) : ''
  ].filter(Boolean);
  // The conversion renders every revision as accepted, so two documents that still
  // carry tracked changes are compared in their accepted states. That is the right
  // state to compare; not saying so is what makes it a trap.
  const revisionCount = document.revisions.insertions + document.revisions.deletions;
  const uncomparableCount =
    unaccountedImages +
    document.graphics.nativeGraphics +
    document.graphics.embeddedObjects +
    document.graphics.formulas;

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
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const image = event.target instanceof HTMLImageElement ? event.target : null;
    if (image?.src) {
      event.preventDefault();
      if (image.closest('[data-diff-id]')) onDiffInteraction(event);
      onImagePreview(side, { src: image.currentSrc || image.src, alt: image.alt });
      return;
    }

    if (event.target instanceof Element && event.target.closest('[data-diff-id]')) {
      event.preventDefault();
      onDiffInteraction(event);
    }
  }

  function handleClick(event: React.MouseEvent<HTMLDivElement>): void {
    const image = event.target instanceof HTMLImageElement ? event.target : null;
    if (image?.src) {
      event.preventDefault();
      if (image.closest('[data-diff-id]')) onDiffInteraction(event);
      onImagePreview(side, { src: image.currentSrc || image.src, alt: image.alt });
      return;
    }
    onDiffInteraction(event);
  }

  return (
    <section
      className={`view-dock-panel ${sideClass} ${hasResult ? (active ? 'mobile-pane-active' : 'mobile-pane-inactive') : ''}`}
    >
      <div className="dock-banner">
        <div className="banner-title-area">
          <span className="bullet" />
          <span className="main-title">{copy.title}</span>
          {document.name ? (
            <div className="file-badge-inline" title={document.name}>
              <svg
                className="icon-file"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="file-name-text">{document.name}</span>
            </div>
          ) : (
            <span className="file-badge-empty">{copy.emptyLabel}</span>
          )}
        </div>
        {document.name && (
          <div className="indicator-group">
            <span className={`status-chip ${document.status}`}>{statusLabel}</span>
            {document.warnings.length > 0 && (
              <div className="warning-chip" tabIndex={0}>
                <span className="status-chip warning">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  </svg>
                  {document.warnings.length}
                </span>
                <div className="warning-popover" role="tooltip">
                  <strong>{i18n.documentPane.conversionWarnings}</strong>
                  <ul>
                    {document.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {uncomparableCount > 0 && (
              <div className="warning-chip uncomparable" tabIndex={0}>
                <span className="status-chip warning">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="m3 16 5-5 4 4M14 14l2-2 5 5" />
                  </svg>
                  {uncomparableCount}
                </span>
                <div className="warning-popover" role="tooltip">
                  <strong>{i18n.documentPane.droppedImageCount(uncomparableCount)}</strong>
                  <ul>
                    {uncomparableReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {revisionCount > 0 && (
              <div className="warning-chip revisions" tabIndex={0}>
                <span className="status-chip neutral">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  {revisionCount}
                </span>
                <div className="warning-popover" role="tooltip">
                  <strong>{i18n.documentPane.revisionCount(revisionCount)}</strong>
                  <ul>
                    <li>{i18n.documentPane.revisionTitle}</li>
                    <li>
                      {i18n.documentPane.revisionBreakdown(document.revisions.insertions, document.revisions.deletions)}
                    </li>
                  </ul>
                </div>
              </div>
            )}
            {allowFileInput && (
              <label className="reupload-trigger" title={copy.reuploadTitle} aria-label={copy.reuploadTitle}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
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
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => onActivate(side)}
        onWheel={() => onActivate(side)}
        onPointerDown={() => onActivate(side)}
        onTouchStart={() => onActivate(side)}
        onDragEnter={(event) => {
          event.preventDefault();
          if (allowFileInput) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (allowFileInput) setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          leaveDropZone(event);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dropFile(event);
        }}
      >
        {!document.name && allowFileInput ? (
          // The whole empty pane is the drop target, so it is also the click
          // target: the label stretches across it and only the card is drawn.
          <label className={`pane-upload-shell ${dragging ? 'dragging' : ''}`} aria-label={copy.uploadTitle}>
            <div className="pane-upload-zone">
              <span className="upload-icon-box" aria-hidden="true">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 16V4" />
                  <path d="M8 8l4-4 4 4" />
                  <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                </svg>
              </span>
              <h3>{copy.uploadTitle}</h3>
              <p>{copy.uploadHint}</p>
              <span className="pane-upload-action">{i18n.documentPane.uploadAction}</span>
              <small>{i18n.documentPane.uploadSupport}</small>
            </div>
            <input type="file" accept=".docx" onChange={(event) => selectFile(event.currentTarget)} />
          </label>
        ) : !document.name ? (
          <div className="pane-waiting-zone">
            <div className="waiting-card">
              <div className="pulse-dot" />
              <p>{copy.externalWaitingText}</p>
            </div>
          </div>
        ) : !hasResult ? (
          <div className="pane-waiting-zone">
            {document.status === 'parsing' || comparing ? (
              <div className="loading-spinner-wrapper">
                <div className="spinner-large" />
                <p>{document.status === 'parsing' ? i18n.documentPane.parsing : i18n.documentPane.comparing}</p>
              </div>
            ) : document.status === 'error' ? (
              <div className="state-card error" role="alert">
                <div className="state-icon">!</div>
                <div>
                  <strong>{i18n.documentPane.failedTitle}</strong>
                  <p>{document.error}</p>
                </div>
              </div>
            ) : (
              <div className="waiting-card">
                <div className="pulse-dot" />
                <p>
                  <span>{copy.waitingText}</span>
                  {meta && <small>{meta}</small>}
                </p>
              </div>
            )}
          </div>
        ) : (
          <DocumentHtml html={document.highlightedHtml} imagePreviewLabel={i18n.documentPane.imagePreviewLabel} />
        )}
      </div>
    </section>
  );
}

const DocumentHtml = memo(function DocumentHtml({
  html,
  imagePreviewLabel
}: {
  html: string;
  imagePreviewLabel: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const images = contentRef.current?.querySelectorAll<HTMLImageElement>('img[src]');
    images?.forEach((image) => {
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', image.alt ? `${imagePreviewLabel}: ${image.alt}` : imagePreviewLabel);
    });
  }, [html, imagePreviewLabel]);

  return <div ref={contentRef} className="docx-render-content" dangerouslySetInnerHTML={{ __html: html }} />;
});
