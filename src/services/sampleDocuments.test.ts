import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSampleDocuments } from './sampleDocuments';

// The bytes a real .docx starts with: the "PK" ZIP local-file-header signature.
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

describe('sampleDocuments', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads both bundled DOCX files with user-facing names', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(ZIP_BYTES));
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const files = await loadSampleDocuments(
      '/doc-diff-pro/',
      {
        A: '示例-基准.docx',
        B: '示例-修订.docx'
      },
      controller.signal
    );

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/doc-diff-pro/samples/baseline.docx', { signal: controller.signal });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/doc-diff-pro/samples/revised.docx', { signal: controller.signal });
    expect(files.A.name).toBe('示例-基准.docx');
    expect(files.B.name).toBe('示例-修订.docx');
  });

  it('rejects a missing sample document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response(null, { status: 404 }))
    );

    await expect(loadSampleDocuments('/', { A: 'a.docx', B: 'b.docx' })).rejects.toThrow(
      'Could not load sample document'
    );
  });

  it('rejects a response that is not a ZIP archive', async () => {
    // A dev server answering a missing file with an HTML page still returns 200,
    // so the status check alone would wrap the page as a docx.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('<!doctype html>'))
    );

    await expect(loadSampleDocuments('/', { A: 'a.docx', B: 'b.docx' })).rejects.toThrow('not a valid .docx archive');
  });
});
