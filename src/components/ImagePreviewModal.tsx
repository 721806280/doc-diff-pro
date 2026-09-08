import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '@/hooks/useDialog';
import { useLatestRef } from '@/hooks/useLatestRef';
import { useI18n } from '@/i18n';
import type { PaneSide } from '@/types/document';
import type { ImagePreview, PreviewImage } from '@/utils/imagePreview';

type Size = { width: number; height: number };
type Point = { x: number; y: number };
type ImageView = Point & { scale: number | null };
type ResolvedView = Point & { scale: number };

const FIT: ImageView = { scale: null, x: 0.5, y: 0.5 };
const EMPTY_SIZE: Size = { width: 0, height: 0 };
const MAX_SCALE = 8;
const CANVAS_PADDING = 24;
const NARROW_QUERY = '(max-width: 760px)';
const SIDES: PaneSide[] = ['A', 'B'];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function fitScale(image: Size | null, viewport: Size): number {
  if (!image?.width || !image.height || !viewport.width || !viewport.height) return 1;
  return Math.max(
    0.001,
    Math.min(
      1,
      (viewport.width - CANVAS_PADDING * 2) / image.width,
      (viewport.height - CANVAS_PADDING * 2) / image.height
    )
  );
}

function resolveView(view: ImageView, image: Size | null, viewport: Size): ResolvedView {
  const scale = view.scale ?? fitScale(image, viewport);
  const limit = (length: number, available: number) =>
    length > 0 ? Math.max(0, (length - available + CANVAS_PADDING * 2) / (2 * length)) : 0;
  const limitX = limit((image?.width ?? 0) * scale, viewport.width);
  const limitY = limit((image?.height ?? 0) * scale, viewport.height);
  return {
    scale,
    x: clamp(view.x, 0.5 - limitX, 0.5 + limitX),
    y: clamp(view.y, 0.5 - limitY, 0.5 + limitY)
  };
}

