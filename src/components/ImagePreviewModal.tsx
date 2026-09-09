import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '@/hooks/useDialog';
import { useLatestRef } from '@/hooks/useLatestRef';
import { useI18n } from '@/i18n';
import type { PaneSide } from '@/types/document';
import type { ImagePreview, PreviewImage } from '@/utils/imagePreview';

type Size = { width: number; height: number };
type Point = { x: number; y: number };
type ImageView = Point & { scale: number | null; rotation: number; flipX: boolean; flipY: boolean };
type ResolvedView = ImageView & { scale: number };
type OrientationAction = 'left' | 'right' | 'horizontal' | 'vertical';

const FIT: ImageView = { scale: null, x: 0.5, y: 0.5, rotation: 0, flipX: false, flipY: false };
const EMPTY_SIZE: Size = { width: 0, height: 0 };
const MAX_SCALE = 8;
const CANVAS_PADDING = 24;
const NARROW_QUERY = '(max-width: 760px)';
const SIDES: PaneSide[] = ['A', 'B'];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function orientedSize(image: Size | null, rotation: number): Size {
  if (!image) return EMPTY_SIZE;
  return rotation % 180 === 0 ? image : { width: image.height, height: image.width };
}

function fitScale(image: Size | null, viewport: Size, rotation: number): number {
  const { width, height } = orientedSize(image, rotation);
  if (!width || !height || !viewport.width || !viewport.height) return 1;
  return Math.max(
    0.001,
    Math.min(1, (viewport.width - CANVAS_PADDING * 2) / width, (viewport.height - CANVAS_PADDING * 2) / height)
  );
}

