import { describe, expect, it } from 'vitest';
import { createEmptyDocument, validateDocumentFile } from './documentFile';

describe('document file session', () => {
  it('creates independent empty document state', () => {
    const first = createEmptyDocument();
    const second = createEmptyDocument();

    first.warnings.push('warning');
    expect(second.warnings).toEqual([]);
    expect(second.status).toBe('idle');
  });

  it('validates the file boundary before parsing', () => {
    expect(validateDocumentFile(new File(['x'], 'report.pdf'), 25)).toBe('invalidType');
    expect(validateDocumentFile(new File([], 'report.docx'), 25)).toBe('emptyFile');
    expect(validateDocumentFile(new File(['xx'], 'report.docx'), 1 / 1024 / 1024)).toBe('fileTooLarge');
    expect(validateDocumentFile(new File(['x'], 'REPORT.DOCX'), 25)).toBeNull();
  });
});
