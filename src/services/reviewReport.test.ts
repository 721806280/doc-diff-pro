import { describe, expect, it } from 'vitest';
import { buildReviewReportHtml } from './reviewReport';

describe('reviewReport', () => {
  it('creates a printable report and escapes document content', () => {
    const html = buildReviewReportHtml({
      locale: 'zh-CN',
      title: 'DocDiff 审阅报告',
      generatedAtLabel: '生成时间',
      generatedAt: '2026/07/10 10:30',
      documentsLabel: '文档',
      originalLabel: '基准文档',
      originalFileName: '<baseline>.docx',
      revisedLabel: '修订文档',
      revisedFileName: 'revision.docx',
      settingsLabel: '比对设置',
      settings: [{ label: '比对粒度', value: '字符级' }],
      summaryLabel: '结果摘要',
      summary: [{ label: '差异', value: '1' }],
      differencesLabel: '差异明细',
      originalPreviewLabel: '基准内容',
      revisedPreviewLabel: '修订内容',
      emptyPreviewLabel: '无内容',
      emptyDifferencesLabel: '未发现差异',
      privacyNote: '报告在浏览器本地生成。',
      changes: [{
        index: 1,
        kind: 'modified',
        kindLabel: '修改',
        statusLabel: '待审阅',
        originalPreview: '<script>alert(1)</script>',
        revisedPreview: '新内容',
        ignored: false
      }]
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('&lt;baseline&gt;.docx');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
