import { afterEach, describe, expect, it, vi } from 'vitest';
import { installExternalDocumentApi } from './externalDocumentApi';

describe('externalDocumentApi', () => {
  afterEach(() => {
    delete window.DocDiffPro;
  });

  it('exposes document loading and removes only its own registration', async () => {
    const loadDocuments = vi.fn().mockResolvedValue(undefined);
    const uninstall = installExternalDocumentApi(loadDocuments);
    const documents = { baseline: new File(['content'], 'baseline.docx') };

    await window.DocDiffPro?.loadDocuments(documents);

    expect(loadDocuments).toHaveBeenCalledWith(documents);
    uninstall();
    expect(window.DocDiffPro).toBeUndefined();
  });

  it('preserves a newer API registration during cleanup', () => {
    const uninstall = installExternalDocumentApi(async () => undefined);
    const replacement = { loadDocuments: vi.fn().mockResolvedValue(undefined) };
    window.DocDiffPro = replacement;

    uninstall();

    expect(window.DocDiffPro).toBe(replacement);
  });

  it('installs nothing when no window exists', () => {
    vi.stubGlobal('window', undefined);
    try {
      const uninstall = installExternalDocumentApi(async () => undefined);

      expect(uninstall()).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(window.DocDiffPro).toBeUndefined();
  });
});