function resolveView(view: ImageView, image: Size | null, viewport: Size): ResolvedView {
  const fit = fitScale(image, viewport, view.rotation);
  const scale = Math.max(fit, view.scale ?? fit);
  const { width, height } = orientedSize(image, view.rotation);
  const limit = (length: number, available: number) =>
    length > 0 ? Math.max(0, (length - available + CANVAS_PADDING * 2) / (2 * length)) : 0;
  const limitX = limit(width * scale, viewport.width);
  const limitY = limit(height * scale, viewport.height);
  return {
    ...view,
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
  const controlsSide = canCompare ? (narrow ? 'A' : 'B') : active;
  const canLink = canCompare && SIDES.every((side) => loadState[side] === 'ready');
  const canControl = Boolean(images[active]?.src) && loadState[active] === 'ready';
  const activeView = resolveView(views[active], images[active], sizes[active]);
  const actualSize = canControl && views[active].scale !== null && Math.abs(activeView.scale - 1) < 0.001;
  const canRestore =
    canControl &&
    (linked && canLink ? SIDES : [active]).some((side) => {
      const view = views[side];
      return view.scale !== null || view.x !== 0.5 || view.y !== 0.5 || view.rotation !== 0 || view.flipX || view.flipY;
    });

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
      const frame = orientedSize(image, current.rotation);
      const fit = fitScale(image, sizes[side], current.rotation);
      const scale = clamp(current.scale * factor, fit, MAX_SCALE);
      if (scale === current.scale) return previous;
      const ratio = scale / current.scale;
      const offsetX = anchor && bounds ? anchor.x - bounds.left - bounds.width / 2 : 0;
      const offsetY = anchor && bounds ? anchor.y - bounds.top - bounds.height / 2 : 0;
      const next = resolveView(
        {
          ...current,
          scale,
          x: current.x + (offsetX / frame.width) * (1 / current.scale - 1 / scale),
          y: current.y + (offsetY / frame.height) * (1 / current.scale - 1 / scale)
        },
        image,
        sizes[side]
      );
      const result = { ...previous, [side]: { ...next, scale: scale === fit ? null : scale } };
      const other = side === 'A' ? 'B' : 'A';
      if (linked && canLink) {
        const peer = resolveView(previous[other], images[other], sizes[other]);
        const peerFit = fitScale(images[other], sizes[other], peer.rotation);
        const peerScale = clamp(peer.scale * ratio, peerFit, MAX_SCALE);
        result[other] = {
          ...previous[other],
          x: next.x,
          y: next.y,
          scale: peerScale === peerFit ? null : peerScale
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
      const frame = orientedSize(image, current.rotation);
      const next = resolveView(
        {
          ...current,
          x: current.x - dx / (frame.width * current.scale),
          y: current.y - dy / (frame.height * current.scale)
        },
        image,
        sizes[side]
      );
      if (next.x === current.x && next.y === current.y) return previous;
      const result = { ...previous, [side]: next };
      const other = side === 'A' ? 'B' : 'A';
      if (linked && canLink) result[other] = { ...previous[other], x: next.x, y: next.y };
      return result;
    });
  }

  function resetView(scale: number | null, side = active): void {
    setActive(side);
    setViews((previous) => {
      const next = { ...previous };
      for (const target of linked && canLink ? SIDES : [side]) {
        next[target] = { ...previous[target], scale, x: 0.5, y: 0.5 };
      }
      return next;
    });
  }

  function restoreView(side = active): void {
    setActive(side);
    setViews((previous) => (linked && canLink ? { A: FIT, B: FIT } : { ...previous, [side]: FIT }));
  }

  function orient(side: PaneSide, action: OrientationAction): void {
    if (loadState[side] !== 'ready') return;
    setActive(side);
    setViews((previous) => {
      const result = { ...previous };
      for (const target of linked && canLink ? SIDES : [side]) {
        const current = resolveView(previous[target], images[target], sizes[target]);
        const next = { ...current, scale: previous[target].scale };
        if (action === 'left' || action === 'right') {
          const clockwise = action === 'right';
          next.rotation = (current.rotation + (clockwise ? 90 : 270)) % 360;
          // Flips use screen axes. Swap them while rotating so clockwise stays
          // clockwise even for a mirrored image, and keep the viewed point centered.
          next.flipX = current.flipY;
          next.flipY = current.flipX;
          next.x = clockwise ? 1 - current.y : current.y;
          next.y = clockwise ? current.x : 1 - current.x;
        } else if (action === 'horizontal') {
          next.flipX = !current.flipX;
          next.x = 1 - current.x;
        } else {
          next.flipY = !current.flipY;
          next.y = 1 - current.y;
        }
        result[target] = next;
      }
      return result;
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
            ...previous[other],
            x: current.x,
            y: current.y,
            scale:
              previous[active].scale === null
                ? null
                : clamp(
                    (current.scale / fitScale(images[active], sizes[active], current.rotation)) *
                      fitScale(images[other], sizes[other], previous[other].rotation),
                    fitScale(images[other], sizes[other], previous[other].rotation),
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
  const unavailableNotice =
    preview.compared &&
    !canCompare &&
    images[counterpartSide] &&
    (!images[counterpartSide].src || loadState[counterpartSide] === 'error')
      ? copy.counterpartUnavailable[counterpartSide]
      : null;

  const visibleImages = sides.map((side) => images[side]);
  const imageWidth = Math.max(0, ...visibleImages.map((image) => image?.width ?? 0));
  const imageHeight = Math.max(0, ...visibleImages.map((image) => image?.height ?? 0));
  const panelStyle = {
    '--image-preview-width':
      (canCompare ? clamp((imageWidth + 96) * 2, 900, 1320) : clamp(imageWidth + 96, 560, 1120)) + 'px',
    '--image-preview-height': clamp(imageHeight + 220, 460, 820) + 'px'
  } as CSSProperties;
  const similarityPercent =
    preview.similarity === undefined
      ? null
      : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(preview.similarity);
  const similarity =
    canCompare && similarityPercent !== null ? (
      <span
        className="image-preview-similarity"
        role="img"
        tabIndex={0}
        aria-label={copy.similarity + ' ' + similarityPercent}
        aria-describedby="image-preview-similarity-help"
      >
        <PreviewIcon name="similarity" />
        <strong>{similarityPercent}</strong>
        <span className="image-preview-tooltip" role="tooltip" id="image-preview-similarity-help">
          <b>{copy.similarity + ' ' + similarityPercent}</b>
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
        if (!side || loadState[side] !== 'ready') return;
        const fit = fitScale(images[side], sizes[side], views[side].rotation);
        const view = resolveView(views[side], images[side], sizes[side]);
        if (Math.abs(view.scale - fit) < 0.001)
          zoom(side, (fit < 1 ? 1 : 2) / view.scale, { x: event.clientX, y: event.clientY });
        else resetView(null, side);
      }}
      onKeyDown={(event) => {
        const side = canvasSide(event.target);
        if (!side || event.altKey || event.ctrlKey || event.metaKey || loadState[side] !== 'ready') return;
        if (event.key === '+' || event.key === '=') zoom(side, 1.25);
        else if (event.key === '-') zoom(side, 0.8);
        else if (event.key === '0') resetView(null, side);
        else if (event.key === '1') resetView(1, side);
        else if (event.key.toLowerCase() === 'r') orient(side, event.shiftKey ? 'left' : 'right');
        else if (event.key.toLowerCase() === 'h') orient(side, 'horizontal');
        else if (event.key.toLowerCase() === 'v') orient(side, 'vertical');
        else if (event.key === 'Home') restoreView(side);
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
        className={
          'image-preview-panel' +
          (canCompare ? ' is-comparison' : ' is-single') +
          (canCompare && !linked ? ' is-independent' : '')
        }
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label={canCompare ? copy.title : i18n.documentPane.imagePreviewTitle}
        aria-describedby={unavailableNotice ? 'image-preview-notice' : undefined}
      >
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
                <header className="image-preview-source">
                  {(canCompare || preview.compared) && (
                    <span
                      className={
                        'image-preview-source-label' + (canCompare ? '' : ' image-preview-status is-' + preview.kind)
                      }
                    >
                      {canCompare ? (side === 'A' ? copy.original : copy.revised) : copy.status[preview.kind]}
                    </span>
                  )}
                  <h2
                    className="image-preview-filename"
                    title={fileNames[side] + (ready && image ? `\n${image.width} × ${image.height}` : '')}
                  >
                    {fileNames[side]}
                  </h2>
                  {side === controlsSide && (
                    <div className="image-preview-header-actions">
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
                  )}
                </header>
                {unavailableNotice && (
                  <p className="image-preview-notice" id="image-preview-notice" role="status">
                    {unavailableNotice}
                  </p>
                )}
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
          <div className="image-preview-toolbar" role="group" aria-label={copy.tools}>
            <div className="image-preview-zoom" role="group" aria-label={copy.zoom}>
              <button
                type="button"
                aria-label={copy.zoomIn}
                title={copy.zoomIn}
                disabled={!canControl || activeView.scale >= MAX_SCALE}
                onClick={() => zoom(active, 1.25)}
              >
                <PreviewIcon name="zoomIn" />
              </button>
              <button
                type="button"
                aria-label={copy.zoomOut}
                title={copy.zoomOut}
                disabled={
                  !canControl || activeView.scale <= fitScale(images[active], sizes[active], activeView.rotation)
                }
                onClick={() => zoom(active, 0.8)}
              >
                <PreviewIcon name="zoomOut" />
              </button>
              <button
                type="button"
                aria-label={copy.actualSize}
                title={copy.actualSizeHint}
                aria-keyshortcuts="1"
                aria-pressed={actualSize}
                disabled={!canControl}
                onClick={() => resetView(actualSize ? null : 1)}
              >
                <PreviewIcon name="actualSize" />
              </button>
            </div>
            <div className="image-preview-orientation" role="group" aria-label={copy.orientation}>
              <button
                type="button"
                aria-label={copy.rotateLeft}
                title={copy.rotateLeft + ' (Shift+R)'}
                aria-keyshortcuts="Shift+R"
                disabled={!canControl}
                onClick={() => orient(active, 'left')}
              >
                <PreviewIcon name="rotateLeft" />
              </button>
              <button
                type="button"
                aria-label={copy.rotateRight}
                title={copy.rotateRight + ' (R)'}
                aria-keyshortcuts="R"
                disabled={!canControl}
                onClick={() => orient(active, 'right')}
              >
                <PreviewIcon name="rotateRight" />
              </button>
              <button
                type="button"
                aria-label={copy.flipHorizontal}
                title={copy.flipHorizontal + ' (H)'}
                aria-keyshortcuts="H"
                aria-pressed={activeView.flipX}
                disabled={!canControl}
                onClick={() => orient(active, 'horizontal')}
              >
                <PreviewIcon name="flipHorizontal" />
              </button>
              <button
                type="button"
                aria-label={copy.flipVertical}
                title={copy.flipVertical + ' (V)'}
                aria-keyshortcuts="V"
                aria-pressed={activeView.flipY}
                disabled={!canControl}
                onClick={() => orient(active, 'vertical')}
              >
                <PreviewIcon name="flipVertical" />
              </button>
              <button
                type="button"
                className="image-preview-reset"
                aria-label={copy.resetView}
                title={copy.resetHint + ' (Home)'}
                aria-keyshortcuts="Home"
                disabled={!canRestore}
                onClick={() => restoreView()}
              >
                <PreviewIcon name="reset" />
              </button>
            </div>
            <div className="image-preview-actions">
              <button
                type="button"
                className="image-preview-fit"
                aria-label={copy.fit}
                title={copy.fit + ' (0)'}
                aria-keyshortcuts="0"
                disabled={!canControl}
                onClick={() => resetView(null)}
              >
                <PreviewIcon name="fit" />
                <span className="image-preview-scale" aria-label={copy.zoom}>
                  {!linked && canCompare && (
                    <span className="image-preview-active-side">{active === 'A' ? copy.original : copy.revised}</span>
                  )}
                  {canControl ? Math.round(activeView.scale * 100) + '%' : '—'}
                </span>
              </button>
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
                  <span className="image-preview-control-label">{linked ? copy.linked : copy.unlinked}</span>
                </button>
              )}
            </div>
            {similarity}
          </div>
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
  const frame = orientedSize(image, view.rotation);
  const x = (0.5 - view.x) * frame.width * view.scale;
  const y = (0.5 - view.y) * frame.height * view.scale;
  return {
    width: image.width || undefined,
    height: image.height || undefined,
    visibility: ready ? 'visible' : 'hidden',
    transform:
      `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${view.scale})` +
      ` scaleX(${view.flipX ? -1 : 1}) scaleY(${view.flipY ? -1 : 1}) rotate(${view.rotation}deg)`
  };
}

// Toolbar glyphs from the supplied Fancyapps UI Panzoom reference: fancyapps.com/license.
const ICON_PATHS = {
  close: 'M6 6l12 12M6 18L18 6',
  zoomIn: 'm21 21-4.35-4.35M8 11h6M11 8v6',
  zoomOut: 'm21 21-4.35-4.35M8 11h6',
  actualSize:
    'M3.51 3.07c5.74.02 11.48-.02 17.22.02 1.37.1 2.34 1.64 2.18 3.13 0 4.08.02 8.16 0 12.23-.1 1.54-1.47 2.64-2.79 2.46-5.61-.01-11.24.02-16.86-.01-1.36-.12-2.33-1.65-2.17-3.14 0-4.07-.02-8.16 0-12.23.1-1.36 1.22-2.48 2.42-2.46Z M5.65 8.54h1.49v6.92m8.94-6.92h1.49v6.92M11.5 9.4v.02m0 5.18v0',
  fit: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5',
  rotateLeft:
    'M15 4.55a8 8 0 0 0-6 14.9M9 15v5H4M18.37 7.16v.01M13 19.94v.01M16.84 18.37v.01M19.37 15.1v.01M19.94 11v.01',
  rotateRight: 'M9 4.55a8 8 0 0 1 6 14.9M15 15v5h5M5.63 7.16v.01M4.06 11v.01M4.63 15.1v.01M7.16 18.37v.01M11 19.94v.01',
  flipHorizontal: 'M12 3v18M16 7v10h5L16 7M8 7v10H3L8 7',
  flipVertical: 'M3 12h18M7 16h10L7 21v-5M7 8h10L7 3v5',
  reset: 'M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4',
  similarity: 'M14 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm8 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
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
      {(name === 'zoomIn' || name === 'zoomOut') && <circle cx="11" cy="11" r="7.5" />}
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
