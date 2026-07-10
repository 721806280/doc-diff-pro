import type { DiffChangeKind } from '@/types/diff';

export type ReviewReportField = {
  label: string;
  value: string;
};

export type ReviewReportChange = {
  index: number;
  kind: DiffChangeKind;
  kindLabel: string;
  statusLabel: string;
  originalPreview: string;
  revisedPreview: string;
  ignored: boolean;
};

export type ReviewReportInput = {
  locale: string;
  title: string;
  generatedAtLabel: string;
  generatedAt: string;
  documentsLabel: string;
  originalLabel: string;
  originalFileName: string;
  revisedLabel: string;
  revisedFileName: string;
  settingsLabel: string;
  settings: ReviewReportField[];
  summaryLabel: string;
  summary: ReviewReportField[];
  differencesLabel: string;
  originalPreviewLabel: string;
  revisedPreviewLabel: string;
  emptyPreviewLabel: string;
  emptyDifferencesLabel: string;
  privacyNote: string;
  changes: ReviewReportChange[];
};

export function buildReviewReportHtml(report: ReviewReportInput): string {
  const settings = report.settings.map((field) => `
        <tr><th>${escapeHtml(field.label)}</th><td>${escapeHtml(field.value)}</td></tr>`).join('');
  const summary = report.summary.map((field) => `
        <div class="summary-card"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(field.value)}</strong></div>`).join('');
  const changes = report.changes.map((change) => `
        <article class="change change--${change.kind}${change.ignored ? ' change--ignored' : ''}">
          <header>
            <strong>#${change.index}</strong>
            <span class="change-kind">${escapeHtml(change.kindLabel)}</span>
            <span class="change-status">${escapeHtml(change.statusLabel)}</span>
          </header>
          <div class="change-columns">
            <section>
              <span>${escapeHtml(report.originalPreviewLabel)}</span>
              <p>${escapeHtml(change.originalPreview || report.emptyPreviewLabel)}</p>
            </section>
            <section>
              <span>${escapeHtml(report.revisedPreviewLabel)}</span>
              <p>${escapeHtml(change.revisedPreview || report.emptyPreviewLabel)}</p>
            </section>
          </div>
        </article>`).join('');

  return `<!doctype html>
<html lang="${escapeHtml(report.locale)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(report.title)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #eef2f6; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px 20px; background: #eef2f6; }
    main { width: min(960px, 100%); margin: 0 auto; padding: 32px; border: 1px solid #dbe3ec; border-radius: 12px; background: #fff; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08); }
    .report-head { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 20px; border-bottom: 1px solid #e5eaf0; }
    .report-title { display: flex; align-items: center; gap: 12px; }
    .report-mark { width: 7px; height: 44px; border-radius: 999px; background: linear-gradient(180deg, #dc2626 0 48%, #16a34a 52% 100%); }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; }
    .report-head p { margin: 6px 0 0; color: #64748b; font-size: 13px; }
    h2 { margin: 28px 0 12px; color: #334155; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; }
    .documents { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .document { padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
    .document span, .summary-card span, .change section > span { display: block; color: #64748b; font-size: 11px; font-weight: 700; }
    .document strong { display: block; margin-top: 6px; font-size: 14px; overflow-wrap: anywhere; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 8px; }
    .summary-card { padding: 11px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
    .summary-card strong { display: block; margin-top: 5px; font: 700 16px ui-monospace, SFMono-Regular, Menlo, monospace; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; font-size: 13px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; }
    th { width: 32%; color: #64748b; background: #f8fafc; }
    .changes { display: grid; gap: 10px; }
    .change { break-inside: avoid; overflow: hidden; border: 1px solid #e2e8f0; border-left: 4px solid #7c3aed; border-radius: 8px; }
    .change--inserted { border-left-color: #16a34a; }
    .change--deleted { border-left-color: #dc2626; }
    .change--ignored { opacity: 0.58; }
    .change header { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
    .change header strong { font: 700 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
    .change-kind, .change-status { padding: 2px 7px; border-radius: 999px; background: #ede9fe; color: #6d28d9; font-size: 10px; font-weight: 700; }
    .change--inserted .change-kind { background: #dcfce7; color: #15803d; }
    .change--deleted .change-kind { background: #fee2e2; color: #b91c1c; }
    .change-status { margin-left: auto; background: #e2e8f0; color: #475569; }
    .change-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .change section { min-width: 0; padding: 12px; }
    .change section + section { border-left: 1px solid #e2e8f0; }
    .change p { margin: 6px 0 0; color: #334155; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
    .empty { padding: 24px; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; text-align: center; }
    footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e5eaf0; color: #64748b; font-size: 11px; }
    @media (max-width: 680px) { body { padding: 0; } main { padding: 20px; border: 0; border-radius: 0; } .report-head, .documents, .change-columns { grid-template-columns: 1fr; display: grid; } .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } .change section + section { border-left: 0; border-top: 1px solid #e2e8f0; } }
    @media print { body { padding: 0; background: #fff; } main { width: 100%; padding: 0; border: 0; box-shadow: none; } }
  </style>
</head>
<body>
  <main>
    <header class="report-head">
      <div class="report-title"><span class="report-mark"></span><div><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.generatedAtLabel)}：${escapeHtml(report.generatedAt)}</p></div></div>
    </header>
    <h2>${escapeHtml(report.documentsLabel)}</h2>
    <div class="documents">
      <div class="document"><span>${escapeHtml(report.originalLabel)}</span><strong>${escapeHtml(report.originalFileName)}</strong></div>
      <div class="document"><span>${escapeHtml(report.revisedLabel)}</span><strong>${escapeHtml(report.revisedFileName)}</strong></div>
    </div>
    <h2>${escapeHtml(report.summaryLabel)}</h2>
    <div class="summary">${summary}</div>
    <h2>${escapeHtml(report.settingsLabel)}</h2>
    <table><tbody>${settings}</tbody></table>
    <h2>${escapeHtml(report.differencesLabel)}</h2>
    <div class="changes">${changes || `<p class="empty">${escapeHtml(report.emptyDifferencesLabel)}</p>`}</div>
    <footer>${escapeHtml(report.privacyNote)}</footer>
  </main>
</body>
</html>`;
}

export function downloadReviewReport(html: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
