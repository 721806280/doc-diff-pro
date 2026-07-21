import { useCallback, useEffect, useRef, useState } from 'react';
import type { I18nMessages } from '@/i18n/messages';
import { installExternalDocumentApi, type ExternalDocumentSet } from '@/services/externalDocumentApi';
import { loadSampleDocuments } from '@/services/sampleDocuments';
import { parseDocx } from '@/services/docxParser';
import type { DocumentPair, PaneSide } from '@/types/document';
import {
  createEmptyDocument,
  resolveDocumentError,
  validateDocumentFile,
  type DocumentErrorState
} from '@/services/documentFile';

type Documents = DocumentPair;

type DocumentSessionOptions = {
  allowLocalInput: boolean;
  i18n: I18nMessages;
  maxSizeMb: number;
  onBeforeDocumentChange: () => void;
  onNotice: (message: string) => void;
};

export function useDocumentSession({
  allowLocalInput,
  i18n,
  maxSizeMb,
  onBeforeDocumentChange,
  onNotice
}: DocumentSessionOptions) {
  const [documents, setDocuments] = useState<Documents>({ A: createEmptyDocument(), B: createEmptyDocument() });
  const [loadingSample, setLoadingSample] = useState(false);
  const fileSequences = useRef<Record<PaneSide, number>>({ A: 0, B: 0 });
  const sampleSequence = useRef(0);
  const documentErrors = useRef<Partial<Record<PaneSide, DocumentErrorState>>>({});

  const hasDocuments = Boolean(documents.A.name || documents.B.name);
  const ready = documents.A.status === 'ready' && documents.B.status === 'ready';

  useEffect(() => {
    setDocuments((current) => {
      let changed = false;
      const next = { ...current };
      (['A', 'B'] as PaneSide[]).forEach((side) => {
        const errorState = documentErrors.current[side];
        if (!errorState || current[side].status !== 'error') return;
        const error = resolveDocumentError(i18n, maxSizeMb, errorState.kind, errorState.detail);
        if (current[side].error !== error) {
          next[side] = { ...current[side], error };
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [i18n, maxSizeMb]);

  useEffect(() => {
    const hasActiveSession = Object.values(documents).some((document) => document.status === 'parsing' || document.status === 'ready');
    if (!hasActiveSession) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [documents]);

  useEffect(() => () => {
    fileSequences.current.A++;
    fileSequences.current.B++;
    sampleSequence.current++;
  }, []);

  const handleFile = useCallback(async (side: PaneSide, file: File) => {
    const fileSequence = ++fileSequences.current[side];
    onBeforeDocumentChange();
    const validationError = validateDocumentFile(file, maxSizeMb);
    if (validationError) {
      documentErrors.current[side] = { kind: validationError };
      const message = resolveDocumentError(i18n, maxSizeMb, validationError);
      setDocuments((current) => ({ ...current, [side]: { ...createEmptyDocument(), name: file.name, size: file.size, status: 'error', error: message } }));
      onNotice(message);
      return;
    }

    delete documentErrors.current[side];
    setDocuments((current) => ({ ...current, [side]: { ...createEmptyDocument(), name: file.name, size: file.size, status: 'parsing' } }));
    try {
      const parsed = await parseDocx(file, {
        embeddedImageAlt: i18n.documentPane.embeddedImageAlt,
        emptyDocumentHtml: i18n.documentPane.emptyDocumentHtml
      });
      if (fileSequence !== fileSequences.current[side]) return;
      setDocuments((current) => ({
        ...current,
        [side]: {
          name: file.name,
          size: file.size,
          originalHtml: parsed.html,
          highlightedHtml: '',
          textLength: parsed.textLength,
          imageCount: parsed.imageCount,
          warnings: parsed.warnings,
          layoutNoise: parsed.layoutNoise,
          status: 'ready',
          error: ''
        }
      }));
      if (parsed.warnings.length) onNotice(i18n.app.notices.parseCompleteWithWarnings(file.name, parsed.warnings.length));
    } catch (reason) {
      if (fileSequence !== fileSequences.current[side]) return;
      const detail = reason instanceof Error ? reason.message : String(reason);
      documentErrors.current[side] = { kind: 'parseFailed', detail };
      setDocuments((current) => ({
        ...current,
        [side]: {
          ...createEmptyDocument(),
          name: file.name,
          size: file.size,
          status: 'error',
          error: resolveDocumentError(i18n, maxSizeMb, 'parseFailed', detail)
        }
      }));
      onNotice(i18n.app.notices.parseFailed);
    }
  }, [i18n, maxSizeMb, onBeforeDocumentChange, onNotice]);

  useEffect(() => {
    if (allowLocalInput) return;
    return installExternalDocumentApi(async (input: ExternalDocumentSet) => {
      if (!input?.baseline && !input?.revised) throw new TypeError('Provide a baseline or revised DOCX file.');
      if (input.baseline && !isFileLike(input.baseline)) throw new TypeError('Baseline must be a browser File object.');
      if (input.revised && !isFileLike(input.revised)) throw new TypeError('Revised must be a browser File object.');
      await Promise.all([
        ...(input.baseline ? [handleFile('A', input.baseline)] : []),
        ...(input.revised ? [handleFile('B', input.revised)] : [])
      ]);
    });
  }, [allowLocalInput, handleFile]);

  const loadSamples = useCallback(async () => {
    if (loadingSample || hasDocuments) return;
    const sequence = ++sampleSequence.current;
    setLoadingSample(true);
    try {
      const samples = await loadSampleDocuments(import.meta.env.BASE_URL, {
        A: i18n.app.sampleOriginalFileName,
        B: i18n.app.sampleRevisedFileName
      });
      if (sequence !== sampleSequence.current) return;
      await Promise.all([handleFile('A', samples.A), handleFile('B', samples.B)]);
    } catch {
      if (sequence === sampleSequence.current) onNotice(i18n.app.notices.sampleLoadFailed);
    } finally {
      if (sequence === sampleSequence.current) setLoadingSample(false);
    }
  }, [handleFile, hasDocuments, i18n, loadingSample, onNotice]);

  const resetDocuments = useCallback(() => {
    if (hasDocuments && !window.confirm(i18n.app.newComparisonConfirm)) return;
    onBeforeDocumentChange();
    fileSequences.current.A++;
    fileSequences.current.B++;
    sampleSequence.current++;
    documentErrors.current = {};
    setDocuments({ A: createEmptyDocument(), B: createEmptyDocument() });
    onNotice(i18n.app.notices.newComparisonStarted);
  }, [hasDocuments, i18n, onBeforeDocumentChange, onNotice]);

  const swapDocuments = useCallback(() => {
    if (!ready) return;
    onBeforeDocumentChange();
    setDocuments({
      A: { ...documents.B, highlightedHtml: '' },
      B: { ...documents.A, highlightedHtml: '' }
    });
    onNotice(i18n.app.notices.documentsSwapped);
  }, [documents, i18n, onBeforeDocumentChange, onNotice, ready]);

  return {
    documents,
    setDocuments,
    hasDocuments,
    ready,
    loadingSample,
    handleFile,
    loadSamples,
    resetDocuments,
    swapDocuments
  };
}

function isFileLike(value: unknown): value is File {
  if (typeof value !== 'object' || value === null) return false;
  const file = value as Partial<File>;
  return typeof file.name === 'string' && typeof file.size === 'number' && typeof file.arrayBuffer === 'function';
}
