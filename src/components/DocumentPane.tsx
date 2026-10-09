import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type MouseEvent,
  type KeyboardEvent
} from 'react';
import { useTimeoutRef } from '@/hooks/useTimeoutRef';
import { useI18n } from '@/i18n';
import type { DocumentPaneState, PaneSide } from '@/types/document';
import { documentCoverage } from '@/utils/documentCoverage';
export type { DocumentPaneState, PaneSide } from '@/types/document';

/**
 * How long after its last scroll event a pane counts as settled again.
 *
 * Long enough to bridge the gaps between trackpad and momentum events, short
 * enough that hover feedback is back by the time the reader reaches for a
 * difference.
 */
const SCROLL_SETTLE_MS = 150;

type DocumentPaneProps = {
  side: PaneSide;
  document: DocumentPaneState;
  active: boolean;
  hasResult: boolean;
  comparing: boolean;
  pendingComparison?: boolean;
  pairReady?: boolean;
  allowFileInput: boolean;
  paneRef: RefObject<HTMLDivElement | null>;
  onFile: (side: PaneSide, file: File) => Promise<void>;
  onScroll: (side: PaneSide) => void;
  onDiffInteraction: (event: MouseEvent | KeyboardEvent) => void;
  onImagePreview: (side: PaneSide, image: HTMLImageElement) => void;
  onActivate: (side: PaneSide) => void;
};

/**
 * Memoized because scrolling re-renders the app on every animation frame to
 * place the difference popover, and the pane's own output does not change with
 * it. Every callback prop is expected to be stable for that to hold.
 */
export default memo(function DocumentPane({
  side,
  document,
  active,
  hasResult,
  comparing,
  pendingComparison = false,
  pairReady = false,
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
  const scrollSettle = useTimeoutRef();
  const copy = i18n.app.documents[side];
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const sideClass = side === 'A' ? 'side-original' : 'side-revision';
  const displayHtml = hasResult
    ? document.highlightedHtml
    : document.status === 'ready' && !comparing && !pendingComparison
      ? document.originalHtml
      : '';
  const statusLabel = i18n.documentPane.status[document.status];
  const meta = useMemo(() => {
    const fileSize =
      document.size <= 0
        ? ''
        : document.size < 1024 * 1024
          ? `${Math.max(1, Math.round(document.size / 1024))} KB`
          : `${(document.size / 1024 / 1024).toFixed(1)} MB`;
    return [
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
  }, [document.imageCount, document.size, document.textLength, i18n, numberFormatter]);

  const {
    unavailable: uncomparableCount,
    reasons: uncomparableReasons,
    revisions: revisionCount
  } = useMemo(() => documentCoverage(document, i18n), [document, i18n]);

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

  /**
   * Flags the viewport while it scrolls so the stylesheet can hold back hover
   * feedback. Set as an attribute rather than state: it changes on every scroll
   * event, and nothing about it needs a render.
   */
  function markScrolling(viewport: HTMLDivElement): void {
    if (!viewport.hasAttribute('data-scrolling')) viewport.setAttribute('data-scrolling', '');
    scrollSettle.set(() => viewport.removeAttribute('data-scrolling'), SCROLL_SETTLE_MS);
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
      onImagePreview(side, image);
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
      image.focus({ preventScroll: true });
      onImagePreview(side, image);
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
              <NoticeChip
                label={i18n.documentPane.conversionWarningCount(document.warnings.length)}
                tone="warning"
                icon={
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  </svg>
                }
                count={document.warnings.length}
                title={i18n.documentPane.conversionWarnings}
                details={document.warnings}
              />
            )}
            {uncomparableCount > 0 && (
              <NoticeChip
                className="uncomparable"
                label={i18n.documentPane.droppedImageCount(uncomparableCount)}
                tone="warning"
                icon={
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="m3 16 5-5 4 4M14 14l2-2 5 5" />
                  </svg>
                }
                count={uncomparableCount}
                title={i18n.documentPane.droppedImageCount(uncomparableCount)}
                details={uncomparableReasons}
              />
            )}
            {revisionCount > 0 && (
              <NoticeChip
                className="revisions"
                label={i18n.documentPane.revisionCount(revisionCount)}
                tone="neutral"
                icon={
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                }
                count={revisionCount}
                title={i18n.documentPane.revisionCount(revisionCount)}
                details={[
                  i18n.documentPane.revisionTitle,
                  i18n.documentPane.revisionBreakdown(document.revisions.insertions, document.revisions.deletions)
                ]}
              />
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
        className={`render-viewport ${!displayHtml ? 'is-empty' : ''} ${allowFileInput && dragging ? 'is-dragging' : ''}`}
        onScroll={(event) => {
          markScrolling(event.currentTarget);
          onScroll(side);
        }}
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
        ) : !displayHtml ? (
          <div className="pane-waiting-zone">
            {document.status === 'parsing' || (document.status === 'ready' && (comparing || pendingComparison)) ? (
              <div className="loading-spinner-wrapper">
                <div className="spinner-large" />
                {document.status === 'parsing' && (
                  <p>{i18n.documentPane.parsePhases[document.parsePhase ?? 'reading']}</p>
                )}
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
          <>
            {!hasResult && !pairReady && <p className="pane-preview-notice">{copy.waitingText}</p>}
            <DocumentHtml
              html={displayHtml}
              imagePreviewLabel={hasResult ? i18n.documentPane.imageCompareLabel : i18n.documentPane.imagePreviewLabel}
            />
          </>
        )}
      </div>
    </section>
  );
});

/**
 * A count chip whose explanation lives in a hover popover. The trigger is a
 * real button with the count as its name and the popover as its description,
 * so a keyboard or screen-reader user tabbing onto it hears what the number
 * means instead of a bare focusable box. The popover stays a sibling rather
 * than a child of the button so its list markup remains valid HTML.
 */
function NoticeChip({
  className = '',
  label,
  tone,
  icon,
  count,
  title,
  details
}: {
  className?: string;
  label: string;
  tone: 'warning' | 'neutral';
  icon: ReactNode;
  count: number;
  title: string;
  details: readonly string[];
}) {
  const popoverId = useId();

  return (
    <div className={`warning-chip ${className}`}>
      <button type="button" className="warning-chip__trigger" aria-label={label} aria-describedby={popoverId}>
        <span className={`status-chip ${tone}`}>
          {icon}
          {count}
        </span>
      </button>
      <div className="warning-popover" role="tooltip" id={popoverId}>
        <strong>{title}</strong>
        <ul>
          {details.map((detail, index) => (
            <li key={`${index}:${detail}`}>{detail}</li>
          ))}
        </ul>
      </div>
    </div>
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
