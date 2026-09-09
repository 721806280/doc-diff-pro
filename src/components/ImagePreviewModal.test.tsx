import { getByRole } from '@testing-library/dom';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '@/i18n';
import { createRenderRegistry } from '@/test-utils/renderReact';
import type { ImagePreview } from '@/utils/imagePreview';
import ImagePreviewModal from './ImagePreviewModal';

const renders = createRenderRegistry();
const fileNames = { A: 'original.docx', B: 'revised.docx' };
const preview: ImagePreview = {
  side: 'B',
  compared: true,
  kind: 'revised',
  similarity: 0.927,
  images: {
    A: { src: 'blob:original', alt: 'Original chart', width: 480, height: 300 },
    B: { src: 'blob:revised', alt: 'Revised chart', width: 480, height: 300 }
  }
};

function canvas(side: 'A' | 'B'): HTMLDivElement {
  return document.querySelector<HTMLDivElement>(`.image-preview-canvas[data-side="${side}"]`)!;
}

function dispatch(target: EventTarget, event: Event): void {
  act(() => {
    target.dispatchEvent(event);
  });
}

function loadImage(side: 'A' | 'B', width = 480, height = 300): HTMLImageElement {
  const image = canvas(side).querySelector('img')!;
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: height }
  });
  dispatch(image, new Event('load'));
  return image;
}

function renderReadyPreview(value = preview) {
  const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(288);
  const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(248);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return new DOMRect(0, 0, this.clientWidth, this.clientHeight);
  });
  const view = renders.render(<ImagePreviewModal preview={value} fileNames={fileNames} onClose={vi.fn()} />);
  for (const side of ['A', 'B'] as const) {
    if (!document.contains(canvas(side))) continue;
    const image = value.images[side]!;
    loadImage(side, image.width, image.height);
    const captured = new Set<number>();
    canvas(side).setPointerCapture = (id) => {
      captured.add(id);
    };
    canvas(side).releasePointerCapture = (id) => {
      captured.delete(id);
    };
    canvas(side).hasPointerCapture = (id) => captured.has(id);
  }
  return { ...view, width, height };
}

function transform(side: 'A' | 'B') {
  const value = canvas(side).querySelector('img')!.style.transform;
  const offsets = Array.from(value.matchAll(/calc\(-50% \+ (.*?)px\)/g), (match) => Number(match[1]));
  return {
    x: offsets[0]!,
    y: offsets[1]!,
    scale: Number(/scale\((.*?)\)/.exec(value)?.[1]),
    rotation: Number(/rotate\((.*?)deg\)/.exec(value)?.[1]),
    flipX: /scaleX\(-1\)/.test(value),
    flipY: /scaleY\(-1\)/.test(value)
  };
}

function clickControl(name: string): void {
  act(() => getByRole(document.body, 'button', { name }).click());
}

function pressKey(target: HTMLElement, key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...options });
  dispatch(target, event);
  return event;
}

function pointer(side: 'A' | 'B', type: string, options: PointerEventInit = {}): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...options });
  Object.defineProperty(event, 'pointerId', { value: options.pointerId ?? 1 });
  dispatch(canvas(side), event);
  return event;
}

