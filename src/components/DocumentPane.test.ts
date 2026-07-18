import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMountRegistry } from '@/test-utils/mountComponent';
import DocumentPane from './DocumentPane.vue';

vi.mock('@/i18n', () => import('@/test-utils/i18nMock'));

const mounts = createMountRegistry();

describe('DocumentPane', () => {
  afterEach(() => mounts.cleanup());

  it('waits for external input without exposing local file controls', () => {
    const { root } = mountPane({ allowFileInput: false });

    expect(root.textContent).toContain('等待接入系统提供文档');
    expect(root.querySelector('input[type="file"]')).toBeNull();
    expect(root.querySelector('.pane-upload-zone')).toBeNull();
  });

  it('shows local upload controls when local input is allowed', () => {
    const { root } = mountPane({ allowFileInput: true });

    expect(root.querySelector('.pane-upload-zone')).toBeTruthy();
    expect(root.querySelector('input[type="file"]')).toBeTruthy();
  });

  it('emits selected files and clears the input for selecting the same file again', () => {
    const selected: File[] = [];
    const { root } = mountPane({
      allowFileInput: true,
      onFileSelect: (file: File) => selected.push(file)
    });
    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['docx'], 'review.docx');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    Object.defineProperty(input, 'value', { configurable: true, writable: true, value: 'review.docx' });

    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(selected).toEqual([file]);
    expect(input.value).toBe('');
  });

  it('accepts dropped files only when local input is enabled', () => {
    const selected: File[] = [];
    const enabled = mountPane({ allowFileInput: true, onFileSelect: (file: File) => selected.push(file) });
    const disabled = mountPane({ allowFileInput: false, onFileSelect: (file: File) => selected.push(file) });
    const file = new File(['docx'], 'drop.docx');

    enabled.root.querySelector('.render-viewport')?.dispatchEvent(dropEvent(file));
    disabled.root.querySelector('.render-viewport')?.dispatchEvent(dropEvent(file));

    expect(selected).toEqual([file]);
  });

  it('emits keyboard activation only from a rendered difference', () => {
    const activated: KeyboardEvent[] = [];
    const { root } = mountPane({
      allowFileInput: true,
      fileName: 'review.docx',
      hasResult: true,
      highlightedHtml: '<p><ins data-diff-id="diff-1">new</ins></p>',
      onDiffActivate: (event: KeyboardEvent) => activated.push(event)
    });
    const difference = root.querySelector<HTMLElement>('[data-diff-id]')!;

    difference.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    root.querySelector('.render-viewport')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(activated).toHaveLength(1);
    expect(activated[0].defaultPrevented).toBe(true);
  });
});

function mountPane(overrides: Record<string, unknown>) {
  return mounts.mount(DocumentPane, {
    sideClass: 'side-original',
    title: '基准文档',
    fileName: '',
    fileSize: 0,
    textLength: 0,
    imageCount: 0,
    warnings: [],
    emptyLabel: '未提供文档',
    reuploadTitle: '更换文档',
    uploadTitle: '上传文档',
    uploadHint: '选择 DOCX 文件',
    externalWaitingText: '等待接入系统提供文档',
    waitingText: '等待另一份文档',
    status: 'idle',
    errorMessage: '',
    hasResult: false,
    comparing: false,
    highlightedHtml: '',
    ...overrides
  });
}

function dropEvent(file: File): DragEvent {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
  return event;
}
