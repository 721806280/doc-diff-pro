const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
// Every .docx is a ZIP archive, so its first two bytes are the "PK" signature.
// A dev server that answers a missing file with a 200 HTML page would otherwise
// be wrapped as a docx and only fail deep inside the parser.
const ZIP_SIGNATURE = [0x50, 0x4b];

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

  const bytes = await response.arrayBuffer();
  const header = new Uint8Array(bytes, 0, Math.min(ZIP_SIGNATURE.length, bytes.byteLength));
  if (!ZIP_SIGNATURE.every((byte, index) => header[index] === byte)) {
    throw new Error(`Sample document is not a valid .docx archive: ${url}`);
  }

  return new File([bytes], fileName, { type: DOCX_CONTENT_TYPE });
}
