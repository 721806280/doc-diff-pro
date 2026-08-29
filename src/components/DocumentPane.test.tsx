import { createEmptyGraphicsReport } from '@/services/docxGraphics';
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
    // The visible affordance is a span: the label around it opens the dialog, so
    // a nested button would be a second, competing control.
    const action = local.host.querySelector('.pane-upload-action');
    expect(action?.tagName).toBe('SPAN');
    expect(action?.textContent).toBe('选择文件');
  });

  it('selects and drops files only when local input is enabled', () => {
    const selected: File[] = [];
    const local = mountPane(true, emptyDocument(), (file) => selected.push(file));
    const input = local.host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const selectedFile = new File(['docx'], 'review.docx');
    Object.defineProperty(input, 'files', { configurable: true, value: [selectedFile] });
    Object.defineProperty(input, 'value', { configurable: true, writable: true, value: 'review.docx' });
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(input.value).toBe('');

    const dropped = new File(['docx'], 'drop.docx');
    act(() => {
      local.host.querySelector('.render-viewport')?.dispatchEvent(dropEvent(dropped));
    });
    const external = mountPane(false, emptyDocument(), (file) => selected.push(file));
    act(() => {
      external.host.querySelector('.render-viewport')?.dispatchEvent(dropEvent(dropped));
    });
    expect(selected).toEqual([selectedFile, dropped]);
  });

  it('keeps the drop target active while dragging across its children', () => {
    const { host } = mountPane(true);
    const viewport = host.querySelector<HTMLElement>('.render-viewport')!;
    const child = viewport.querySelector<HTMLElement>('.pane-upload-zone')!;

    act(() => {
      viewport.dispatchEvent(dragStateEvent('dragenter'));
    });
    expect(viewport.classList.contains('is-dragging')).toBe(true);
    act(() => {
      viewport.dispatchEvent(dragStateEvent('dragleave', child));
    });
    expect(viewport.classList.contains('is-dragging')).toBe(true);
    act(() => {
      viewport.dispatchEvent(dragStateEvent('dragleave'));
    });
    expect(viewport.classList.contains('is-dragging')).toBe(false);
  });

  it('activates only keyboard events originating from a rendered difference', () => {
    const events: React.SyntheticEvent[] = [];
    const document = {
      ...emptyDocument(),
      name: 'review.docx',
      status: 'ready' as const,
      highlightedHtml: '<p><ins data-diff-id="diff-1">new</ins></p>'
    };
    const { host } = mountPane(true, document, undefined, (event) => events.push(event));
    const difference = host.querySelector<HTMLElement>('[data-diff-id]')!;
    const accepted = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => {
      difference.dispatchEvent(accepted);
    });
    act(() => {
      host
        .querySelector('.render-viewport')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(events).toHaveLength(1);
    expect(accepted.defaultPrevented).toBe(true);
  });

  it('reports scrolling and every pointer-style activation with its side', () => {
    const scrolled: string[] = [];
    const activated: string[] = [];
    const { host } = mountPane(true, emptyDocument(), undefined, undefined, {
      onScroll: (side) => scrolled.push(side),
      onActivate: (side) => activated.push(side)
    });
    const viewport = host.querySelector<HTMLElement>('.render-viewport')!;

    act(() => {
      viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
      viewport.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      viewport.dispatchEvent(new Event('wheel', { bubbles: true }));
      viewport.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      viewport.dispatchEvent(new Event('touchstart', { bubbles: true }));
    });

    expect(scrolled).toEqual(['A']);
    expect(activated).toEqual(['A', 'A', 'A', 'A']);
  });

  it('keeps the drop highlight active while dragging over the viewport', () => {
    const { host } = mountPane(true);
    const viewport = host.querySelector<HTMLElement>('.render-viewport')!;

    act(() => {
      viewport.dispatchEvent(dragStateEvent('dragover'));
    });
    expect(viewport.classList.contains('is-dragging')).toBe(true);

    const external = mountPane(false);
    const externalViewport = external.host.querySelector<HTMLElement>('.render-viewport')!;
    act(() => {
      externalViewport.dispatchEvent(dragStateEvent('dragover'));
    });
    expect(externalViewport.classList.contains('is-dragging')).toBe(false);
  });

  it('says so when the document holds graphics that cannot be compared', () => {
    // A Word chart or vector graphic loses its source to the sanitizer and would
    // otherwise leave no trace at all, which is the worst way for a comparison to
    // be incomplete: silently.
    const { host } = mountPane(true, { ...emptyDocument(), name: 'plan.docx', droppedImageCount: 3 });

    expect(host.textContent).toContain('3 处内容无法对比');
    // Reachable by keyboard, since the explanation lives in a hover popover.
    expect(host.querySelectorAll('.warning-chip[tabindex="0"]').length).toBeGreaterThan(0);
  });

  it('counts converter-dropped figures and formulas in the same notice', () => {
    // These leave no element behind at all — mammoth emits neither markup nor a
    // warning for a chart — so this chip is their only trace.
    // One stripped image the object scan cannot account for, plus everything the
    // scan found itself.
    const { host } = mountPane(true, {
      ...emptyDocument(),
      name: 'plan.docx',
      droppedImageCount: 2,
      graphics: { nativeGraphics: 2, embeddedObjects: 1, formulas: 4 }
    });

    expect(host.textContent).toContain('8 处内容无法对比');
    expect(host.textContent).toContain('2 个 Word 自绘图形');
    expect(host.textContent).toContain('1 个嵌入对象');
    expect(host.textContent).toContain('4 个公式');
  });

  it('does not count an embedded figure twice when both passes saw it', () => {
    // An OLE-embedded EMF arrives as an <img> the sanitizer strips and as a
    // w:object the package scan counts. Three such figures were reported as five.
    const { host } = mountPane(true, {
      ...emptyDocument(),
      name: 'plan.docx',
      droppedImageCount: 2,
      graphics: { nativeGraphics: 0, embeddedObjects: 3, formulas: 0 }
    });

    expect(host.textContent).toContain('3 处内容无法对比');
    expect(host.textContent).not.toContain('5 处内容无法对比');
  });

  it('keeps the notice away from documents whose graphics all came through', () => {
    const { host } = mountPane(true, { ...emptyDocument(), name: 'plan.docx', droppedImageCount: 0 });

    expect(host.textContent).not.toContain('无法对比');
  });
});