export default function ImagePreviewModal({
  preview,
  fileNames,
  onClose
}: {
  preview: ImagePreview;
  fileNames: Record<PaneSide, string>;
  onClose: () => void;
}) {
  const { locale, messages: i18n } = useI18n();
  const copy = i18n.imagePreview;
  const panel = useRef<HTMLElement>(null);
  const canvases = useRef<Record<PaneSide, HTMLDivElement | null>>({ A: null, B: null });
  const pointers = useRef(new Map<number, Point & { side: PaneSide }>());
  const [images, setImages] = useState(preview.images);
  const [loadState, setLoadState] = useState<Record<PaneSide, 'loading' | 'ready' | 'error'>>({
    A: 'loading',
    B: 'loading'
  });
  const [sizes, setSizes] = useState<Record<PaneSide, Size>>({ A: EMPTY_SIZE, B: EMPTY_SIZE });
  const [views, setViews] = useState<Record<PaneSide, ImageView>>({ A: FIT, B: FIT });
  const [selectedSide, setActive] = useState(preview.side);
  const [linked, setLinked] = useState(true);
  const [dragging, setDragging] = useState<PaneSide | null>(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(NARROW_QUERY).matches ?? false);
  const canCompare =
    preview.compared &&
    preview.kind === 'revised' &&
    SIDES.every((side) => Boolean(images[side]?.src) && loadState[side] !== 'error');
  const otherSide = selectedSide === 'A' ? 'B' : 'A';
  const singleSide =
    images[selectedSide]?.src && loadState[selectedSide] !== 'error'
      ? selectedSide
      : images[otherSide]?.src && loadState[otherSide] !== 'error'
        ? otherSide
        : selectedSide;
  const active = canCompare ? selectedSide : singleSide;
  const sides = canCompare ? SIDES : [singleSide];
  const canLink = canCompare && SIDES.every((side) => loadState[side] === 'ready');
  const canControl = Boolean(images[active]?.src) && loadState[active] === 'ready';
  const activeView = resolveView(views[active], images[active], sizes[active]);

  useDialog(true, panel, onClose);

  useEffect(() => {
    const query = window.matchMedia?.(NARROW_QUERY);
    if (!query) return;
    const change = () => setNarrow(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    const measure = () => {
      setSizes((previous) => {
        const next = { ...previous };
        let changed = false;
        for (const side of SIDES) {
          const canvas = canvases.current[side];
          const size =
            canvas?.clientWidth && canvas.clientHeight
              ? { width: canvas.clientWidth, height: canvas.clientHeight }
              : null;
          if (!size || (size.width === previous[side].width && size.height === previous[side].height)) continue;
          next[side] = size;
          changed = true;
        }
        return changed ? next : previous;
      });
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const canvas of Object.values(canvases.current)) {
      if (canvas) observer?.observe(canvas);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [canCompare, singleSide]);

  function zoom(side: PaneSide, factor: number, anchor?: Point): void {
    const image = images[side];
    if (!image?.width || !image.height || loadState[side] !== 'ready') return;
    setActive(side);
    const bounds = canvases.current[side]?.getBoundingClientRect();
    setViews((previous) => {
      const current = resolveView(previous[side], image, sizes[side]);
      const scale = clamp(current.scale * factor, Math.min(0.1, fitScale(image, sizes[side])), MAX_SCALE);
      const ratio = scale / current.scale;
      const offsetX = anchor && bounds ? anchor.x - bounds.left - bounds.width / 2 : 0;
      const offsetY = anchor && bounds ? anchor.y - bounds.top - bounds.height / 2 : 0;
      const next = resolveView(
        {
          scale,
          x: current.x + (offsetX / image.width) * (1 / current.scale - 1 / scale),
          y: current.y + (offsetY / image.height) * (1 / current.scale - 1 / scale)
        },
        image,
        sizes[side]
      );
      const result = { ...previous, [side]: next };
      const other = side === 'A' ? 'B' : 'A';
      if (linked && canLink) {
        const peer = resolveView(previous[other], images[other], sizes[other]);
        result[other] = {
          ...next,
          scale: clamp(peer.scale * ratio, Math.min(0.1, fitScale(images[other], sizes[other])), MAX_SCALE)
        };
      }
      return result;
    });
  }

  function pan(side: PaneSide, dx: number, dy: number): void {
    const image = images[side];
    if (!image?.width || !image.height || loadState[side] !== 'ready') return;
    setViews((previous) => {
      const current = resolveView(previous[side], image, sizes[side]);
      const next = resolveView(
        {
          ...current,
          x: current.x - dx / (image.width * current.scale),
          y: current.y - dy / (image.height * current.scale)
        },
        image,
        sizes[side]
      );
      const result = { ...previous, [side]: next };
      const other = side === 'A' ? 'B' : 'A';
      if (linked && canLink) result[other] = { ...previous[other], x: next.x, y: next.y };
      return result;
    });
  }

  function resetView(scale: number | null): void {
    setViews((previous) => {
      const next = { ...FIT, scale };
      return linked && canLink ? { A: next, B: next } : { ...previous, [active]: next };
    });
  }

  function toggleLink(): void {
    if (!linked) {
      setViews((previous) => {
        const current = resolveView(previous[active], images[active], sizes[active]);
        const other = active === 'A' ? 'B' : 'A';
        return {
          ...previous,
          [other]: {
            x: current.x,
            y: current.y,
            scale:
              previous[active].scale === null
                ? null
                : clamp(
                    (current.scale / fitScale(images[active], sizes[active])) * fitScale(images[other], sizes[other]),
                    Math.min(0.1, fitScale(images[other], sizes[other])),
                    MAX_SCALE
                  )
          }
        };
      });
    }
    setLinked(!linked);
  }

  const zoomRef = useLatestRef(zoom);
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      const canvas =
        event.target instanceof Element ? event.target.closest<HTMLElement>('.image-preview-canvas') : null;
      const side = canvas?.dataset.side;
      if (!canvas || (side !== 'A' && side !== 'B')) return;
      event.preventDefault();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      zoomRef.current(side, Math.exp(-clamp(event.deltaY * units, -160, 160) * 0.003), {
        x: event.clientX,
        y: event.clientY
      });
    };
    // React's delegated wheel listener is passive; zoom must not scroll the document behind the dialog.
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoomRef]);

  function startPointer(event: ReactPointerEvent<HTMLDivElement>, side: PaneSide): void {
    if (event.button !== 0 || loadState[side] !== 'ready') return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { side, x: event.clientX, y: event.clientY });
    setActive(side);
    setDragging(side);
  }

  function movePointer(event: ReactPointerEvent<HTMLDivElement>, side: PaneSide): void {
    if (!pointers.current.has(event.pointerId)) return;
    const before = Array.from(pointers.current.values()).filter((point) => point.side === side);
    const previous = pointers.current.get(event.pointerId)!;
    pointers.current.set(event.pointerId, { side, x: event.clientX, y: event.clientY });
    const after = Array.from(pointers.current.values()).filter((point) => point.side === side);
    if (before.length >= 2 && after.length >= 2) {
      const a = before[0]!;
      const b = before[1]!;
      const c = after[0]!;
      const d = after[1]!;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 0) {
        zoom(side, Math.hypot(c.x - d.x, c.y - d.y) / distance, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        pan(side, (c.x + d.x - a.x - b.x) / 2, (c.y + d.y - a.y - b.y) / 2);
      }
    } else {
      pan(side, event.clientX - previous.x, event.clientY - previous.y);
    }
  }

  function endPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointers.current.size === 0) setDragging(null);
  }

  function loaded(side: PaneSide, image: HTMLImageElement): void {
    setImages((previous) => ({
      ...previous,
      [side]: { ...previous[side]!, width: image.naturalWidth, height: image.naturalHeight }
    }));
    setLoadState((previous) => ({ ...previous, [side]: 'ready' }));
  }

  function emptyMessage(side: PaneSide): string {
    if (images[side]) return images[side].src ? copy.loadError : copy.unavailable;
    return preview.kind === 'inserted' || preview.kind === 'deleted' ? copy.missing[side] : copy.unmatched;
  }

  const counterpartSide = active === 'A' ? 'B' : 'A';
  const context =
    !preview.compared || canCompare
      ? null
      : images[counterpartSide] && (!images[counterpartSide].src || loadState[counterpartSide] === 'error')
        ? copy.counterpartUnavailable[counterpartSide]
        : copy.context[preview.kind];

  const visibleImages = sides.map((side) => images[side]);
  const imageWidth = Math.max(0, ...visibleImages.map((image) => image?.width ?? 0));
  const imageHeight = Math.max(0, ...visibleImages.map((image) => image?.height ?? 0));
  const panelStyle = {
    '--image-preview-width':
      (canCompare ? clamp((imageWidth + 96) * 2, 900, 1320) : clamp(imageWidth + 96, 560, 1120)) + 'px',
    '--image-preview-height': clamp(imageHeight + 220, 460, 820) + 'px'
  } as CSSProperties;
  const similarity =
    canCompare && preview.similarity !== undefined ? (
      <span className="image-preview-similarity" tabIndex={0} aria-describedby="image-preview-similarity-help">
        <span>{copy.similarity}</span>
        <strong>
          {new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(preview.similarity)}
        </strong>
        <span className="image-preview-tooltip" role="tooltip" id="image-preview-similarity-help">
          {copy.similarityHint}
        </span>
      </span>
    ) : null;

  return createPortal(
    <div
      className="image-preview-overlay"
      onFocus={(event) => {
        const side = canvasSide(event.target);
        if (side) setActive(side);
      }}
      onDoubleClick={(event) => {
        const side = canvasSide(event.target);
        if (!side) return;
        const fit = fitScale(images[side], sizes[side]);
        const view = resolveView(views[side], images[side], sizes[side]);
        if (Math.abs(view.scale - fit) < 0.001) zoom(side, (fit < 1 ? 1 : 2) / view.scale);
        else resetView(null);
      }}
      onKeyDown={(event) => {
        const side = canvasSide(event.target);
        if (!side || event.altKey || event.ctrlKey || event.metaKey || loadState[side] !== 'ready') return;
        if (event.key === '+' || event.key === '=') zoom(side, 1.25);
        else if (event.key === '-') zoom(side, 0.8);
        else if (event.key === '0') resetView(null);
        else if (event.key === 'ArrowLeft') pan(side, 40, 0);
        else if (event.key === 'ArrowRight') pan(side, -40, 0);
        else if (event.key === 'ArrowUp') pan(side, 0, 40);
        else if (event.key === 'ArrowDown') pan(side, 0, -40);
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panel}
        className={'image-preview-panel' + (canCompare ? ' is-comparison' : ' is-single')}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-preview-dialog-title"
      >
        <header className="image-preview-header">
          <div className="image-preview-heading">
            <span className="image-preview-emblem">
              <PreviewIcon name={canCompare ? 'compare' : 'image'} />
            </span>
            <h2 id="image-preview-dialog-title" className="image-preview-title">
              {canCompare ? copy.title : i18n.documentPane.imagePreviewTitle}
            </h2>
            {preview.compared && !narrow && (
              <span className={'image-preview-status is-' + preview.kind}>{copy.status[preview.kind]}</span>
            )}
          </div>
          <div className="image-preview-header-actions">
            {!narrow && similarity}
            <button
              type="button"
              className="image-preview-close"
              aria-label={i18n.diffNavigator.closeDetails}
              title={i18n.diffNavigator.closeDetails}
              onClick={onClose}
            >
              <PreviewIcon name="close" />
            </button>
          </div>
        </header>
        <div className="image-preview-panes">
          {sides.map((side) => {
            const image = images[side];
            const view = resolveView(views[side], image, sizes[side]);
            const ready = Boolean(image?.src) && loadState[side] === 'ready';
            return (
              <section
                className={'image-preview-pane' + (active === side ? ' is-active' : '')}
                data-side={side}
                key={side}
                aria-label={i18n.app.documents[side].title}
              >
                <div className="image-preview-source">
                  <span className="image-preview-source-badge">
                    <b>{side}</b>
                    {side === 'A' ? copy.original : copy.revised}
                  </span>
                  <span className="image-preview-filename" title={fileNames[side]}>
                    {fileNames[side]}
                  </span>
                  {ready && image && (
                    <span className="image-preview-dimensions">
                      {image.width} × {image.height}
                    </span>
                  )}
                </div>
                <div
                  ref={(node) => {
                    canvases.current[side] = node;
                  }}
                  className={'image-preview-canvas' + (dragging === side ? ' is-dragging' : '')}
                  data-side={side}
                  role="group"
                  aria-label={i18n.app.documents[side].title + ' · ' + copy.canvas}
                  aria-describedby="image-preview-keyboard-help"
                  tabIndex={ready ? 0 : -1}
                  onPointerDown={(event) => startPointer(event, side)}
                  onPointerMove={(event) => movePointer(event, side)}
                  onPointerUp={endPointer}
                  onPointerCancel={endPointer}
                  onLostPointerCapture={endPointer}
                >
                  {image?.src && loadState[side] !== 'error' ? (
                    <>
                      {loadState[side] === 'loading' && (
                        <div className="image-preview-loading" role="status">
                          {copy.loading}
                        </div>
                      )}
                      <img
                        className="image-preview-image"
                        src={image.src}
                        alt={image.alt || i18n.documentPane.embeddedImageAlt}
                        draggable={false}
                        onLoad={(event) => loaded(side, event.currentTarget)}
                        onError={() => setLoadState((previous) => ({ ...previous, [side]: 'error' }))}
                        style={imageStyle(image, view, ready)}
                      />
                    </>
                  ) : (
                    <div className="image-preview-empty">
                      <PreviewIcon name="image" />
                      <strong>{emptyMessage(side)}</strong>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
        <footer className="image-preview-footer">
          {narrow && preview.compared && (
            <div className="image-preview-mobile-meta">
              <span className={'image-preview-status is-' + preview.kind}>{copy.status[preview.kind]}</span>
              {similarity}
              {context && <span className="image-preview-context">{context}</span>}
            </div>
          )}
          {context ? (
            !narrow && <span className="image-preview-context">{context}</span>
          ) : (
            <span className="image-preview-hint">{narrow ? copy.touchHint : copy.panHint}</span>
          )}
          <div className="image-preview-zoom" role="group" aria-label={copy.zoom}>
            <button
              type="button"
              aria-label={copy.zoomOut}
              title={copy.zoomOut}
              disabled={!canControl || activeView.scale <= Math.min(0.1, fitScale(images[active], sizes[active]))}
              onClick={() => zoom(active, 0.8)}
            >
              <PreviewIcon name="minus" />
            </button>
            <span className="image-preview-scale" aria-label={copy.zoom}>
              {!linked && canCompare && <span className="image-preview-active-side">{active}</span>}
              {canControl ? Math.round(activeView.scale * 100) + '%' : '—'}
            </span>
            <button
              type="button"
              aria-label={copy.zoomIn}
              title={copy.zoomIn}
              disabled={!canControl || activeView.scale >= MAX_SCALE}
              onClick={() => zoom(active, 1.25)}
            >
              <PreviewIcon name="plus" />
            </button>
            <span className="image-preview-control-divider" />
            <button type="button" className="image-preview-fit" disabled={!canControl} onClick={() => resetView(null)}>
              <PreviewIcon name="fit" />
              {copy.fit}
            </button>
            <button
              type="button"
              aria-label={copy.actualSize}
              title={copy.actualSize}
              disabled={!canControl}
              onClick={() => resetView(1)}
            >
              1:1
            </button>
          </div>
          {canCompare && (
            <button
              type="button"
              className="image-preview-link"
              aria-label={copy.linkViews}
              aria-pressed={linked}
              title={linked ? copy.unlinkHint : copy.linkHint}
              disabled={!canLink}
              onClick={toggleLink}
            >
              <PreviewIcon name={linked ? 'link' : 'unlink'} />
              {linked ? copy.linked : copy.unlinked}
            </button>
          )}
          <span className="image-preview-sr-only" id="image-preview-keyboard-help">
            {copy.keyboardHint}
          </span>
        </footer>
      </section>
    </div>,
    document.body
  );
}

function canvasSide(target: EventTarget): PaneSide | null {
  const side = target instanceof Element ? target.closest<HTMLElement>('.image-preview-canvas')?.dataset.side : null;
  return side === 'A' || side === 'B' ? side : null;
}

function imageStyle(image: PreviewImage, view: ResolvedView, ready: boolean): CSSProperties {
  return {
    width: image.width || undefined,
    height: image.height || undefined,
    visibility: ready ? 'visible' : 'hidden',
    transform:
      'translate(calc(-50% + ' +
      (0.5 - view.x) * image.width * view.scale +
      'px), calc(-50% + ' +
      (0.5 - view.y) * image.height * view.scale +
      'px)) scale(' +
      view.scale +
      ')'
  };
}

const ICON_PATHS = {
  compare: 'M3 4h18v16H3z M12 4v16',
  close: 'M6 6l12 12M6 18L18 6',
  minus: 'M5 12h14',
  plus: 'M5 12h14M12 5v14',
  fit: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  unlink: 'M8 3v3M3 8h3M16 18v3M18 16h3M10 8l3-3a4 4 0 0 1 6 6l-3 3M14 16l-3 3a4 4 0 0 1-6-6l3-3',
  image: 'M3 4h18v16H3z M3 16l5-5 5 5 3-3 5 5 M15 8h.01'
};

function PreviewIcon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
