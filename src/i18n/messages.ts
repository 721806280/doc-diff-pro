export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

const en = {
  app: {
    documentTitle: 'DocDiff Pro - DOCX Document Comparison',
    retryCompare: 'Compare again',
    documents: {
      A: {
        title: 'Original document (A)',
        emptyLabel: 'No original document',
        reuploadTitle: 'Choose a different original document',
        uploadTitle: 'Upload original document (A)',
        uploadHint: 'Choose the source .docx file.',
        waitingText: 'Original document is ready. Upload the revised document on the right to start comparing.'
      },
      B: {
        title: 'Revised document (B)',
        emptyLabel: 'No revised document',
        reuploadTitle: 'Choose a different revised document',
        uploadTitle: 'Upload revised document (B)',
        uploadHint: 'Choose the updated .docx file.',
        waitingText: 'Revised document is ready. Upload the original document on the left to start comparing.'
      }
    },
    notices: {
      parseCompleteWithWarnings(fileName: string, count: number): string {
        return `${fileName} was parsed with ${count} conversion ${count === 1 ? 'warning' : 'warnings'}.`;
      },
      parseFailed: 'Could not parse the document. Check the file and try again.',
      settingsUpdated: 'Settings updated. Comparing again...',
      compareFailed: 'Could not compare the documents. Adjust the files or settings and try again.',
      compareRefreshed: 'Comparison updated with the latest settings.'
    },
    errors: {
      invalidType: 'Only .docx files are supported. Choose a different document.',
      fileTooLarge: 'This file is larger than 25 MB. Compress images or split the document before uploading.',
      emptyFile: 'This file is empty. Choose a valid document.',
      parseFailed(detail: string): string {
        return `Could not parse this DOCX file. ${detail}`;
      },
      compareFailed(detail: string): string {
        return `Could not compare the documents: ${detail}`;
      }
    }
  },
  header: {
    diffGranularityLabel: 'Diff Level',
    granularityOptions: {
      semantic: 'Semantic - quick review',
      word: 'Word - content check',
      char: 'Character - detailed proofing'
    },
    compareSettingsAria: 'Compare settings',
    ignoreSpacesTitle: 'Ignore spacing differences, including regular spaces, full-width spaces, and tabs.',
    ignoreSpaces: 'Ignore spaces',
    ignoreFullHalfWidthTitle: 'Treat full-width and half-width letters, numbers, and common symbols as equivalent.',
    ignoreFullHalfWidth: 'Normalize width',
    filterLayoutNoiseTitle: 'Filter page headers, footers, page numbers, and repeated layout text before comparing.',
    filterLayoutNoise: 'Layout filter',
    languageLabel: 'Interface language',
    english: 'EN',
    chinese: '中文'
  },
  documentPane: {
    conversionWarnings: 'Conversion warnings',
    changeDocument: 'Replace',
    uploadSupport: 'Click or drag to upload',
    parsing: 'Parsing document...',
    comparing: 'Analyzing differences...',
    failedTitle: 'Could not process document',
    embeddedImageAlt: 'Embedded document image',
    emptyDocumentHtml: '<p>(Empty document)</p>',
    status: {
      parsing: 'Parsing',
      ready: 'Ready',
      error: 'Failed',
      idle: 'Not uploaded'
    },
    textLength(countLabel: string, count: number): string {
      return `${countLabel} ${count === 1 ? 'char' : 'chars'}`;
    },
    imageCount(countLabel: string, count: number): string {
      return `${countLabel} ${count === 1 ? 'image' : 'images'}`;
    }
  },
  diffNavigator: {
    noDiffs: 'Comparison complete: no text differences found with the current settings.',
    withDiffsBefore: 'Comparison complete:',
    withDiffsAfter(count: number): string {
      return `text ${count === 1 ? 'difference' : 'differences'} found`;
    },
    similarity: 'Similarity',
    similarityTitle: 'Calculated from edit distance after applying the current normalization settings.',
    modified: 'Modified',
    inserted: 'Added',
    deleted: 'Deleted',
    layoutNoiseFiltered(count: number): string {
      return `Layout noise ${count}`;
    },
    layoutNoiseTitle: 'Headers, footers, page numbers, or repeated layout text excluded from the comparison. Click to view.',
    layoutNoiseDetailsTitle: 'Layout noise',
    layoutNoiseDetailsCount(count: number): string {
      return `${count} ${count === 1 ? 'item' : 'items'} excluded`;
    },
    layoutNoiseSide: {
      original: 'Original',
      revised: 'Revised'
    },
    layoutNoiseReason: {
      hint: 'Header/footer hint',
      'page-number': 'Page number',
      'repeated-layout-text': 'Repeated layout text'
    },
    currentPositionAria(current: number, total: number): string {
      return `Current difference: ${current} / ${total}`;
    },
    difference: 'Difference',
    previous: 'Previous',
    next: 'Next',
    syncScrollTitle: 'Scroll both documents together by difference position.',
    syncScroll: 'Sync scrolling'
  }
};