beforeEach(() => setLocale('en'));
afterEach(() => {
  renders.cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ImagePreviewModal', () => {
  it('keeps both document sources in order when opened from the revision', () => {
    renders.render(<ImagePreviewModal preview={preview} fileNames={fileNames} onClose={vi.fn()} />);
    const dialog = getByRole(document.body, 'dialog', { name: 'Image comparison' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('original.docx');
    expect(dialog.textContent).toContain('revised.docx');
    expect(dialog.querySelector('.image-preview-similarity')?.textContent).toContain('92.7%');
    expect(Array.from(dialog.querySelectorAll('img'), (image) => image.getAttribute('src'))).toEqual([
      'blob:original',
      'blob:revised'
    ]);
  });

  it('uses a single image for a removal and explains an unrenderable counterpart separately', () => {
    const view = renders.render(
      <ImagePreviewModal
        preview={{ ...preview, kind: 'deleted', images: { A: preview.images.A, B: null } }}
        fileNames={fileNames}
        onClose={vi.fn()}
      />
    );
    expect(document.querySelectorAll('.image-preview-pane')).toHaveLength(1);
    expect(document.querySelector('.image-preview-status')?.textContent).toBe('Removed');
    expect(document.querySelector('.image-preview-notice')).toBeNull();
    expect(document.querySelector('.image-preview-modes')).toBeNull();
    expect(document.querySelector('.image-preview-similarity')).toBeNull();
    view.rerender(
      <ImagePreviewModal
        key="unsupported"
        preview={{ ...preview, images: { A: preview.images.A, B: { src: '', alt: 'Metafile', width: 0, height: 0 } } }}
        fileNames={fileNames}
        onClose={vi.fn()}
      />
    );
    expect(document.querySelector('.image-preview-notice')?.textContent).toContain(
      'The corresponding revised image cannot be previewed'
    );
    expect(document.querySelectorAll('.image-preview-image')).toHaveLength(1);
  });

  it.each(['unchanged', 'moved', 'unmatched', 'uncompared'] as const)(
    'opens %s images without comparison controls',
    (kind) => {
      renders.render(<ImagePreviewModal preview={{ ...preview, kind }} fileNames={fileNames} onClose={vi.fn()} />);
      expect(document.querySelectorAll('.image-preview-image')).toHaveLength(1);
      expect(document.querySelector('.image-preview-image')?.getAttribute('src')).toBe('blob:revised');
      expect(document.querySelector('.image-preview-status')?.textContent).toBeTruthy();
      expect(document.querySelector('.image-preview-notice')).toBeNull();
      expect(document.querySelector('.image-preview-modes')).toBeNull();
      expect(document.querySelector('.image-preview-link')).toBeNull();
      expect(document.querySelector('.image-preview-similarity')).toBeNull();
    }
  );

  it('reports a failed image and disables its controls', () => {
    renders.render(
      <ImagePreviewModal
        preview={{ ...preview, compared: false, images: { A: null, B: preview.images.B } }}
        fileNames={fileNames}
        onClose={vi.fn()}
      />
    );
    act(() => {
      document.querySelector('img')?.dispatchEvent(new Event('error'));
    });
    expect(document.querySelector('.image-preview-empty')?.textContent).toContain('Image could not load');
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.disabled).toBe(true);
    expect(document.querySelector('.image-preview-modes')).toBeNull();
  });

  it('fits the remaining image when a single preview falls back to its counterpart', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(288);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(248);
    renders.render(
      <ImagePreviewModal preview={{ ...preview, kind: 'unchanged' }} fileNames={fileNames} onClose={vi.fn()} />
    );
    act(() => {
      document.querySelector('img')?.dispatchEvent(new Event('error'));
    });
    const image = document.querySelector<HTMLImageElement>('.image-preview-image')!;
    expect(image.getAttribute('src')).toBe('blob:original');
    Object.defineProperties(image, {
      naturalWidth: { value: 480 },
      naturalHeight: { value: 300 }
    });
    act(() => {
      image.dispatchEvent(new Event('load'));
    });
    expect(document.querySelector('.image-preview-scale')?.textContent).toBe('50%');
    expect(document.querySelector('.image-preview-notice')?.textContent).toContain(
      'The corresponding revised image cannot be previewed'
    );
  });

  it('zooms both images together and restores their fit or actual size', () => {
    renderReadyPreview();
    expect(transform('A').scale).toBe(0.5);
    expect(transform('B').scale).toBe(0.5);
    expect(document.querySelector('.image-preview-scale')?.textContent).toBe('50%');
    expect(getByRole<HTMLButtonElement>(document.body, 'button', { name: 'Zoom out' }).disabled).toBe(true);
    clickControl('Zoom in');
    expect(transform('A').scale).toBe(0.625);
    expect(transform('B')).toEqual(transform('A'));
    clickControl('Zoom out');
    expect(transform('A').scale).toBe(0.5);
    clickControl('Actual size (100%)');
    expect(transform('A').scale).toBe(1);
    expect(transform('B').scale).toBe(1);
    expect(getByRole(document.body, 'button', { name: 'Actual size (100%)' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    clickControl('Actual size (100%)');
    expect(transform('A').scale).toBe(0.5);
    expect(getByRole(document.body, 'button', { name: 'Actual size (100%)' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    clickControl('Zoom in');
    clickControl('Fit');
    expect(transform('B').scale).toBe(0.5);
    dispatch(canvas('B'), new MouseEvent('dblclick', { bubbles: true }));
    expect(transform('B').scale).toBe(1);
    dispatch(canvas('B'), new MouseEvent('dblclick', { bubbles: true }));
    expect(transform('B').scale).toBe(0.5);
  });

  it('adjusts each image independently and relinks different resolutions at the same relative zoom', () => {
    renderReadyPreview({
      ...preview,
      images: { ...preview.images, B: { ...preview.images.B!, width: 960, height: 600 } }
    });
    clickControl('Link image controls');
    clickControl('Zoom in');
    expect(transform('A').scale).toBe(0.5);
    expect(transform('B').scale).toBe(0.3125);
    act(() => canvas('A').focus());
    expect(document.querySelector('.image-preview-active-side')?.textContent).toBe('Original');
    clickControl('Actual size (100%)');
    clickControl('Link image controls');
    expect(transform('A').scale).toBe(1);
    expect(transform('B').scale).toBe(0.5);
    clickControl('Zoom out');
    expect(transform('A').scale).toBe(0.8);
    expect(transform('B').scale).toBe(0.4);
    clickControl('Link image controls');
    act(() => canvas('B').focus());
    clickControl('Fit');
    expect(transform('A').scale).toBe(0.8);
    expect(transform('B').scale).toBe(0.25);
    clickControl('Link image controls');
    expect(transform('A').scale).toBe(0.5);
  });

  it('fits rotated bounds, preserves orientation when resizing, and restores the original view', () => {
    renderReadyPreview();
    const initial = transform('A');
    expect(getByRole<HTMLButtonElement>(document.body, 'button', { name: 'Reset view' }).disabled).toBe(true);
    clickControl('Rotate right 90°');
    expect(transform('A').rotation).toBe(90);
    expect(transform('A').scale).toBeCloseTo(200 / 480);
    expect(transform('B')).toEqual(transform('A'));
    clickControl('Flip horizontally');
    expect(getByRole(document.body, 'button', { name: 'Flip horizontally' }).getAttribute('aria-pressed')).toBe('true');
    clickControl('Actual size (100%)');
    expect(transform('A')).toMatchObject({ scale: 1, rotation: 90, flipX: true });
    clickControl('Fit');
    expect(transform('A')).toMatchObject({ rotation: 90, flipX: true });
    expect(transform('A').scale).toBeCloseTo(200 / 480);
    clickControl('Rotate left 90°');
    expect(transform('A')).toMatchObject({ rotation: 0, flipX: false, flipY: true });
    clickControl('Reset view');
    expect(transform('A')).toEqual(initial);
    expect(transform('B')).toEqual(initial);
    for (let turn = 0; turn < 4; turn++) clickControl('Rotate right 90°');
    for (const name of ['Flip horizontally', 'Flip vertically']) {
      clickControl(name);
      clickControl(name);
    }
    expect(transform('A')).toEqual(initial);
    expect(getByRole<HTMLButtonElement>(document.body, 'button', { name: 'Reset view' }).disabled).toBe(true);
  });

  it('keeps a linked peer in place when the other image is already at its zoom or pan limit', () => {
    renderReadyPreview({
      ...preview,
      images: { ...preview.images, B: { ...preview.images.B!, width: 960, height: 600 } }
    });
    clickControl('Actual size (100%)');
    for (let step = 0; step < 4; step++) pressKey(canvas('A'), '-');
    expect(transform('A').scale).toBe(0.5);
    expect(transform('B').scale).toBe(0.5);
    pressKey(canvas('B'), 'ArrowRight');
    const peer = transform('B');
    expect(peer.x).toBeCloseTo(-40);
    dispatch(canvas('A'), new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 }));
    pressKey(canvas('A'), 'ArrowLeft');
    expect(transform('B')).toEqual(peer);
  });

  it('keeps independent orientation corrections when relinking and shares subsequent operations', () => {
    renderReadyPreview({
      ...preview,
      images: { ...preview.images, B: { ...preview.images.B!, width: 960, height: 600 } }
    });
    clickControl('Link image controls');
    clickControl('Rotate right 90°');
    clickControl('Flip horizontally');
    expect(transform('A')).toMatchObject({ rotation: 0, flipX: false });
    expect(transform('B')).toMatchObject({ rotation: 90, flipX: true });
    act(() => canvas('A').focus());
    clickControl('Actual size (100%)');
    clickControl('Link image controls');
    expect(transform('A')).toMatchObject({ rotation: 0, scale: 1 });
    expect(transform('B')).toMatchObject({ rotation: 90, flipX: true });
    expect(transform('B').scale).toBeCloseTo((200 / 960) * 2);
    clickControl('Zoom in');
    clickControl('Rotate right 90°');
    expect(transform('A')).toMatchObject({ rotation: 90, flipX: false, flipY: false });
    expect(transform('B')).toMatchObject({ rotation: 180, flipX: false, flipY: true });
    const peer = transform('B');
    clickControl('Link image controls');
    clickControl('Reset view');
    expect(transform('A')).toMatchObject({ rotation: 0, scale: 0.5, flipX: false, flipY: false });
    expect(transform('B')).toEqual(peer);
  });

  it('pans in screen directions and keeps wheel zoom anchored after rotation and flipping', () => {
    renderReadyPreview({
      ...preview,
      images: {
        A: { ...preview.images.A!, width: 960, height: 600 },
        B: { ...preview.images.B!, width: 960, height: 600 }
      }
    });
    clickControl('Rotate right 90°');
    clickControl('Flip horizontally');
    clickControl('Actual size (100%)');
    act(() => canvas('A').focus());
    pressKey(canvas('A'), 'ArrowLeft');
    pressKey(canvas('A'), 'ArrowUp');
    expect(transform('A').x).toBeCloseTo(40);
    expect(transform('A').y).toBeCloseTo(40);
    const before = transform('A');
    dispatch(
      canvas('A'),
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -120,
        clientX: 204,
        clientY: 154
      })
    );
    const after = transform('A');
    expect((60 - after.x) / after.scale).toBeCloseTo((60 - before.x) / before.scale);
    expect((30 - after.y) / after.scale).toBeCloseTo((30 - before.y) / before.scale);
    expect(after).toMatchObject({ rotation: 90, flipX: true });
    expect(transform('B')).toEqual(after);
  });

  it('zooms into the double-clicked detail after a rotation and returns to fit without clearing orientation', () => {
    renderReadyPreview();
    clickControl('Rotate right 90°');
    clickControl('Flip horizontally');
    const before = transform('B');
    const event = () => new MouseEvent('dblclick', { bubbles: true, clientX: 164, clientY: 148 });
    dispatch(canvas('B'), event());
    const after = transform('B');
    expect(after).toMatchObject({ scale: 1, rotation: 90, flipX: true });
    expect((20 - after.x) / after.scale).toBeCloseTo((20 - before.x) / before.scale);
    expect((24 - after.y) / after.scale).toBeCloseTo((24 - before.y) / before.scale);
    expect(transform('A')).toEqual(after);
    dispatch(canvas('B'), event());
    expect(transform('B')).toEqual(before);
    clickControl('Actual size (100%)');
    clickControl('Actual size (100%)');
    expect(transform('B')).toEqual(before);
  });

  it('supports canvas shortcuts for rotation, flips, actual size and reset', () => {
    renderReadyPreview();
    act(() => canvas('A').focus());
    expect(pressKey(canvas('A'), 'r').defaultPrevented).toBe(true);
    expect(transform('A').rotation).toBe(90);
    pressKey(canvas('A'), 'R', { shiftKey: true });
    expect(transform('A').rotation).toBe(0);
    pressKey(canvas('A'), 'h');
    pressKey(canvas('A'), 'v');
    pressKey(canvas('A'), '1');
    expect(transform('A')).toMatchObject({ scale: 1, flipX: true, flipY: true });
    expect(pressKey(canvas('A'), 'r', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(pressKey(getByRole(document.body, 'button', { name: 'Rotate right 90°' }), 'r').defaultPrevented).toBe(
      false
    );
    expect(transform('A').rotation).toBe(0);
    pressKey(canvas('A'), 'Home');
    expect(transform('A')).toMatchObject({ scale: 0.5, rotation: 0, flipX: false, flipY: false });
    expect(transform('B')).toEqual(transform('A'));
  });

  it('supports keyboard zoom and pan without taking over browser shortcuts or toolbar keys', () => {
    renderReadyPreview();
    act(() => canvas('A').focus());
    expect(pressKey(canvas('A'), '+').defaultPrevented).toBe(true);
    expect(transform('A').scale).toBe(0.625);
    pressKey(canvas('A'), '-');
    expect(transform('A').scale).toBe(0.5);
    pressKey(canvas('A'), '=');
    expect(transform('A').scale).toBe(0.625);
    pressKey(canvas('A'), '0');
    expect(transform('A').scale).toBe(0.5);
    clickControl('Actual size (100%)');
    pressKey(canvas('A'), 'ArrowLeft');
    expect(transform('A').x).toBeCloseTo(40);
    expect(transform('B')).toEqual(transform('A'));
    pressKey(canvas('A'), 'ArrowRight');
    expect(transform('A').x).toBeCloseTo(0);
    pressKey(canvas('A'), 'ArrowUp');
    expect(transform('A').y).toBeCloseTo(40);
    pressKey(canvas('A'), 'ArrowDown');
    expect(transform('A').y).toBeCloseTo(0);
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(pressKey(canvas('A'), '+', options).defaultPrevented).toBe(false);
    }
    expect(pressKey(canvas('A'), 'a').defaultPrevented).toBe(false);
    expect(pressKey(getByRole(document.body, 'button', { name: 'Fit' }), '+').defaultPrevented).toBe(false);
    expect(transform('A').scale).toBe(1);
    clickControl('Link image controls');
    pressKey(canvas('B'), 'ArrowRight');
    expect(transform('B').x).toBeCloseTo(-40);
    expect(transform('A').x).toBeCloseTo(0);
  });

  it.each([0, 1, 2])('handles wheel delta mode %s without scrolling the document', (deltaMode) => {
    renderReadyPreview();
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaMode,
      deltaY: -10,
      clientX: 180,
      clientY: 124
    });
    dispatch(canvas('A'), event);
    expect(event.defaultPrevented).toBe(true);
    expect(transform('A').scale).toBeGreaterThan(0.5);
    expect(transform('A').x).toBeLessThan(0);
    expect(transform('B')).toEqual(transform('A'));
    const before = transform('A');
    const outside = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 });
    dispatch(document.querySelector('.image-preview-source')!, outside);
    expect(outside.defaultPrevented).toBe(false);
    expect(transform('A')).toEqual(before);
  });

  it('pans a captured pointer and stops when it is released or cancelled', () => {
    renderReadyPreview();
    clickControl('Actual size (100%)');
    pointer('B', 'pointermove', { clientX: 80, clientY: 80 });
    expect(transform('B').x).toBe(0);
    expect(pointer('B', 'pointerdown', { button: 2 }).defaultPrevented).toBe(false);
    pointer('B', 'pointerdown', { clientX: 144, clientY: 124 });
    expect(canvas('B').hasPointerCapture(1)).toBe(true);
    expect(canvas('B').classList.contains('is-dragging')).toBe(true);
    pointer('B', 'pointermove', { clientX: 104, clientY: 104 });
    expect(transform('B').x).toBeCloseTo(-40);
    expect(transform('B').y).toBeCloseTo(-20);
    expect(transform('A')).toEqual(transform('B'));
    pointer('B', 'pointerup');
    expect(canvas('B').hasPointerCapture(1)).toBe(false);
    expect(canvas('B').classList.contains('is-dragging')).toBe(false);
    const settled = transform('B');
    pointer('B', 'pointermove', { clientX: 0, clientY: 0 });
    expect(transform('B')).toEqual(settled);
    pointer('A', 'pointerdown', { clientX: 144, clientY: 124 });
    pointer('A', 'pointercancel');
    pointer('A', 'lostpointercapture');
    expect(canvas('A').hasPointerCapture(1)).toBe(false);
    expect(canvas('A').classList.contains('is-dragging')).toBe(false);
  });

  it('zooms with two pointers and keeps the gesture active until both fingers lift', () => {
    renderReadyPreview();
    pointer('A', 'pointerdown', { pointerId: 1, clientX: 100, clientY: 124 });
    pointer('A', 'pointerdown', { pointerId: 2, clientX: 200, clientY: 124 });
    pointer('A', 'pointermove', { pointerId: 1, clientX: 50, clientY: 124 });
    expect(transform('A').scale).toBeCloseTo(0.75);
    pointer('A', 'pointermove', { pointerId: 2, clientX: 250, clientY: 124 });
    expect(transform('A').scale).toBeCloseTo(1);
    expect(transform('B')).toEqual(transform('A'));
    pointer('A', 'pointerup', { pointerId: 1 });
    expect(canvas('A').classList.contains('is-dragging')).toBe(true);
    pointer('A', 'pointerup', { pointerId: 2 });
    expect(canvas('A').classList.contains('is-dragging')).toBe(false);
    const before = transform('A');
    pointer('A', 'pointerdown', { pointerId: 1, clientX: 100, clientY: 124 });
    pointer('A', 'pointerdown', { pointerId: 2, clientX: 100, clientY: 124 });
    pointer('A', 'pointermove', { pointerId: 2, clientX: 150, clientY: 124 });
    expect(transform('A')).toEqual(before);
    pointer('A', 'pointercancel', { pointerId: 1 });
    pointer('A', 'pointercancel', { pointerId: 2 });
  });

  it('keeps loading images passive and preserves usable controls if the counterpart fails', () => {
    renders.render(<ImagePreviewModal preview={preview} fileNames={fileNames} onClose={vi.fn()} />);
    expect(getByRole<HTMLButtonElement>(document.body, 'button', { name: 'Zoom in' }).disabled).toBe(true);
    for (const name of ['Rotate left 90°', 'Rotate right 90°', 'Flip horizontally', 'Flip vertically', 'Reset view']) {
      expect(getByRole<HTMLButtonElement>(document.body, 'button', { name }).disabled).toBe(true);
    }
    expect(pressKey(canvas('A'), '+').defaultPrevented).toBe(false);
    expect(pointer('A', 'pointerdown').defaultPrevented).toBe(false);
    dispatch(canvas('A'), new MouseEvent('dblclick', { bubbles: true }));
    dispatch(canvas('A'), new WheelEvent('wheel', { bubbles: true, deltaY: -120 }));
    expect(transform('A').scale).toBe(1);
    loadImage('A');
    act(() => canvas('A').focus());
    expect(getByRole<HTMLButtonElement>(document.body, 'button', { name: 'Link image controls' }).disabled).toBe(true);
    clickControl('Zoom in');
    expect(transform('A').scale).toBe(1.25);
    expect(transform('B').scale).toBe(1);
    dispatch(canvas('B').querySelector('img')!, new Event('error'));
    expect(document.querySelectorAll('.image-preview-pane')).toHaveLength(1);
    expect(document.querySelector('.image-preview-similarity')).toBeNull();
    expect(document.querySelector('.image-preview-notice')?.textContent).toContain('revised image cannot be previewed');
    clickControl('Fit');
    expect(transform('A').scale).toBe(1);
  });

  it('fits resized canvases, moves shared header controls on narrow screens and cleans up listeners', () => {
    const media = Object.assign(new EventTarget(), { matches: false });
    const removeMediaListener = vi.spyOn(media, 'removeEventListener');
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media)
    );
    let resized = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe = observe;
        disconnect = disconnect;
      }
    );
    const view = renderReadyPreview();
    expect(observe).toHaveBeenCalledTimes(2);
    expect(
      document.querySelector('.image-preview-close')?.closest('.image-preview-pane')?.getAttribute('data-side')
    ).toBe('B');
    view.width.mockReturnValue(528);
    act(() => resized());
    expect(transform('A').scale).toBeCloseTo(2 / 3);
    view.height.mockReturnValue(348);
    dispatch(window, new Event('resize'));
    expect(transform('A').scale).toBe(1);
    act(() => resized());
    expect(transform('A').scale).toBe(1);
    media.matches = true;
    dispatch(media, new Event('change'));
    expect(
      document.querySelector('.image-preview-close')?.closest('.image-preview-pane')?.getAttribute('data-side')
    ).toBe('A');
    expect(document.querySelectorAll('.image-preview-close')).toHaveLength(1);
    view.rerender(
      <ImagePreviewModal
        key="same"
        preview={{ ...preview, kind: 'unchanged' }}
        fileNames={fileNames}
        onClose={vi.fn()}
      />
    );
    expect(document.querySelector('.image-preview-status')?.textContent).toBe('Identical');
    expect(document.querySelector('.image-preview-notice')).toBeNull();
    renders.cleanup();
    expect(removeMediaListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(disconnect).toHaveBeenCalled();
  });

  it('enlarges an already fitted small image and clamps zoom to supported limits', () => {
    const view = renderReadyPreview();
    view.width.mockReturnValue(1000);
    view.height.mockReturnValue(1000);
    dispatch(window, new Event('resize'));
    dispatch(canvas('B'), new MouseEvent('dblclick', { bubbles: true }));
    expect(transform('B').scale).toBe(2);
    dispatch(canvas('B'), new MouseEvent('dblclick', { bubbles: true }));
    expect(transform('B').scale).toBe(1);
    for (let step = 0; step < 10; step++) clickControl('Zoom in');
    expect(transform('B').scale).toBe(8);
    expect(getByRole<HTMLButtonElement>(document.body, 'button', { name: 'Zoom in' }).disabled).toBe(true);
    for (let step = 0; step < 20; step++) clickControl('Zoom out');
    expect(transform('B').scale).toBe(1);
    expect(getByRole<HTMLButtonElement>(document.body, 'button', { name: 'Zoom out' }).disabled).toBe(true);
    dispatch(getByRole(document.body, 'button', { name: 'Fit' }), new MouseEvent('dblclick', { bubbles: true }));
    expect(transform('B').scale).toBe(1);
    view.width.mockReturnValue(288);
    view.height.mockReturnValue(248);
    dispatch(window, new Event('resize'));
    expect(transform('B').scale).toBe(0.5);
  });

  it('closes from the backdrop, close button or Escape and restores focus', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const close = vi.fn();
    renders.render(<ImagePreviewModal preview={preview} fileNames={fileNames} onClose={close} />);
    const dialog = document.querySelector<HTMLElement>('.image-preview-panel')!;
    const overlay = document.querySelector<HTMLElement>('.image-preview-overlay')!;
    expect(dialog.contains(document.activeElement)).toBe(true);
    act(() => dialog.click());
    expect(close).not.toHaveBeenCalled();
    act(() => document.querySelector<HTMLButtonElement>('.image-preview-close')?.click());
    act(() => overlay.click());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(close).toHaveBeenCalledTimes(3);
    renders.cleanup();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
