import { describe, expect, it, vi } from 'vitest';
import { messages } from '@/i18n/messages';
import { DEFAULT_USER_SETTINGS } from '@/config/userSettings';
import type { DiffSummary, IgnoredDiffItem } from '@/types/diff';
import type { DocumentPair } from '@/types/document';
import type { DiffElementIndex } from '@/utils/diffElementIndex';
import { createReviewItem, diffReviewId } from '@/utils/diffReview';
import { createEmptyDocument } from './documentFile';
import { exportComparisonReport } from './exportComparisonReport';

const mocks = vi.hoisted(() => ({ downloadReviewReport: vi.fn() }));

vi.mock('@/services/reviewReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/reviewReport')>()),
  downloadReviewReport: mocks.downloadReviewReport
}));

function markedElement(tag: 'del' | 'ins', text: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

/** Indexes `total` modified differences, so each one has both previews. */
function buildIndex(total: number): DiffElementIndex {
  const index: DiffElementIndex = new Map();
  for (let position = 1; position <= total; position++) {
    index.set(diffReviewId(position), {
      A: [markedElement('del', `旧内容 ${position}`)],
      B: [markedElement('ins', `新内容 ${position}`)]
    });
  }
  return index;
}

function summaryWith(total: number): DiffSummary {
  return {
    total,
    inserted: 0,
    deleted: 0,
    modified: total,
    similarity: 0.87,
    layoutNoiseFiltered: 0,
    layoutNoiseItems: []
  };
}

function documents(): DocumentPair {
  return {
    A: { ...createEmptyDocument(), name: 'baseline.docx', status: 'ready' },
    B: { ...createEmptyDocument(), name: 'revised.docx', status: 'ready' }
  };
}

function exportWith(options: { total: number; ignored?: number[]; index?: DiffElementIndex }): string {
  mocks.downloadReviewReport.mockClear();
  const index = options.index ?? buildIndex(options.total);
  const ignoredDiffs = new Map<string, IgnoredDiffItem>();
  (options.ignored ?? []).forEach((position) => {
    const item = createReviewItem(position, index.get(diffReviewId(position)));
    if (item) ignoredDiffs.set(item.id, item);
  });

  exportComparisonReport({
    locale: 'zh-CN',
    i18n: messages['zh-CN'],
    documents: documents(),
    settings: DEFAULT_USER_SETTINGS,
    summary: summaryWith(options.total),
    ignoredDiffs,
    diffIndex: index,
    generatedAt: new Date(2026, 6, 9, 8, 5)
  });

  return mocks.downloadReviewReport.mock.calls[0]![0] as string;
}

describe('exportComparisonReport', () => {
  it('names the file after the moment it was generated', () => {
    exportWith({ total: 1 });

    expect(mocks.downloadReviewReport.mock.calls[0]![1]).toBe('docdiff-report-20260709-0805.html');
  });

  it('carries every difference into the report with its previews', () => {
    const html = exportWith({ total: 2 });

    expect(html).toContain('baseline.docx');
    expect(html).toContain('revised.docx');
    expect(html).toContain('旧内容 1');
    expect(html).toContain('新内容 2');
    expect(html).toContain(messages['zh-CN'].reviewReport.statusActive);
  });

  it('reports ignored differences as ignored and counts them', () => {
    const html = exportWith({ total: 2, ignored: [2] });

    expect(html).toContain('change--ignored');
    expect(html).toContain(messages['zh-CN'].reviewReport.statusIgnored);
  });

  it('skips differences that are no longer present in the index', () => {
    const index = buildIndex(3);
    index.delete(diffReviewId(2));
    const html = exportWith({ total: 3, index });

    expect(html).toContain('旧内容 1');
    expect(html).toContain('旧内容 3');
    expect(html).not.toContain('旧内容 2');
  });
});
