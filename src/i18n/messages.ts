export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

const en = {
  app: {
    documentTitle: 'DocDiff Pro - DOCX Document Comparison',
    retryCompare: 'Compare again',
    newComparisonConfirm: 'Clear both documents and start a new comparison?',
    localProcessingNotice: 'Documents stay in this browser',
    loadSample: 'Load sample',
    loadingSample: 'Loading sample...',
    sampleOriginalFileName: 'sample-baseline.docx',
    sampleRevisedFileName: 'sample-revised.docx',
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
      settingsReset: 'Default compare settings restored.',
      documentsSwapped: 'Baseline and revised documents swapped.',
      newComparisonStarted: 'Ready for a new comparison.',
      sampleLoadFailed: 'Could not load the sample documents.',
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
  reviewReport: {
    exportLabel: 'Export report',
    exportTitle: 'Download a local, printable review report.',
    title: 'DocDiff review report',
    generatedAt: 'Generated at',
    documents: 'Documents',
    settings: 'Compare settings',
    summary: 'Result summary',
    differences: 'Difference details',
    originalPreview: 'Baseline content',
    revisedPreview: 'Revised content',
    statusActive: 'Active',
    statusIgnored: 'Ignored',
    enabled: 'On',
    disabled: 'Off',
    emptyPreview: 'No content',
    emptyDifferences: 'No differences were found.',
    privacyNote: 'This report was generated locally in your browser. Document contents were not uploaded.',
    exportedNotice: 'Review report downloaded.'
  },
  header: {
    diffGranularityLabel: 'Diff Level',
    granularityOptions: {
      semantic: 'Semantic - quick review',
      word: 'Word - content check',
      char: 'Character - detailed proofing'
    },
    granularityCompactOptions: {
      semantic: 'Semantic',
      word: 'Word',
      char: 'Char'
    },
    compareSettingsAria: 'Compare settings',
    swapDocumentsTitle: 'Swap baseline and revised documents',
    newComparisonTitle: 'Start a new comparison',
    resetSettingsLabel: 'Restore defaults',
    resetSettingsTitle: 'Restore default compare settings',
    compareRulesLabel: 'Compare rules',
    ignoreSpacesTitle: 'Ignore spacing differences, including regular spaces, full-width spaces, and tabs.',
    ignoreSpaces: 'Ignore spaces',
    ignoreFullHalfWidthTitle: 'Treat full-width and half-width letters, numbers, and common symbols as equivalent.',
    ignoreFullHalfWidth: 'Normalize width',
    filterLayoutNoiseTitle: 'Filter converted body text that looks like page headers, footers, page numbers, or repeated layout text.',
    filterLayoutNoise: 'Layout filter',
    viewOptionsLabel: 'View options',
    themeColorLabel: 'Theme color',
    themeColorOptions: {
      indigo: 'Indigo',
      blue: 'Blue',
      teal: 'Teal',
      rose: 'Rose',
      amber: 'Amber'
    },
    syncScrollTitle: 'Scroll both documents together by difference position.',
    syncScroll: 'Sync scrolling',
    showTableHintsTitle: 'Show question markers for table structure differences that are hard to verify visually.',
    showTableHints: 'Table hints',
    enableDiffIgnoreTitle: 'Show temporary ignore actions near the current difference.',
    enableDiffIgnore: 'Temporary ignore',
    enableSimilarDiffsTitle: 'Recommend similar differences for optional batch ignore.',
    enableSimilarDiffs: 'Similar suggestions',
    similarDiffLevelLabel: 'Match threshold',
    similarDiffLevel: {
      strict: 'Strict',
      balanced: 'Balanced',
      loose: 'Loose'
    },
    similarDiffLevelTitle: {
      strict: 'Match at 86% or above. Fewer candidates with lower false positives.',
      balanced: 'Match at 72% or above. Balanced candidate coverage.',
      loose: 'Match at 62% or above. More candidates that need closer review.'
    },
    githubLabel: 'Open GitHub repository',
    switchToLightMode: 'Switch to light mode',
    switchToNightMode: 'Switch to night mode',
    languageLabel: 'Interface language',
    english: 'EN',
    chinese: '中文'
  },
  documentPane: {
    conversionWarnings: 'Conversion warnings',
    changeDocument: 'Replace',
    mobileViewLabel: 'Document view',
    mobileOriginal: 'Baseline (A)',
    mobileRevised: 'Revised (B)',
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
    noDiffsTag: 'No differences',
    differenceCount(count: number): string {
      return count === 1 ? '1 diff' : `${count} diffs`;
    },
    activeDifferenceCount(active: number, total: number): string {
      return `${active} / ${total} diffs`;
    },
    similarity: 'Similarity',
    similarityTitle: 'Calculated from edit distance after applying the current normalization settings.',
    modified: 'Modified',
    inserted: 'Added',
    deleted: 'Deleted',
    layoutNoiseFiltered(count: number): string {
      return `Layout ${count}`;
    },
    layoutNoiseTitle: 'Headers, footers, page numbers, or repeated layout text excluded from the comparison. Click to view.',
    layoutNoiseDetailsTitle: 'Layout details',
    layoutNoiseDetailsCount(count: number): string {
      return `${count} ${count === 1 ? 'item' : 'items'}`;
    },
    layoutNoiseSide: {
      original: 'Baseline document',
      revised: 'Revised document'
    },
    layoutNoiseReason: {
      hint: 'Header/footer',
      'page-number': 'Page number',
      'repeated-layout-text': 'Repeated layout text'
    },
    layoutNoiseSource: {
      native: 'Outside body'
    },
    tableHintSides: {
      original: 'Baseline document',
      revised: 'Revised document'
    },
    tableHintMessages: {
      singleRowInserted(_tableNumber: number, rowLabel: string): string {
        return `Revised row ${rowLabel} was likely added.`;
      },
      singleRowDeleted(_tableNumber: number, rowLabel: string): string {
        return `Baseline row ${rowLabel} is likely missing in the revised table.`;
      },
      rowContentShift(_tableNumber: number, side: string, rowLabel: string): string {
        return `Content near ${side} row ${rowLabel} appears split across adjacent rows.`;
      },
      cellCountMismatch(_tableNumber: number, rowLabel: string): string {
        return `Row ${rowLabel} has a different cell count.`;
      },
      rowCountMismatch(_tableNumber: number): string {
        return 'The two tables have different row counts.';
      }
    },
    currentPositionAria(current: number, total: number): string {
      return `Current difference: ${current} / ${total}`;
    },
    diffMapLabel: 'Difference map',
    diffMapItem(index: number, kind: string): string {
      return `Difference ${index}: ${kind}`;
    },
    difference: 'Diff',
    ignoredDiffs(count: number): string {
      return `Ignored ${count}`;
    },
    ignoredDetailsTitle: 'Ignored differences',
    ignoredDiffKind: {
      modified: 'Modified',
      inserted: 'Added',
      deleted: 'Deleted'
    },
    emptyDiffPreview: 'No content',
    ignoreHere: 'Ignore here',
    ignoreHereTitle: 'Temporarily hide this difference from navigation.',
    unignoreHere: 'Unignore',
    unignoreHereTitle: 'Restore this temporarily ignored difference.',
    locateIgnored: 'Locate',
    similarDiffsLabel: 'Similar',
    similarDiffs(count: number): string {
      return `Similar ${count}`;
    },
    similarDiffsTitle(count: number): string {
      return `Review ${count} similar ${count === 1 ? 'difference' : 'differences'}.`;
    },
    similarDetailsTitle: 'Similar differences',
    similarCurrentLabel: 'Compared with current',
    selectAllSimilar: 'Select all',
    clearSimilarSelection: 'Clear',
    ignoreSelectedSimilar(count: number): string {
      return count === 0 ? 'Ignore selected' : `Ignore selected ${count}`;
    },
    selectSimilarDiff(index: number): string {
      return `Select similar difference ${index}`;
    },
    restoreIgnored: 'Restore all',
    restoreIgnoredTitle: 'Restore all temporarily ignored differences.',
    allDiffsIgnored: 'All differences are temporarily ignored.',
    closeDetails: 'Close',
    previous: 'Previous',
    next: 'Next',
    shortcutTitle(label: string, shortcut: string): string {
      return `${label} (${shortcut})`;
    }
  }
};

export type I18nMessages = typeof en;

const zhCN: I18nMessages = {
  app: {
    documentTitle: 'DocDiff Pro - DOCX 文档比对',
    retryCompare: '重新比对',
    newComparisonConfirm: '清空两份文档并开始新的比对吗？',
    localProcessingNotice: '文档仅在当前浏览器本地处理',
    loadSample: '加载示例',
    loadingSample: '正在加载...',
    sampleOriginalFileName: '示例-基准文档.docx',
    sampleRevisedFileName: '示例-修订文档.docx',
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
      settingsReset: '已恢复默认比对设置',
      documentsSwapped: '已交换基准文档和修订文档',
      newComparisonStarted: '可以开始新的文档比对',
      sampleLoadFailed: '示例文档加载失败，请稍后重试',
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
  reviewReport: {
    exportLabel: '导出报告',
    exportTitle: '下载在浏览器本地生成、可打印的审阅报告',
    title: 'DocDiff 审阅报告',
    generatedAt: '生成时间',
    documents: '文档信息',
    settings: '比对设置',
    summary: '结果摘要',
    differences: '差异明细',
    originalPreview: '基准内容',
    revisedPreview: '修订内容',
    statusActive: '待审阅',
    statusIgnored: '已忽略',
    enabled: '开启',
    disabled: '关闭',
    emptyPreview: '无内容',
    emptyDifferences: '未发现差异',
    privacyNote: '本报告仅在浏览器本地生成，文档内容未上传。',
    exportedNotice: '审阅报告已下载'
  },
  header: {
    diffGranularityLabel: '比对粒度',
    granularityOptions: {
      semantic: '语义级 - 适合快速审阅',
      word: '词组级 - 适合内容核对',
      char: '字符级 - 适合精细校对'
    },
    granularityCompactOptions: {
      semantic: '语义',
      word: '词组',
      char: '字符'
    },
    compareSettingsAria: '比对设置',
    swapDocumentsTitle: '交换基准文档和修订文档',
    newComparisonTitle: '开始新的文档比对',
    resetSettingsLabel: '恢复默认',
    resetSettingsTitle: '恢复默认比对设置',
    compareRulesLabel: '比对规则',
    ignoreSpacesTitle: '忽略普通空格、全角空格、制表符等版式差异',
    ignoreSpaces: '忽略空白',
    ignoreFullHalfWidthTitle: '统一全角与半角字母、数字和常见符号后再比对',
    ignoreFullHalfWidth: '统一全半角',
    filterLayoutNoiseTitle: '过滤正文里混入的页眉、页脚、页码和重复版面文字',
    filterLayoutNoise: '版面过滤',
    viewOptionsLabel: '查看方式',
    themeColorLabel: '主题色',
    themeColorOptions: {
      indigo: '靛蓝',
      blue: '蓝色',
      teal: '青绿',
      rose: '玫红',
      amber: '琥珀'
    },
    syncScrollTitle: '开启后，两侧文档会按差异位置同步滚动，便于长文对照',
    syncScroll: '同步滚动',
    showTableHintsTitle: '显示表格结构差异的问号标记，点击后查看辅助判断提示',
    showTableHints: '结构标记',
    enableDiffIgnoreTitle: '在当前差异附近显示临时忽略操作',
    enableDiffIgnore: '临时忽略',
    enableSimilarDiffsTitle: '推荐相近差异，确认后可批量临时忽略',
    enableSimilarDiffs: '相似推荐',
    similarDiffLevelLabel: '匹配阈值',
    similarDiffLevel: {
      strict: '严格',
      balanced: '均衡',
      loose: '宽松'
    },
    similarDiffLevelTitle: {
      strict: '匹配度不低于 86%，候选更少，误选风险更低',
      balanced: '匹配度不低于 72%，候选数量和准确性较均衡',
      loose: '匹配度不低于 62%，候选更多，需要更仔细确认'
    },
    githubLabel: '打开 GitHub 仓库',
    switchToLightMode: '切换到日间模式',
    switchToNightMode: '切换到夜间模式',
    languageLabel: '界面语言',
    english: 'EN',
    chinese: '中文'
  },
  documentPane: {
    conversionWarnings: '转换提示',
    changeDocument: '更换文档',
    mobileViewLabel: '文档视图',
    mobileOriginal: '基准文档 (A)',
    mobileRevised: '修订文档 (B)',
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
    noDiffsTag: '无差异',
    differenceCount(count: number): string {
      return `差异 ${count}`;
    },
    activeDifferenceCount(active: number, total: number): string {
      return `差异 ${active}/${total}`;
    },
    similarity: '相似度',
    similarityTitle: '基于当前归一化文本的编辑距离计算',
    modified: '修改',
    inserted: '新增',
    deleted: '删除',
    layoutNoiseFiltered(count: number): string {
      return `版面 ${count}`;
    },
    layoutNoiseTitle: '已从比对中排除的页眉、页脚、页码或重复版面文字。点击查看。',
    layoutNoiseDetailsTitle: '版面明细',
    layoutNoiseDetailsCount(count: number): string {
      return `${count} 条`;
    },
    layoutNoiseSide: {
      original: '基准文档',
      revised: '修订文档'
    },
    layoutNoiseReason: {
      hint: '页眉页脚',
      'page-number': '页码',
      'repeated-layout-text': '重复版面文字'
    },
    layoutNoiseSource: {
      native: '正文外'
    },
    tableHintSides: {
      original: '基准文档',
      revised: '修订文档'
    },
    tableHintMessages: {
      singleRowInserted(_tableNumber: number, rowLabel: string): string {
        return `修订表疑似新增第 ${rowLabel} 行。`;
      },
      singleRowDeleted(_tableNumber: number, rowLabel: string): string {
        return `修订表疑似缺少基准第 ${rowLabel} 行。`;
      },
      rowContentShift(_tableNumber: number, side: string, rowLabel: string): string {
        return `${side}第 ${rowLabel} 行附近疑似被拆到相邻行。`;
      },
      cellCountMismatch(_tableNumber: number, rowLabel: string): string {
        return `第 ${rowLabel} 行单元格数不一致。`;
      },
      rowCountMismatch(_tableNumber: number): string {
        return '两侧表格行数不一致。';
      }
    },
    currentPositionAria(current: number, total: number): string {
      return `当前差异位置：${current} / ${total}`;
    },
    diffMapLabel: '差异地图',
    diffMapItem(index: number, kind: string): string {
      return `差异 ${index}：${kind}`;
    },
    difference: '差异',
    ignoredDiffs(count: number): string {
      return `忽略 ${count}`;
    },
    ignoredDetailsTitle: '已忽略差异',
    ignoredDiffKind: {
      modified: '修改',
      inserted: '新增',
      deleted: '删除'
    },
    emptyDiffPreview: '无内容',
    ignoreHere: '忽略此处',
    ignoreHereTitle: '临时忽略此处差异，不再参与上一处/下一处导航',
    unignoreHere: '取消忽略',
    unignoreHereTitle: '恢复此处临时忽略的差异',
    locateIgnored: '定位',
    similarDiffsLabel: '相似项',
    similarDiffs(count: number): string {
      return `相似项 ${count}`;
    },
    similarDiffsTitle(count: number): string {
      return `查看 ${count} 个相似差异`;
    },
    similarDetailsTitle: '相似差异',
    similarCurrentLabel: '与当前差异对比',
    selectAllSimilar: '全选',
    clearSimilarSelection: '清空',
    ignoreSelectedSimilar(count: number): string {
      return count === 0 ? '忽略选中' : `忽略选中 ${count}`;
    },
    selectSimilarDiff(index: number): string {
      return `选择相似差异 ${index}`;
    },
    restoreIgnored: '恢复全部',
    restoreIgnoredTitle: '恢复所有临时忽略的差异',
    allDiffsIgnored: '当前差异已全部临时忽略',
    closeDetails: '关闭',
    previous: '上一处',
    next: '下一处',
    shortcutTitle(label: string, shortcut: string): string {
      return `${label}（${shortcut}）`;
    }
  }
};

export const messages = {
  en,
  'zh-CN': zhCN
} satisfies Record<Locale, I18nMessages>;
