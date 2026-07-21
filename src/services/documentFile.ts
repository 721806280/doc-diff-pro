import type { I18nMessages } from '@/i18n/messages';
import type { DocumentPaneState } from '@/types/document';
import { createEmptyLayoutNoise } from '@/utils/layoutNoise';

export type DocumentErrorKind = 'invalidType' | 'fileTooLarge' | 'emptyFile' | 'parseFailed';

export type DocumentErrorState = {
  kind: DocumentErrorKind;
  detail?: string;
};

export function createEmptyDocument(): DocumentPaneState {
  return {
    name: '', size: 0, originalHtml: '', highlightedHtml: '', textLength: 0,
    imageCount: 0, warnings: [], layoutNoise: createEmptyLayoutNoise(), status: 'idle', error: ''
  };
}

export function validateDocumentFile(file: File, maxSizeMb: number): DocumentErrorKind | null {
  if (!file.name.toLowerCase().endsWith('.docx')) return 'invalidType';
  if (!file.size) return 'emptyFile';
  if (file.size > maxSizeMb * 1024 * 1024) return 'fileTooLarge';
  return null;
}

export function resolveDocumentError(
  i18n: I18nMessages,
  maxSizeMb: number,
  kind: DocumentErrorKind,
  detail = ''
): string {
  switch (kind) {
    case 'invalidType': return i18n.app.errors.invalidType;
    case 'fileTooLarge': return i18n.app.errors.fileTooLarge(maxSizeMb);
    case 'emptyFile': return i18n.app.errors.emptyFile;
    case 'parseFailed': return i18n.app.errors.parseFailed(detail);
  }
}