export type I18nMessages = typeof en;

const zhCN: I18nMessages = {
  app: {
    documentTitle: 'DocDiff Pro - DOCX 文档比对',
    retryCompare: '重新比对',
    documents: {
      A: {
        title: '基准文档 (A)',
        emptyLabel: '未上传基准文档',
        reuploadTitle: '重新选择基准文档',
        uploadTitle: '上传基准文档 (A)',
        uploadHint: '选择用于对照的原始 .docx 文件',
        waitingText: '基准文档已就绪，请上传右侧修订文档后开始比对'
      },
      B: {
        title: '修订文档 (B)',
        emptyLabel: '未上传修订文档',
        reuploadTitle: '重新选择修订文档',
        uploadTitle: '上传修订文档 (B)',
        uploadHint: '选择需要核对的新版 .docx 文件',
        waitingText: '修订文档已就绪，请上传左侧基准文档后开始比对'
      }
    },
    notices: {
      parseCompleteWithWarnings(fileName: string, count: number): string {
        return `${fileName} 解析完成，存在 ${count} 条转换提示`;
      },
      parseFailed: '文档解析失败，请检查文件后重试',
      settingsUpdated: '设置已更新，正在重新比对...',
      compareFailed: '文档比对失败，请调整文件或设置后重试',
      compareRefreshed: '已根据最新设置刷新比对结果'
    },
    errors: {
      invalidType: '仅支持上传 .docx 文件，请重新选择文档。',
      fileTooLarge: '文件超过 25 MB。建议压缩图片或拆分文档后再上传。',
      emptyFile: '文件内容为空，请重新选择有效文档。',
      parseFailed(detail: string): string {
        return `无法解析该 DOCX 文件。${detail}`;
      },
      compareFailed(detail: string): string {
        return `文档比对失败：${detail}`;
      }
    }
  },
  header: {
    diffGranularityLabel: '比对粒度',
    granularityOptions: {
      semantic: '语义级 - 适合快速审阅',
      word: '词组级 - 适合内容核对',
      char: '字符级 - 适合精细校对'
    },
    compareSettingsAria: '比对设置',
    ignoreSpacesTitle: '忽略普通空格、全角空格、制表符等版式差异',
    ignoreSpaces: '忽略空白',
    ignoreFullHalfWidthTitle: '统一全角与半角字母、数字和常见符号后再比对',
    ignoreFullHalfWidth: '统一全半角',
    filterLayoutNoiseTitle: '比对前过滤正文里的页眉、页脚、页码和重复版面文字',
    filterLayoutNoise: '版面过滤',
    languageLabel: '界面语言',
    english: 'EN',
    chinese: '中文'
  },
  documentPane: {
    conversionWarnings: '转换提示',
    changeDocument: '更换文档',
    uploadSupport: '支持点击选择或拖拽上传',
    parsing: '正在解析文档...',
    comparing: '正在分析文档差异...',
    failedTitle: '文档处理失败',
    embeddedImageAlt: '文档嵌入图片',
    emptyDocumentHtml: '<p>（空文档）</p>',
    status: {
      parsing: '解析中',
      ready: '已就绪',
      error: '处理失败',
      idle: '待上传'
    },
    textLength(countLabel: string): string {
      return `${countLabel} 字`;
    },
    imageCount(countLabel: string): string {
      return `${countLabel} 张图`;
    }
  },
  diffNavigator: {
    noDiffs: '比对完成：当前设置下，两份文档未发现文本差异。',
    withDiffsBefore: '比对完成：发现',
    withDiffsAfter(): string {
      return '处文本差异';
    },
    similarity: '相似度',
    similarityTitle: '基于当前归一化文本的编辑距离计算',
    modified: '修改',
    inserted: '新增',
    deleted: '删除',
    layoutNoiseFiltered(count: number): string {
      return `版面干扰 ${count}`;
    },
    layoutNoiseTitle: '已从比对中排除的页眉、页脚、页码或重复版面文字。点击查看。',
    layoutNoiseDetailsTitle: '版面干扰',
    layoutNoiseDetailsCount(count: number): string {
      return `已排除 ${count} 条`;
    },
    layoutNoiseSide: {
      original: '左侧文档',
      revised: '右侧文档'
    },
    layoutNoiseReason: {
      hint: '页眉页脚线索',
      'page-number': '页码',
      'repeated-layout-text': '重复版面文字'
    },
    currentPositionAria(current: number, total: number): string {
      return `当前差异位置：${current} / ${total}`;
    },
    difference: '差异',
    previous: '上一处',
    next: '下一处',
    syncScrollTitle: '开启后，两侧文档会按差异位置同步滚动，便于长文对照',
    syncScroll: '同步滚动'
  }
};

export const messages = {
  en,
  'zh-CN': zhCN
} satisfies Record<Locale, I18nMessages>;