function mountPane(
  allowFileInput: boolean,
  document = emptyDocument(),
  onFile?: (file: File) => void,
  onDiffInteraction: (event: React.SyntheticEvent) => void = () => undefined,
  handlers: Partial<{ onScroll: (side: 'A' | 'B') => void; onActivate: (side: 'A' | 'B') => void }> = {}
) {
  return renders.render(
    <DocumentPane
      side="A"
      document={document}
      active
      hasResult={Boolean(document.highlightedHtml)}
      comparing={false}
      allowFileInput={allowFileInput}
      paneRef={createRef<HTMLDivElement>()}
      onFile={async (_side, file) => onFile?.(file)}
      onScroll={handlers.onScroll ?? (() => undefined)}
      onDiffInteraction={onDiffInteraction}
      onActivate={handlers.onActivate ?? (() => undefined)}
    />
  );
}

function emptyDocument(): DocumentPaneState {
  return {
    name: '',
    size: 0,
    originalHtml: '',
    highlightedHtml: '',
    textLength: 0,
    imageCount: 0,
    droppedImageCount: 0,
    graphics: createEmptyGraphicsReport(),
    warnings: [],
    layoutNoise: createEmptyLayoutNoise(),
    imageUrls: [],
    imageDescriptors: new Map(),
    status: 'idle',
    error: ''
  };
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
