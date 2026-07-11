export type ExternalDocumentSet = {
  baseline?: File;
  revised?: File;
};

export type DocDiffProApi = {
  loadDocuments(documents: ExternalDocumentSet): Promise<void>;
};

export function installExternalDocumentApi(loadDocuments: DocDiffProApi['loadDocuments']): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const api: DocDiffProApi = Object.freeze({ loadDocuments });
  window.DocDiffPro = api;

  return () => {
    if (window.DocDiffPro === api) delete window.DocDiffPro;
  };
}

declare global {
  interface Window {
    DocDiffPro?: DocDiffProApi;
  }
}
