import { act, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '@/i18n';
import { createRenderRegistry } from '@/test-utils/renderReact';
import { createEmptyLayoutNoise } from '@/utils/layoutNoise';
import DocumentPane, { type DocumentPaneState } from './DocumentPane';

const renders = createRenderRegistry();

beforeEach(() => setLocale('zh-CN'));

afterEach(() => {
  renders.cleanup();
  setLocale('zh-CN');
});

describe('DocumentPane', () => {
  it('separates external waiting and local upload controls', () => {
    const external = mountPane(false);
    expect(external.host.textContent).toContain('等待接入系统提供基准文档');
    expect(external.host.querySelector('input[type="file"]')).toBeNull();
    const local = mountPane(true);
    expect(local.host.querySelector('.pane-upload-zone')).toBeTruthy();
    expect(local.host.querySelector('input[type="file"]')).toBeTruthy();
  });

  it('selects and drops files only when local input is enabled', () => {
    const selected: File[] = [];
    const local = mountPane(true, emptyDocument(), (file) => selected.push(file));
    const input = local.host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const selectedFile = new File(['docx'], 'review.docx');
    Object.defineProperty(input, 'files', { configurable: true, value: [selectedFile] });
    Object.defineProperty(input, 'value', { configurable: true, writable: true, value: 'review.docx' });
    act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(input.value).toBe('');

    const dropped = new File(['docx'], 'drop.docx');
    act(() => local.host.querySelector('.render-viewport')?.dispatchEvent(dropEvent(dropped)));
    const external = mountPane(false, emptyDocument(), (file) => selected.push(file));
    act(() => external.host.querySelector('.render-viewport')?.dispatchEvent(dropEvent(dropped)));
    expect(selected).toEqual([selectedFile, dropped]);
  });

  it('keeps the drop target active while dragging across its children', () => {
    const { host } = mountPane(true);
    const viewport = host.querySelector<HTMLElement>('.render-viewport')!;
    const child = viewport.querySelector<HTMLElement>('.pane-upload-zone')!;

    act(() => viewport.dispatchEvent(dragStateEvent('dragenter')));
    expect(viewport.classList.contains('is-dragging')).toBe(true);
    act(() => viewport.dispatchEvent(dragStateEvent('dragleave', child)));
    expect(viewport.classList.contains('is-dragging')).toBe(true);
    act(() => viewport.dispatchEvent(dragStateEvent('dragleave')));
    expect(viewport.classList.contains('is-dragging')).toBe(false);
  });

  it('activates only keyboard events originating from a rendered difference', () => {
    const events: React.SyntheticEvent[] = [];
    const document = { ...emptyDocument(), name: 'review.docx', status: 'ready' as const, highlightedHtml: '<p><ins data-diff-id="diff-1">new</ins></p>' };
    const { host } = mountPane(true, document, undefined, (event) => events.push(event));
    const difference = host.querySelector<HTMLElement>('[data-diff-id]')!;
    const accepted = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => difference.dispatchEvent(accepted));
    act(() => host.querySelector('.render-viewport')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(events).toHaveLength(1);
    expect(accepted.defaultPrevented).toBe(true);
  });
});

function mountPane(allowFileInput: boolean, document = emptyDocument(), onFile?: (file: File) => void, onDiffInteraction: (event: React.SyntheticEvent) => void = () => undefined) {
  return renders.render(<DocumentPane side="A" document={document} active hasResult={Boolean(document.highlightedHtml)} comparing={false} allowFileInput={allowFileInput} paneRef={createRef<HTMLDivElement>()} onFile={async (_side, file) => onFile?.(file)} onScroll={() => undefined} onDiffInteraction={onDiffInteraction} onActivate={() => undefined} />);
}

function emptyDocument(): DocumentPaneState {
  return { name: '', size: 0, originalHtml: '', highlightedHtml: '', textLength: 0, imageCount: 0, warnings: [], layoutNoise: createEmptyLayoutNoise(), status: 'idle', error: '' };
}

function dropEvent(file: File): DragEvent {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
  return event;
}

function dragStateEvent(type: string, relatedTarget: EventTarget | null = null): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
  return event;
}
