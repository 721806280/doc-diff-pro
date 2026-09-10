const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type SampleDocuments = {
  A: File;
  B: File;
};

export async function loadSampleDocuments(
  baseUrl: string,
  fileNames: { A: string; B: string },
  signal?: AbortSignal
): Promise<SampleDocuments> {
  const [original, revised] = await Promise.all([
    loadSampleDocument(`${baseUrl}samples/baseline.docx`, fileNames.A, signal),
    loadSampleDocument(`${baseUrl}samples/revised.docx`, fileNames.B, signal)
  ]);

  return { A: original, B: revised };
}

async function loadSampleDocument(url: string, fileName: string, signal?: AbortSignal): Promise<File> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not load sample document: ${response.status}`);

  return new File([await response.blob()], fileName, { type: DOCX_CONTENT_TYPE });
}
