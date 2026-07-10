import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSampleDocuments } from './sampleDocuments';

describe('sampleDocuments', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads both bundled DOCX files with user-facing names', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(new Blob(['docx'])));
    vi.stubGlobal('fetch', fetchMock);

    const files = await loadSampleDocuments('/doc-diff-pro/', {
      A: '示例-基准.docx',
      B: '示例-修订.docx'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/doc-diff-pro/samples/baseline.docx');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/doc-diff-pro/samples/revised.docx');
    expect(files.A.name).toBe('示例-基准.docx');
    expect(files.B.name).toBe('示例-修订.docx');
  });

  it('rejects a missing sample document', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(loadSampleDocuments('/', { A: 'a.docx', B: 'b.docx' }))
      .rejects.toThrow('Could not load sample document');
  });
});
