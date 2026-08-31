import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '@/i18n';
import { createRenderRegistry } from '@/test-utils/renderReact';
import { ImagePreviewModal } from './ReviewModals';

const renders = createRenderRegistry();

beforeEach(() => setLocale('en'));
afterEach(() => {
  renders.cleanup();
  vi.restoreAllMocks();
});

const image = { src: 'blob:preview', alt: 'figure 1' };

describe('ImagePreviewModal', () => {
  it('renders nothing until opened with an image', () => {
    const close = vi.fn();
    const { host } = renders.render(
      <ImagePreviewModal open={false} image={null} title="Preview" closeLabel="Close" onClose={close} />
    );
    expect(host.querySelector('.image-preview-overlay')).toBeNull();
    expect(close).not.toHaveBeenCalled();
  });

  it('renders the full-size image and the dialog semantics when open', () => {
    const close = vi.fn();
    const { host } = renders.render(
      <ImagePreviewModal open image={image} title="Figure 1" closeLabel="Close" onClose={close} />
    );
    const overlay = host.ownerDocument.body.querySelector<HTMLElement>('.image-preview-overlay');
    const panel = overlay?.querySelector<HTMLElement>('.image-preview-panel');
    expect(overlay).toBeTruthy();
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.getAttribute('aria-modal')).toBe('true');
    expect(overlay?.querySelector('.image-preview-title')?.textContent).toBe('Figure 1');
    const img = overlay?.querySelector<HTMLImageElement>('.image-preview-image');
    expect(img?.getAttribute('src')).toBe('blob:preview');
    expect(img?.getAttribute('alt')).toBe('figure 1');
    expect(close).not.toHaveBeenCalled();
  });

  it('closes on the close button and on a backdrop click, but not on panel clicks', () => {
    const close = vi.fn();
    const { host } = renders.render(
      <ImagePreviewModal open image={image} title="Preview" closeLabel="Close" onClose={close} />
    );
    const overlay = host.ownerDocument.body.querySelector<HTMLElement>('.image-preview-overlay')!;
    const closeButton = overlay.querySelector<HTMLButtonElement>('.image-preview-close')!;

    act(() => closeButton.click());
    expect(close).toHaveBeenCalledTimes(1);

    // A click that does not land on the overlay itself (e.g. on the panel) is ignored.
    const panel = overlay.querySelector<HTMLElement>('.image-preview-panel')!;
    act(() => panel.click());
    expect(close).toHaveBeenCalledTimes(1);

    // A click on the backdrop closes it.
    act(() => overlay.click());
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('closes on Escape and leaves other keys to the focus trap', async () => {
    const close = vi.fn();
    renders.render(<ImagePreviewModal open image={image} title="Preview" closeLabel="Close" onClose={close} />);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(close).toHaveBeenCalledTimes(1);

    // A non-Escape key never reaches onClose.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
