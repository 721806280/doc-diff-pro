import type { UserSettings } from '@/config/userSettings';
import type { I18nMessages, Locale } from '@/i18n/messages';
import { buildReviewReportHtml, downloadReviewReport, type ReviewReportChange } from '@/services/reviewReport';
import type { DiffSummary, IgnoredDiffItem } from '@/types/diff';
import type { DocumentPair } from '@/types/document';
import type { DiffElementIndex } from '@/utils/diffElementIndex';
import { createReviewItem, diffReviewId } from '@/utils/diffReview';

type ExportComparisonReportOptions = {
  locale: Locale;
  i18n: I18nMessages;
  documents: DocumentPair;
  settings: UserSettings;
  summary: DiffSummary;
  ignoredDiffs: Map<string, IgnoredDiffItem>;
  diffIndex: DiffElementIndex;
  generatedAt?: Date;
};

export function exportComparisonReport({
  locale,
  i18n,
  documents,
  settings,
  summary,
  ignoredDiffs,
  diffIndex,
  generatedAt = new Date()
}: ExportComparisonReportOptions): void {
  const changes: ReviewReportChange[] = [];
  for (let index = 1; index <= summary.total; index++) {
    const item = createReviewItem(index, diffIndex.get(diffReviewId(index)));
    if (!item) continue;
    const ignored = ignoredDiffs.has(item.id);
    changes.push({
      index,
      kind: item.kind,
      kindLabel: i18n.diffNavigator.ignoredDiffKind[item.kind],
      statusLabel: ignored ? i18n.reviewReport.statusIgnored : i18n.reviewReport.statusActive,
      originalPreview: item.originalPreview,
      revisedPreview: item.revisedPreview,
      ignored
    });
  }

  const enabled = (value: boolean) => value ? i18n.reviewReport.enabled : i18n.reviewReport.disabled;
  const html = buildReviewReportHtml({
    locale,
    title: i18n.reviewReport.title,
    generatedAtLabel: i18n.reviewReport.generatedAt,
    generatedAt: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(generatedAt),
    documentsLabel: i18n.reviewReport.documents,
    originalLabel: i18n.app.documents.A.title,
    originalFileName: documents.A.name,
    revisedLabel: i18n.app.documents.B.title,
    revisedFileName: documents.B.name,
    settingsLabel: i18n.reviewReport.settings,
    settings: [
      { label: i18n.header.diffGranularityLabel, value: i18n.header.granularityOptions[settings.diffGranularity] },
      { label: i18n.header.ignoreSpaces, value: enabled(settings.ignoreSpaces) },
      { label: i18n.header.ignoreFullHalfWidth, value: enabled(settings.ignoreFullHalfWidth) },
      { label: i18n.header.filterLayoutNoise, value: enabled(settings.filterLayoutNoise) }
    ],
    summaryLabel: i18n.reviewReport.summary,
    summary: [
      { label: i18n.diffNavigator.similarity, value: new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(summary.similarity) },
      { label: i18n.diffNavigator.difference, value: String(summary.total) },
      { label: i18n.diffNavigator.modified, value: String(summary.modified) },
      { label: i18n.diffNavigator.inserted, value: String(summary.inserted) },
      { label: i18n.diffNavigator.deleted, value: String(summary.deleted) },
      { label: i18n.diffNavigator.ignoredDetailsTitle, value: String(ignoredDiffs.size) }
    ],
    differencesLabel: i18n.reviewReport.differences,
    originalPreviewLabel: i18n.reviewReport.originalPreview,
    revisedPreviewLabel: i18n.reviewReport.revisedPreview,
    emptyPreviewLabel: i18n.reviewReport.emptyPreview,
    emptyDifferencesLabel: i18n.reviewReport.emptyDifferences,
    privacyNote: i18n.reviewReport.privacyNote,
    changes
  });
  const pad = (value: number) => String(value).padStart(2, '0');
  const timestamp = `${generatedAt.getFullYear()}${pad(generatedAt.getMonth() + 1)}${pad(generatedAt.getDate())}-${pad(generatedAt.getHours())}${pad(generatedAt.getMinutes())}`;
  downloadReviewReport(html, `docdiff-report-${timestamp}.html`);
}
