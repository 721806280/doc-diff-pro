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
