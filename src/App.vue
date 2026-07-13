<template>
  <div class="app-container" :style="themeStyle">
    <AppHeader
        v-if="deploymentConfig.showHeader"
        :can-swap-documents="canSwapDocuments"
        :can-reset-documents="hasDocuments"
        :show-github-link="deploymentConfig.showGithubLink"
        v-model:diff-granularity="diffGranularity"
        v-model:theme-color="themeColor"
        v-model:appearance-mode="appearanceMode"
        v-model:ignore-spaces="ignoreSpaces"
        v-model:ignore-full-half-width="ignoreFullHalfWidth"
        v-model:filter-layout-noise="filterLayoutNoise"
        v-model:sync-scroll="syncScroll"
        v-model:show-report-export="showReportExport"
        v-model:show-table-hints="showTableHints"
        v-model:show-diff-map="showDiffMap"
        v-model:enable-diff-ignore="enableDiffIgnore"
        v-model:enable-similar-diffs="enableSimilarDiffs"
        v-model:similar-diff-level="similarDiffLevel"
        @swap-documents="swapDocuments"
        @reset-documents="resetDocuments"
        @settings-reset="handleSettingsReset"
        @settings-open-change="handleSettingsPanelOpenChange"
    />

    <div v-if="!hasDocuments && deploymentConfig.showSampleDocuments" class="local-processing-strip">
      <span class="local-processing-strip__status">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 3l7 3v5c0 4.6-2.8 8.1-7 10-4.2-1.9-7-5.4-7-10V6z"></path>
          <path d="M9 12l2 2 4-4"></path>
        </svg>
        {{ i18n.app.localProcessingNotice }}
      </span>
      <button
          v-if="deploymentConfig.showSampleDocuments"
          type="button"
          :disabled="loadingSampleDocuments"
          @click="loadBundledSampleDocuments"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path>
          <path d="M14 3v5h5"></path>
          <path d="M9 13h6M9 17h4"></path>
        </svg>
        {{ loadingSampleDocuments ? i18n.app.loadingSample : i18n.app.loadSample }}
      </button>
    </div>

    <CompareToast :message="compareNotice" :comparing="comparing" />

    <div v-if="compareError" class="app-error-banner" role="alert">
      <span>{{ compareError }}</span>
      <button type="button" @click="retryCompare">{{ i18n.app.retryCompare }}</button>
    </div>

    <DiffNavigator
        v-if="hasResult"
        :summary="diffSummary"
        :active-diff-count="activeDiffCount"
        :active-diff-index="activeDiffIndex"
        :ignored-diff-count="ignoredDiffCount"
        :ignored-diffs="ignoredDiffList"
        :can-previous="canPreviousDiff"
        :can-next="canNextDiff"
        :can-export-report="showReportExport"
        @previous="prevDiff"
        @next="nextDiff"
        @locate-ignored="locateIgnoredDiff"
        @restore-ignored="restoreIgnoredDiff"
        @restore-all-ignored="restoreIgnoredDiffs"
        @export-report="exportReviewReport"
    />

    <MobilePaneSwitch
        v-if="hasResult"
        :active-pane="mobilePane"
        @update:active-pane="setMobilePane"
    />

    <div class="workspace-container" :class="{ 'workspace-container--result': hasResult }">
      <DocumentPane
          ref="paneA"
          :class="hasResult ? (mobilePane === 'A' ? 'mobile-pane-active' : 'mobile-pane-inactive') : undefined"
          side-class="side-original"
          :title="i18n.app.documents.A.title"
          :file-name="documents.A.name"
          :file-size="documents.A.size"
          :text-length="documents.A.textLength"
          :image-count="documents.A.imageCount"
          :warnings="documents.A.warnings"
          :empty-label="i18n.app.documents.A.emptyLabel"
          :reupload-title="i18n.app.documents.A.reuploadTitle"
          :upload-title="i18n.app.documents.A.uploadTitle"
          :upload-hint="i18n.app.documents.A.uploadHint"
          :external-waiting-text="i18n.app.documents.A.externalWaitingText"
          :waiting-text="i18n.app.documents.A.waitingText"
          :allow-file-input="allowsLocalInput"
          :status="documents.A.status"
          :error-message="documents.A.error"
          :has-result="hasResult"
          :comparing="comparing"
          :highlighted-html="documents.A.highlightedHtml"
          @file-select="handleFile('A', $event)"
          @pane-scroll="onScrollA"
          @diff-click="handleDiffClick"
          @diff-activate="handleDiffActivate"
          @activate="setActiveDriver('A')"
      />

      <DiffMap
          :items="diffMapItems"
          :current-index="currentDiffIndex"
          :ignored-indices="ignoredDiffIndices"
          :collapsed="!showDiffMap"
          @select="locateDiffFromMap"
      />

      <DocumentPane
          ref="paneB"
          :class="hasResult ? (mobilePane === 'B' ? 'mobile-pane-active' : 'mobile-pane-inactive') : undefined"
          side-class="side-revision"
          :title="i18n.app.documents.B.title"
          :file-name="documents.B.name"
          :file-size="documents.B.size"
          :text-length="documents.B.textLength"
          :image-count="documents.B.imageCount"
          :warnings="documents.B.warnings"
          :empty-label="i18n.app.documents.B.emptyLabel"
          :reupload-title="i18n.app.documents.B.reuploadTitle"
          :upload-title="i18n.app.documents.B.uploadTitle"
          :upload-hint="i18n.app.documents.B.uploadHint"
          :external-waiting-text="i18n.app.documents.B.externalWaitingText"
          :waiting-text="i18n.app.documents.B.waitingText"
          :allow-file-input="allowsLocalInput"
          :status="documents.B.status"
          :error-message="documents.B.error"
          :has-result="hasResult"
          :comparing="comparing"
          :highlighted-html="documents.B.highlightedHtml"
          @file-select="handleFile('B', $event)"
          @pane-scroll="onScrollB"
          @diff-click="handleDiffClick"
          @diff-activate="handleDiffActivate"
          @activate="setActiveDriver('B')"
      />
    </div>

    <DiffActionPopover
        :open="diffActionOpen"
        :top="diffActionPosition?.top ?? 0"
        :left="diffActionPosition?.left ?? 0"
        :label="diffActionLabel"
        :ignored="currentDiffIgnored"
        :similar-count="similarDiffs.length"
        @ignore="ignoreCurrentDiff"
        @restore="restoreCurrentDiff"
        @show-similar="openSimilarDiffs"
    />

    <SimilarDiffModal
        :open="similarDiffPanelOpen"
        :current="currentDiffItem"
        :items="similarDiffs"
        @close="closeSimilarDiffs"
        @locate="locateSimilarDiff"
        @ignore-selected="ignoreSelectedDiffs"
    />

    <transition name="table-hint-tip">
      <div
          v-if="tableHintPanelOpen && activeTableHint"
          id="table-hint-panel"
          class="table-hint-tip"
          role="status"
          aria-live="polite"
          @mouseenter="clearTableHintTimer"
          @mouseleave="scheduleTableHintClose"
      >
        <span>{{ tableHintMessageText }}</span>
        <button
            type="button"
            class="table-hint-tip__close"
            :aria-label="i18n.diffNavigator.closeDetails"
            :title="i18n.diffNavigator.closeDetails"
            @click="closeTableHintPanel"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </transition>

  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { deploymentConfig } from '@/config/deploymentConfig';
import { useI18n } from '@/i18n';
import AppHeader from './components/AppHeader.vue';
import CompareToast from './components/CompareToast.vue';
import DiffActionPopover from './components/DiffActionPopover.vue';
import DiffMap from './components/DiffMap.vue';
import DiffNavigator from './components/DiffNavigator.vue';
import DocumentPane from './components/DocumentPane.vue';
import MobilePaneSwitch from './components/MobilePaneSwitch.vue';
import SimilarDiffModal from './components/SimilarDiffModal.vue';
import type { DiffGranularity, DiffMapItem, DiffSummary, DiffTableContextHint, IgnoredDiffItem, SimilarDiffLevel } from './types/diff';
import {
  buildDiffElementIndex,
  DIFF_ELEMENT_SELECTOR,
  type DiffElementGroup,
  type DiffElementIndex
} from './utils/diffElementIndex';
import { readSavedUserSettings, writeSavedUserSettings } from './config/userSettings';
import { compareDocuments } from './services/diffEngine';
import { cancelPendingTextDiffs } from './services/diffWorkerClient';
import { parseDocx, type ParsedDocx } from './services/docxParser';
import { createEmptyLayoutNoise, type LayoutNoiseData } from './utils/layoutNoise';
import { buildReviewReportHtml, downloadReviewReport, type ReviewReportChange } from './services/reviewReport';
import { loadSampleDocuments } from './services/sampleDocuments';
import { resolveTableStructureHint, type TableStructureResolution } from './utils/tableStructureHint';
import { resolveSyncScrollTop, type ScrollAnchor } from './utils/scrollSync';
import { applyThemeVariables, clearThemeVariables, getThemeStyle, type AppearanceMode, type ThemeColor } from './utils/themeColor';
import {
  activeReviewCount,
  activeReviewPosition,
  clearReviewClass,
  createReviewItem,
  diffReviewId,
  diffReviewIndex,
  findActiveReviewIndex,
  findSimilarReviewItems,
  firstReviewElement,
  resolveReviewShortcut,
  setReviewClass,
  sortReviewItems
} from './utils/diffReview';
import {
  installExternalDocumentApi,
  type ExternalDocumentSet
} from './services/externalDocumentApi';

type PaneKey = 'A' | 'B';

type DocumentPaneExpose = {
  viewport: HTMLElement | null;
};

type DocumentStatus = 'idle' | 'parsing' | 'ready' | 'error';

type DocumentState = {
  name: string;
  size: number;
  originalHtml: string;
  highlightedHtml: string;
  textLength: number;
  imageCount: number;
  warnings: string[];
  layoutNoise: LayoutNoiseData;
  status: DocumentStatus;
  error: string;
};

type ErrorKind = 'invalidType' | 'fileTooLarge' | 'emptyFile' | 'parseFailed';

type DiffActionPosition = {
  top: number;
  left: number;
};

const EMPTY_DIFF_SUMMARY: DiffSummary = {
  total: 0,
  inserted: 0,
  deleted: 0,
  modified: 0,
  similarity: 1,
  layoutNoiseFiltered: 0,
  layoutNoiseItems: []
};
const DIFF_ACTION_POPOVER_CLEARANCE = 48;
const maxDocxSize = deploymentConfig.maxDocxSizeMb * 1024 * 1024;
const allowsLocalInput = deploymentConfig.documentInput === 'local';
const allowsExternalInput = deploymentConfig.documentInput === 'external';

const documents = reactive<Record<PaneKey, DocumentState>>({
  A: createEmptyDocumentState(),
  B: createEmptyDocumentState()
});
const comparing = ref(false);
const compareNotice = ref('');
const compareError = ref('');
const hasResult = ref(false);
const diffSummary = ref<DiffSummary>({ ...EMPTY_DIFF_SUMMARY });
const diffMapItems = ref<DiffMapItem[]>([]);
const currentDiffIndex = ref(0);
const ignoredDiffs = ref<Map<string, IgnoredDiffItem>>(new Map());
const diffActionPosition = ref<DiffActionPosition | null>(null);
const mobilePane = ref<PaneKey>('A');
const similarDiffPanelOpen = ref(false);
const activeTableHint = ref<DiffTableContextHint | null>(null);
const tableHintPanelOpen = ref(false);
const initialSettings = readSavedUserSettings();
const themeColor = ref<ThemeColor>(initialSettings.themeColor);
const appearanceMode = ref<AppearanceMode>(initialSettings.appearanceMode);
const syncScroll = ref(initialSettings.syncScroll);
const showReportExport = ref(initialSettings.showReportExport);
const showTableHints = ref(initialSettings.showTableHints);
const showDiffMap = ref(initialSettings.showDiffMap);
const enableDiffIgnore = ref(initialSettings.enableDiffIgnore);
const enableSimilarDiffs = ref(initialSettings.enableSimilarDiffs);
const similarDiffLevel = ref<SimilarDiffLevel>(initialSettings.similarDiffLevel);
const settingsPanelOpen = ref(false);

const ignoreSpaces = ref(initialSettings.ignoreSpaces);
const ignoreFullHalfWidth = ref(initialSettings.ignoreFullHalfWidth);
const filterLayoutNoise = ref(initialSettings.filterLayoutNoise);
const diffGranularity = ref<DiffGranularity>(initialSettings.diffGranularity);

const paneA = ref<DocumentPaneExpose | null>(null);
const paneB = ref<DocumentPaneExpose | null>(null);
const { locale, messages: i18n } = useI18n();

let activeDriver: PaneKey | null = null;
let alignmentAnchors: ScrollAnchor[] = [];
let diffElementIndex: DiffElementIndex = new Map();
let focusedDiffElements: HTMLElement[] = [];
let compareNoticeTimer: number | null = null;
let tableHintTimer: number | null = null;
let resizeTimer: number | null = null;
let layoutTimer: number | null = null;
let settingsCompareTimer: number | null = null;
let scrollRaf: number | null = null;
let diffActionRaf: number | null = null;
let layoutObserver: ResizeObserver | null = null;
let uninstallExternalDocumentApi: (() => void) | null = null;
let compareRunId = 0;
const fileLoadIds: Record<PaneKey, number> = { A: 0, B: 0 };
const documentErrors = reactive<Partial<Record<PaneKey, { kind: ErrorKind; detail?: string }>>>({});
const compareErrorDetail = ref('');
const loadingSampleDocuments = ref(false);

const ready = computed(() => documents.A.status === 'ready' && documents.B.status === 'ready');
const hasDocuments = computed(() => Boolean(documents.A.name || documents.B.name));
const hasActiveDocumentSession = computed(() =>
  (Object.values(documents) as DocumentState[]).some((documentState) =>
    documentState.status === 'parsing' || documentState.status === 'ready'
  )
);
const canSwapDocuments = computed(() => ready.value && !comparing.value);
const totalDiffs = computed(() => diffSummary.value.total);
const ignoredDiffIds = computed(() => new Set(ignoredDiffs.value.keys()));
const ignoredDiffList = computed(() => sortReviewItems(ignoredDiffs.value.values()));
const ignoredDiffIndices = computed(() => new Set(ignoredDiffList.value.map((item) => item.index)));
const ignoredDiffCount = computed(() => ignoredDiffList.value.length);
const activeDiffCount = computed(() => activeReviewCount(totalDiffs.value, ignoredDiffCount.value));
const activeDiffIndex = computed(() => activeReviewPosition(currentDiffIndex.value, totalDiffs.value, ignoredDiffIds.value));
const canPreviousDiff = computed(() => findActiveDiff(currentDiffIndex.value - 1, -1) !== null);
const canNextDiff = computed(() => findActiveDiff(currentDiffIndex.value + 1, 1) !== null);
const canIgnoreCurrentDiff = computed(() =>
  enableDiffIgnore.value &&
  hasResult.value &&
  currentDiffIndex.value > 0 &&
  !isDiffIgnored(currentDiffIndex.value)
);
const currentDiffIgnored = computed(() =>
  enableDiffIgnore.value &&
  currentDiffIndex.value > 0 &&
  isDiffIgnored(currentDiffIndex.value)
);
const currentDiffItem = computed(() =>
  currentDiffIndex.value > 0 ? createIgnoredDiffItem(currentDiffIndex.value) : null
);
const similarDiffs = computed(() => {
  if (
    !enableDiffIgnore.value ||
    !enableSimilarDiffs.value ||
    !hasResult.value ||
    currentDiffIndex.value <= 0 ||
    currentDiffIgnored.value
  ) {
    return [];
  }

  return findSimilarReviewItems({
    currentIndex: currentDiffIndex.value,
    total: totalDiffs.value,
    ignoredIds: ignoredDiffIds.value,
    level: similarDiffLevel.value,
    getGroup: getDiffGroup
  });
});
const diffActionOpen = computed(() =>
  enableDiffIgnore.value &&
  !settingsPanelOpen.value &&
  hasResult.value &&
  currentDiffIndex.value > 0 &&
  diffActionPosition.value !== null &&
  (canIgnoreCurrentDiff.value || currentDiffIgnored.value)
);
const diffActionLabel = computed(() =>
  `${i18n.value.diffNavigator.difference} #${currentDiffIndex.value}`
);
const tableHintMessageText = computed(() => activeTableHint.value
    ? formatTableHintMessage(activeTableHint.value)
    : ''
);
const themeStyle = computed(() => getThemeStyle(themeColor.value, appearanceMode.value));

watch([themeColor, appearanceMode], ([nextThemeColor, nextAppearanceMode]) => {
  if (typeof document === 'undefined') return;
  applyThemeVariables(document.documentElement.style, nextThemeColor, nextAppearanceMode);
}, { immediate: true });

function createEmptyDocumentState(): DocumentState {
  return {
    name: '',
    size: 0,
    originalHtml: '',
    highlightedHtml: '',
    textLength: 0,
    imageCount: 0,
    warnings: [],
    layoutNoise: createEmptyLayoutNoise(),
    status: 'idle',
    error: ''
  };
}

async function handleFile(key: PaneKey, file: File): Promise<void> {
  const validationError = validateDocxFile(file);
  if (validationError) {
    clearCompareResult();
    setDocumentError(key, file, validationError);
    return;
  }

  const documentState = documents[key];
  const loadId = ++fileLoadIds[key];

  markDocumentParsing(key, documentState, file);
  clearCompareResult();

  try {
    const parsed = await parseDocx(file, {
      embeddedImageAlt: i18n.value.documentPane.embeddedImageAlt,
      emptyDocumentHtml: i18n.value.documentPane.emptyDocumentHtml
    });
    if (loadId !== fileLoadIds[key]) return;

    applyParsedDocument(documentState, parsed);

    if (parsed.warnings.length > 0) {
      showCompareNotice(i18n.value.app.notices.parseCompleteWithWarnings(file.name, parsed.warnings.length));
    }

    if (ready.value) void compare();
  } catch (error) {
    if (loadId !== fileLoadIds[key]) return;

    documentState.status = 'error';
    const message = error instanceof Error ? error.message : String(error);
    documentErrors[key] = { kind: 'parseFailed', detail: message };
    documentState.error = resolveDocumentError('parseFailed', message);
    showCompareNotice(i18n.value.app.notices.parseFailed);
  }
}

async function loadExternalDocuments(input: ExternalDocumentSet): Promise<void> {
  if (!allowsExternalInput) throw new Error('External document input is disabled.');

  const baseline = input?.baseline;
  const revised = input?.revised;
  if (baseline !== undefined && !isFileLike(baseline)) throw new TypeError('Baseline must be a browser File object.');
  if (revised !== undefined && !isFileLike(revised)) throw new TypeError('Revised must be a browser File object.');

  const documentsToLoad: Array<Promise<void>> = [];
  if (baseline) documentsToLoad.push(handleFile('A', baseline));
  if (revised) documentsToLoad.push(handleFile('B', revised));
  if (documentsToLoad.length === 0) throw new TypeError('Provide a baseline or revised DOCX file.');

  await Promise.all(documentsToLoad);
}

function isFileLike(value: unknown): value is File {
  if (typeof value !== 'object' || value === null) return false;

  const file = value as Partial<File>;
  return typeof file.name === 'string' &&
    typeof file.size === 'number' &&
    typeof file.arrayBuffer === 'function';
}

async function loadBundledSampleDocuments(): Promise<void> {
  if (!deploymentConfig.showSampleDocuments || loadingSampleDocuments.value || hasDocuments.value) return;

  loadingSampleDocuments.value = true;
  try {
    const samples = await loadSampleDocuments(import.meta.env.BASE_URL, {
      A: i18n.value.app.sampleOriginalFileName,
      B: i18n.value.app.sampleRevisedFileName
    });
    await Promise.all([handleFile('A', samples.A), handleFile('B', samples.B)]);
  } catch (error) {
    showCompareNotice(i18n.value.app.notices.sampleLoadFailed);
    console.error(error);
  } finally {
    loadingSampleDocuments.value = false;
  }
}

function validateDocxFile(file: File): ErrorKind | '' {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return 'invalidType';
  }

  if (file.size > maxDocxSize) {
    return 'fileTooLarge';
  }

  if (file.size === 0) {
    return 'emptyFile';
  }

  return '';
}

function setDocumentError(key: PaneKey, file: File, errorKind: ErrorKind): void {
  fileLoadIds[key]++;
  const documentState = documents[key];

  documentState.name = file.name;
  documentState.size = file.size;
  documentState.status = 'error';
  documentErrors[key] = { kind: errorKind };
  documentState.error = resolveDocumentError(errorKind);
  resetDocumentContent(documentState);
  showCompareNotice(documentState.error);
}

function markDocumentParsing(key: PaneKey, documentState: DocumentState, file: File): void {
  documentState.name = file.name;
  documentState.size = file.size;
  documentState.status = 'parsing';
  documentState.error = '';
  delete documentErrors[key];
  resetDocumentContent(documentState);
}

function applyParsedDocument(documentState: DocumentState, parsed: ParsedDocx): void {
  documentState.originalHtml = parsed.html;
  documentState.highlightedHtml = '';
  documentState.textLength = parsed.textLength;
  documentState.imageCount = parsed.imageCount;
  documentState.warnings = parsed.warnings;
  documentState.layoutNoise = parsed.layoutNoise;
  documentState.status = 'ready';
}

function resetDocumentContent(documentState: DocumentState): void {
  documentState.originalHtml = '';
  documentState.highlightedHtml = '';
  documentState.textLength = 0;
  documentState.imageCount = 0;
  documentState.warnings = [];
  documentState.layoutNoise = createEmptyLayoutNoise();
}

watch([diffGranularity, ignoreSpaces, ignoreFullHalfWidth, filterLayoutNoise], () => {
  if (!ready.value) return;

  showCompareNotice(i18n.value.app.notices.settingsUpdated);
  scheduleSettingsCompare();
});

watch(syncScroll, (enabled) => {
  if (!enabled || !hasResult.value) return;

  buildViewportLockMatrix();
  executeViewportSync('A');
});

watch(showTableHints, () => {
  clearTableHintMarkers();
  syncActiveTableHint(resolveFocusedTableHint());
});

watch(enableDiffIgnore, (enabled) => {
  if (enabled) {
    scheduleDiffActionPositionUpdate();
    return;
  }

  closeSimilarDiffs();
  resetIgnoredDiffs();
  diffActionPosition.value = null;

  if (hasResult.value && totalDiffs.value > 0 && currentDiffIndex.value <= 0) {
    currentDiffIndex.value = 1;
    focusOnDiff(1, 'auto');
  }
});

watch(enableSimilarDiffs, (enabled) => {
  if (!enabled) closeSimilarDiffs();
});

watch([diffGranularity, themeColor, appearanceMode, ignoreSpaces, ignoreFullHalfWidth, filterLayoutNoise, syncScroll, showReportExport, showTableHints, showDiffMap, enableDiffIgnore, enableSimilarDiffs, similarDiffLevel], (
    [
      nextDiffGranularity,
      nextThemeColor,
      nextAppearanceMode,
      nextIgnoreSpaces,
      nextIgnoreFullHalfWidth,
      nextFilterLayoutNoise,
      nextSyncScroll,
      nextShowReportExport,
      nextShowTableHints,
      nextShowDiffMap,
      nextEnableDiffIgnore,
      nextEnableSimilarDiffs,
      nextSimilarDiffLevel
    ]
) => {
  writeSavedUserSettings({
    diffGranularity: nextDiffGranularity,
    themeColor: nextThemeColor,
    appearanceMode: nextAppearanceMode,
    ignoreSpaces: nextIgnoreSpaces,
    ignoreFullHalfWidth: nextIgnoreFullHalfWidth,
    filterLayoutNoise: nextFilterLayoutNoise,
    syncScroll: nextSyncScroll,
    showReportExport: nextShowReportExport,
    showTableHints: nextShowTableHints,
    showDiffMap: nextShowDiffMap,
    enableDiffIgnore: nextEnableDiffIgnore,
    enableSimilarDiffs: nextEnableSimilarDiffs,
    similarDiffLevel: nextSimilarDiffLevel
  });
});

watch(locale, () => {
  syncDocumentLocale();
  compareError.value = compareErrorDetail.value
      ? i18n.value.app.errors.compareFailed(compareErrorDetail.value)
      : '';

  (Object.keys(documents) as PaneKey[]).forEach((key) => {
    const errorState = documentErrors[key];
    if (!errorState || documents[key].status !== 'error') return;
    documents[key].error = resolveDocumentError(errorState.kind, errorState.detail);
  });
});

function showCompareNotice(message: string): void {
  compareNotice.value = message;

  if (compareNoticeTimer !== null) window.clearTimeout(compareNoticeTimer);
  compareNoticeTimer = window.setTimeout(() => {
    compareNotice.value = '';
    compareNoticeTimer = null;
  }, 1400);
}

function clearCompareResult(): void {
  compareRunId++;
  clearSettingsCompareTimer();
  cancelPendingTextDiffs();
  if (scrollRaf !== null) {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = null;
  }
  comparing.value = false;
  resetCompareState();
}

function resetCompareState(): void {
  stopLayoutObserver();
  compareError.value = '';
  compareErrorDetail.value = '';
  hasResult.value = false;
  diffSummary.value = { ...EMPTY_DIFF_SUMMARY };
  currentDiffIndex.value = 0;
  closeSimilarDiffs();
  resetIgnoredDiffs();
  syncActiveTableHint(null);
  alignmentAnchors = [];
  diffMapItems.value = [];
  mobilePane.value = 'A';
  clearFocusedDiffElements();
  diffElementIndex.clear();
}

function scheduleSettingsCompare(): void {
  clearSettingsCompareTimer();
  settingsCompareTimer = window.setTimeout(() => {
    settingsCompareTimer = null;
    if (ready.value) void compare(true);
  }, 180);
}

function clearSettingsCompareTimer(): void {
  if (settingsCompareTimer === null) return;

  window.clearTimeout(settingsCompareTimer);
  settingsCompareTimer = null;
}

async function compare(showDoneNotice = false): Promise<void> {
  if (!ready.value) return;

  const runId = ++compareRunId;
  let completed = false;
  cancelPendingTextDiffs();
  resetIgnoredDiffs();
  comparing.value = true;
  compareError.value = '';
  compareErrorDetail.value = '';

  try {
    await nextTick();
    if (runId !== compareRunId || !ready.value) return;

    const result = await compareDocuments(documents.A.originalHtml, documents.B.originalHtml, {
      granularity: diffGranularity.value,
      ignoreSpaces: ignoreSpaces.value,
      ignoreFullHalfWidth: ignoreFullHalfWidth.value,
      filterLayoutNoise: filterLayoutNoise.value,
      layoutNoise: {
        original: documents.A.layoutNoise,
        revised: documents.B.layoutNoise
      }
    });

    if (runId !== compareRunId) return;

    diffSummary.value = result.summary;
    currentDiffIndex.value = result.summary.total > 0 ? 1 : 0;
    documents.A.highlightedHtml = result.originalHtml;
    documents.B.highlightedHtml = result.revisedHtml;
    hasResult.value = true;

    await nextTick();
    if (runId !== compareRunId) return;

    rebuildDiffElementIndex();
    rebuildDiffMapItems();
    buildViewportLockMatrix();
    observeResultLayout();
    if (totalDiffs.value > 0) focusOnDiff(1, 'auto');
    completed = true;
  } catch (error) {
    if (runId !== compareRunId) return;

    const message = error instanceof Error ? error.message : String(error);
    compareErrorDetail.value = message;
    compareError.value = i18n.value.app.errors.compareFailed(message);
    showCompareNotice(i18n.value.app.notices.compareFailed);
    console.error(error);
  } finally {
    if (runId === compareRunId) {
      comparing.value = false;
      if (showDoneNotice && completed) showCompareNotice(i18n.value.app.notices.compareRefreshed);
    }
  }
}

function retryCompare(): void {
  if (!ready.value) return;

  void compare(true);
}

function handleSettingsPanelOpenChange(open: boolean): void {
  settingsPanelOpen.value = open;

  if (open) {
    diffActionPosition.value = null;
    return;
  }

  scheduleDiffActionPositionUpdate();
}

function handleSettingsReset(): void {
  void nextTick(() => showCompareNotice(i18n.value.app.notices.settingsReset));
}

function swapDocuments(): void {
  if (!canSwapDocuments.value) return;

  const original = { ...documents.A };
  const revised = { ...documents.B };
  clearCompareResult();
  fileLoadIds.A++;
  fileLoadIds.B++;
  Object.assign(documents.A, revised);
  Object.assign(documents.B, original);
  showCompareNotice(i18n.value.app.notices.documentsSwapped);
  void compare();
}

function resetDocuments(): void {
  if (!hasDocuments.value || !window.confirm(i18n.value.app.newComparisonConfirm)) return;

  clearCompareResult();
  (['A', 'B'] as PaneKey[]).forEach((key) => {
    fileLoadIds[key]++;
    Object.assign(documents[key], createEmptyDocumentState());
    delete documentErrors[key];
  });
  showCompareNotice(i18n.value.app.notices.newComparisonStarted);
}

async function setMobilePane(key: PaneKey): Promise<void> {
  mobilePane.value = key;
  activeDriver = key;
  await nextTick();
  if (currentDiffIndex.value > 0) focusOnDiff(currentDiffIndex.value, 'auto');
}

function exportReviewReport(): void {
  if (!showReportExport.value) return;

  const generatedAt = new Date();
  const enabledLabel = (enabled: boolean) => enabled
    ? i18n.value.reviewReport.enabled
    : i18n.value.reviewReport.disabled;
  const changes: ReviewReportChange[] = [];

  for (let index = 1; index <= totalDiffs.value; index++) {
    const item = createReviewItem(index, getDiffGroup(index));
    if (!item) continue;

    const ignored = ignoredDiffIds.value.has(item.id);
    changes.push({
      index,
      kind: item.kind,
      kindLabel: i18n.value.diffNavigator.ignoredDiffKind[item.kind],
      statusLabel: ignored ? i18n.value.reviewReport.statusIgnored : i18n.value.reviewReport.statusActive,
      originalPreview: item.originalPreview,
      revisedPreview: item.revisedPreview,
      ignored
    });
  }

  const html = buildReviewReportHtml({
    locale: locale.value,
    title: i18n.value.reviewReport.title,
    generatedAtLabel: i18n.value.reviewReport.generatedAt,
    generatedAt: new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(generatedAt),
    documentsLabel: i18n.value.reviewReport.documents,
    originalLabel: i18n.value.app.documents.A.title,
    originalFileName: documents.A.name,
    revisedLabel: i18n.value.app.documents.B.title,
    revisedFileName: documents.B.name,
    settingsLabel: i18n.value.reviewReport.settings,
    settings: [
      { label: i18n.value.header.diffGranularityLabel, value: i18n.value.header.granularityOptions[diffGranularity.value] },
      { label: i18n.value.header.ignoreSpaces, value: enabledLabel(ignoreSpaces.value) },
      { label: i18n.value.header.ignoreFullHalfWidth, value: enabledLabel(ignoreFullHalfWidth.value) },
      { label: i18n.value.header.filterLayoutNoise, value: enabledLabel(filterLayoutNoise.value) }
    ],
    summaryLabel: i18n.value.reviewReport.summary,
    summary: [
      {
        label: i18n.value.diffNavigator.similarity,
        value: new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 1 }).format(diffSummary.value.similarity)
      },
      { label: i18n.value.diffNavigator.difference, value: String(diffSummary.value.total) },
      { label: i18n.value.diffNavigator.modified, value: String(diffSummary.value.modified) },
      { label: i18n.value.diffNavigator.inserted, value: String(diffSummary.value.inserted) },
      { label: i18n.value.diffNavigator.deleted, value: String(diffSummary.value.deleted) },
      { label: i18n.value.diffNavigator.ignoredDetailsTitle, value: String(ignoredDiffCount.value) }
    ],
    differencesLabel: i18n.value.reviewReport.differences,
    originalPreviewLabel: i18n.value.reviewReport.originalPreview,
    revisedPreviewLabel: i18n.value.reviewReport.revisedPreview,
    emptyPreviewLabel: i18n.value.reviewReport.emptyPreview,
    emptyDifferencesLabel: i18n.value.reviewReport.emptyDifferences,
    privacyNote: i18n.value.reviewReport.privacyNote,
    changes
  });

  downloadReviewReport(html, createReviewReportFileName(generatedAt));
  showCompareNotice(i18n.value.reviewReport.exportedNotice);
}

function createReviewReportFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `docdiff-report-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.html`;
}

function prevDiff(): void {
  const targetIndex = findActiveDiff(currentDiffIndex.value - 1, -1);
  if (targetIndex === null) return;

  currentDiffIndex.value = targetIndex;
  focusOnDiff(targetIndex);
}

function nextDiff(): void {
  const targetIndex = findActiveDiff(currentDiffIndex.value + 1, 1);
  if (targetIndex === null) return;

  currentDiffIndex.value = targetIndex;
  focusOnDiff(targetIndex);
}

function locateDiffFromMap(index: number): void {
  currentDiffIndex.value = index;
  focusOnDiff(index);
}

function ignoreCurrentDiff(): void {
  if (!canIgnoreCurrentDiff.value) return;

  closeSimilarDiffs();
  const ignoredIndex = currentDiffIndex.value;
  if (!ignoreDiffByIndex(ignoredIndex)) return;

  const nextIndex = findActiveDiff(ignoredIndex + 1, 1) ?? findActiveDiff(ignoredIndex - 1, -1);
  if (nextIndex !== null) {
    currentDiffIndex.value = nextIndex;
    focusOnDiff(nextIndex);
    return;
  }

  currentDiffIndex.value = 0;
  clearFocusedDiffElements();
  syncActiveTableHint(null);
}

function ignoreSelectedDiffs(ids: string[]): void {
  if (
    !enableDiffIgnore.value ||
    !enableSimilarDiffs.value ||
    ids.length === 0
  ) return;

  const ignoredIndex = currentDiffIndex.value;
  const ignoredIndices = ignoreDiffIds(ids);
  closeSimilarDiffs();

  if (ignoredIndices.has(ignoredIndex)) {
    const nextIndex = findActiveDiff(ignoredIndex + 1, 1) ?? findActiveDiff(ignoredIndex - 1, -1);
    if (nextIndex !== null) {
      currentDiffIndex.value = nextIndex;
      focusOnDiff(nextIndex);
      return;
    }

    currentDiffIndex.value = 0;
    clearFocusedDiffElements();
    syncActiveTableHint(null);
    return;
  }

  scheduleDiffActionPositionUpdate();
}

function ignoreDiffByIndex(index: number): boolean {
  return ignoreDiffIds([diffReviewId(index)]).has(index);
}

function ignoreDiffIds(ids: string[]): Set<number> {
  const nextIgnoredDiffs = new Map(ignoredDiffs.value);
  const ignoredIndices = new Set<number>();

  ids.forEach((id) => {
    if (nextIgnoredDiffs.has(id)) return;

    const index = diffReviewIndex(id);
    if (Number.isNaN(index)) return;

    const item = createIgnoredDiffItem(index);
    if (!item) return;

    nextIgnoredDiffs.set(id, item);
    ignoredIndices.add(index);
    setDiffIgnoredClass(index, true);
  });

  if (ignoredIndices.size === 0) return ignoredIndices;
  ignoredDiffs.value = nextIgnoredDiffs;
  return ignoredIndices;
}

function restoreCurrentDiff(): void {
  if (currentDiffIndex.value <= 0) return;
  restoreIgnoredDiff(diffReviewId(currentDiffIndex.value));
}

function locateIgnoredDiff(id: string): void {
  const index = diffReviewIndex(id);
  if (Number.isNaN(index)) return;

  currentDiffIndex.value = index;
  focusOnDiff(index);
}

function restoreIgnoredDiff(id: string): void {
  const item = ignoredDiffs.value.get(id);
  if (!item) return;

  const nextIgnoredDiffs = new Map(ignoredDiffs.value);
  nextIgnoredDiffs.delete(id);
  ignoredDiffs.value = nextIgnoredDiffs;
  setDiffIgnoredClass(item.index, false);

  if (currentDiffIndex.value === 0) {
    currentDiffIndex.value = item.index;
    focusOnDiff(item.index, 'auto');
    return;
  }

  if (currentDiffIndex.value === item.index) {
    scheduleDiffActionPositionUpdate();
  }
}

function openSimilarDiffs(): void {
  if (
    !enableSimilarDiffs.value ||
    similarDiffs.value.length === 0
  ) return;
  similarDiffPanelOpen.value = true;
}

function closeSimilarDiffs(): void {
  similarDiffPanelOpen.value = false;
}

function locateSimilarDiff(id: string): void {
  closeSimilarDiffs();
  const index = diffReviewIndex(id);
  if (Number.isNaN(index)) return;

  currentDiffIndex.value = index;
  focusOnDiff(index);
}

function restoreIgnoredDiffs(): void {
  if (ignoredDiffs.value.size === 0) return;

  resetIgnoredDiffs();
  if (!hasResult.value || totalDiffs.value === 0) return;

  if (currentDiffIndex.value > 0) {
    scheduleDiffActionPositionUpdate();
    return;
  }

  currentDiffIndex.value = 1;
  focusOnDiff(1, 'auto');
}

function findActiveDiff(startIndex: number, direction: 1 | -1): number | null {
  return findActiveReviewIndex(startIndex, direction, totalDiffs.value, ignoredDiffIds.value);
}

function isDiffIgnored(index: number): boolean {
  return ignoredDiffs.value.has(diffReviewId(index));
}

function resetIgnoredDiffs(): void {
  ignoredDiffs.value = new Map();
  clearIgnoredDiffClasses();
}

function createIgnoredDiffItem(index: number): IgnoredDiffItem | null {
  return createReviewItem(index, getDiffGroup(index));
}

function setDiffIgnoredClass(index: number, ignored: boolean): void {
  setReviewClass(getDiffGroup(index), 'ignored-diff', ignored);
}

function clearIgnoredDiffClasses(): void {
  clearReviewClass(diffElementIndex, 'ignored-diff');
}

function getDiffGroup(index: number): DiffElementGroup | undefined {
  return diffElementIndex.get(diffReviewId(index));
}

function focusOnDiff(index: number, behavior: ScrollBehavior = 'smooth'): void {
  clearFocusedDiffElements();
  const group = getDiffGroup(index);
  if (!group) {
    diffActionPosition.value = null;
    syncActiveTableHint(null);
    return;
  }

  focusedDiffElements = [...group.A, ...group.B];
  focusedDiffElements.forEach((element) => element.classList.add('focus-diff'));
  syncActiveTableHint(resolveFocusedTableHint(group));
  const containerA = getPaneViewport('A');
  const containerB = getPaneViewport('B');
  const targetA = firstReviewElement(group, 'A');
  const targetB = firstReviewElement(group, 'B');

  activeDriver = null;

  const alignedTopA = containerA && targetA ? smoothViewportAlign(containerA, targetA, behavior) : null;
  const alignedTopB = containerB && targetB ? smoothViewportAlign(containerB, targetB, behavior) : null;
  scheduleDiffActionPositionUpdate();

  if (targetA && targetB) return;

  if (syncScroll.value && alignedTopA !== null) {
    executeViewportSync('A', alignedTopA);
  } else if (syncScroll.value && alignedTopB !== null) {
    executeViewportSync('B', alignedTopB);
  }
}

function clearFocusedDiffElements(): void {
  focusedDiffElements.forEach((element) => {
    if (element) {
      element.classList.remove('focus-diff');
    }
  });
  clearTableHintMarkers();
  focusedDiffElements = [];
  diffActionPosition.value = null;
}

function shouldTrackDiffActionPosition(): boolean {
  return enableDiffIgnore.value &&
    !settingsPanelOpen.value &&
    hasResult.value &&
    currentDiffIndex.value > 0 &&
    focusedDiffElements.length > 0 &&
    (canIgnoreCurrentDiff.value || currentDiffIgnored.value);
}

function scheduleDiffActionPositionUpdate(): void {
  if (!shouldTrackDiffActionPosition()) {
    if (diffActionRaf !== null) {
      cancelAnimationFrame(diffActionRaf);
      diffActionRaf = null;
    }
    diffActionPosition.value = null;
    return;
  }

  if (diffActionRaf !== null) cancelAnimationFrame(diffActionRaf);
  diffActionRaf = requestAnimationFrame(() => {
    diffActionRaf = null;
    updateDiffActionPosition();
  });
}

function updateDiffActionPosition(): void {
  if (!shouldTrackDiffActionPosition()) {
    diffActionPosition.value = null;
    return;
  }

  const target = selectDiffActionTarget();
  if (!target) {
    diffActionPosition.value = null;
    return;
  }

  const rect = target.getBoundingClientRect();
  if (!isDiffActionTargetVisible(target, rect)) {
    diffActionPosition.value = null;
    return;
  }

  diffActionPosition.value = {
    top: rect.top,
    left: clampDiffActionLeft(rect.left + (rect.width / 2))
  };
}

function clampDiffActionLeft(value: number): number {
  const edgeOffset = window.innerWidth <= 520 ? 96 : 132;
  if (window.innerWidth <= edgeOffset * 2) return window.innerWidth / 2;

  return clampNumber(value, edgeOffset, window.innerWidth - edgeOffset);
}

function selectDiffActionTarget(): HTMLElement | null {
  return focusedDiffElements.find((element) => isDiffActionTargetVisible(element)) ?? null;
}

function isDiffActionTargetVisible(element: HTMLElement, elementRect = element.getBoundingClientRect()): boolean {
  const viewport = element.closest<HTMLElement>('.render-viewport');
  if (!viewport) return false;

  const viewportRect = viewport.getBoundingClientRect();
  const visibleTop = Math.max(viewportRect.top, 0);
  const visibleBottom = Math.min(viewportRect.bottom, window.innerHeight);
  const visibleLeft = Math.max(viewportRect.left, 0);
  const visibleRight = Math.min(viewportRect.right, window.innerWidth);

  return elementRect.bottom > visibleTop &&
      elementRect.top < visibleBottom &&
      elementRect.right > visibleLeft &&
      elementRect.left < visibleRight &&
      elementRect.top >= visibleTop + DIFF_ACTION_POPOVER_CLEARANCE;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveFocusedTableHint(group = getDiffGroup(currentDiffIndex.value)): DiffTableContextHint | null {
  if (!showTableHints.value || !hasResult.value || !group) return null;

  return updateTableStructureHint(group);
}

function updateTableStructureHint(group: DiffElementGroup): DiffTableContextHint | null {
  const resolution = resolveTableStructureHint(
      getPaneViewport('A'),
      getPaneViewport('B'),
      group.A,
      group.B,
      {
        ignoreSpaces: ignoreSpaces.value,
        ignoreFullHalfWidth: ignoreFullHalfWidth.value
      }
  );
  if (!resolution) return null;

  const hintElements = resolveTableHintElements(focusedDiffElements, resolution);
  if (hintElements.length === 0) return null;

  applyTableStructureDiffMarkers(hintElements);
  return resolution.hint;
}

function clearTableHintMarkers(): void {
  focusedDiffElements.forEach((element) => {
    if (!element) return;
    element.classList.remove('table-structure-diff');
    restoreTableHintElementAttributes(element);
  });
}

function resolveTableHintElements(
    elements: HTMLElement[],
    resolution: TableStructureResolution
): HTMLElement[] {
  const relevantRows = new Set<HTMLElement>([
    ...resolution.contextRows,
    ...resolution.candidateRows
  ]);

  return elements.filter((element) => {
    const row = element?.closest<HTMLElement>('tr');
    return row ? relevantRows.has(row) : false;
  });
}

function applyTableStructureDiffMarkers(elements: HTMLElement[]): void {
  elements.forEach((element) => {
    if (!element) return;
    element.classList.add('table-structure-diff');
    element.dataset.tableHint = 'true';

    if (!element.hasAttribute('tabindex')) {
      element.dataset.tableHintTabindex = 'added';
      element.tabIndex = 0;
    }
  });
}

function restoreTableHintElementAttributes(element: HTMLElement): void {
  if (!element) return;
  delete element.dataset.tableHint;

  if (element.dataset.tableHintTabindex === 'added') {
    element.removeAttribute('tabindex');
    delete element.dataset.tableHintTabindex;
  }
}

function formatTableHintMessage(hint: DiffTableContextHint): string {
  const rowLabel = formatTableHintRowLabel(hint.candidateRow, hint.candidateRowEnd);

  switch (hint.kind) {
    case 'single-row-inserted':
      return i18n.value.diffNavigator.tableHintMessages.singleRowInserted(hint.tableNumber, rowLabel);
    case 'single-row-deleted':
      return i18n.value.diffNavigator.tableHintMessages.singleRowDeleted(hint.tableNumber, rowLabel);
    case 'row-content-shift':
      return i18n.value.diffNavigator.tableHintMessages.rowContentShift(
          hint.tableNumber,
          formatTableHintSideLabel(hint),
          rowLabel
      );
    case 'cell-count-mismatch':
      return i18n.value.diffNavigator.tableHintMessages.cellCountMismatch(hint.tableNumber, rowLabel);
  }
}

function formatTableHintSideLabel(hint: DiffTableContextHint): string {
  return hint.candidateSide ? i18n.value.diffNavigator.tableHintSides[hint.candidateSide] : '';
}

function formatTableHintRowLabel(row?: number, rowEnd?: number): string {
  if (row === undefined) return '';
  if (rowEnd !== undefined && rowEnd !== row) return `${row}-${rowEnd}`;

  return String(row);
}

function smoothViewportAlign(container: HTMLElement, element: Element, behavior: ScrollBehavior): number {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
  const targetScrollTop = relativeTop - (container.clientHeight * 0.28) + (elementRect.height / 2);

  container.scrollTo({ top: targetScrollTop, behavior });
  return targetScrollTop;
}

function handleDiffClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;

  const diffElement = event.target.closest<HTMLElement>(DIFF_ELEMENT_SELECTOR);
  const rawId = diffElement?.dataset.diffId;
  if (!rawId) return;

  const index = diffReviewIndex(rawId);
  if (Number.isNaN(index)) return;

  currentDiffIndex.value = index;
  focusOnDiff(index);
  if (activeTableHint.value) showTableHintTip();
}

function handleDiffActivate(event: KeyboardEvent): void {
  if (!(event.target instanceof Element)) return;

  const diffElement = event.target.closest<HTMLElement>(DIFF_ELEMENT_SELECTOR);
  const rawId = diffElement?.dataset.diffId;
  if (!rawId) return;

  const index = diffReviewIndex(rawId);
  if (Number.isNaN(index)) return;

  currentDiffIndex.value = index;
  focusOnDiff(index);
  if (activeTableHint.value) showTableHintTip();
}

function syncActiveTableHint(hint: DiffTableContextHint | null): void {
  activeTableHint.value = hint;
  if (!hint) closeTableHintPanel();
}

function showTableHintTip(): void {
  tableHintPanelOpen.value = true;
  scheduleTableHintClose();
}

function scheduleTableHintClose(): void {
  clearTableHintTimer();
  tableHintTimer = window.setTimeout(() => {
    tableHintTimer = null;
    tableHintPanelOpen.value = false;
  }, 3000);
}

function clearTableHintTimer(): void {
  if (tableHintTimer === null) return;

  window.clearTimeout(tableHintTimer);
  tableHintTimer = null;
}

function closeTableHintPanel(): void {
  clearTableHintTimer();
  tableHintPanelOpen.value = false;
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && tableHintPanelOpen.value) closeTableHintPanel();

  if (shouldBlockReviewShortcut(event)) return;
  const shortcut = resolveReviewShortcut(event);
  if (!shortcut || !hasResult.value) return;

  if (shortcut === 'previous' && canPreviousDiff.value) {
    event.preventDefault();
    prevDiff();
    return;
  }

  if (shortcut === 'next' && canNextDiff.value) {
    event.preventDefault();
    nextDiff();
    return;
  }

  if (shortcut === 'toggle-ignore' && (canIgnoreCurrentDiff.value || currentDiffIgnored.value)) {
    event.preventDefault();
    currentDiffIgnored.value ? restoreCurrentDiff() : ignoreCurrentDiff();
  }
}

function shouldBlockReviewShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || settingsPanelOpen.value || similarDiffPanelOpen.value) return true;
  if (document.querySelector('[aria-modal="true"]')) return true;

  const target = event.target;
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function buildViewportLockMatrix(): void {
  alignmentAnchors = [];
  if (!hasResult.value || totalDiffs.value === 0) return;

  const containerA = getPaneViewport('A');
  const containerB = getPaneViewport('B');
  if (!containerA || !containerB) return;

  for (let index = 1; index <= totalDiffs.value; index++) {
    const group = getDiffGroup(index);
    const elementA = firstReviewElement(group, 'A');
    const elementB = firstReviewElement(group, 'B');

    if (elementA && elementB) {
      alignmentAnchors.push({
        topA: getElementScrollTop(containerA, elementA),
        topB: getElementScrollTop(containerB, elementB)
      });
    }
  }
}

function rebuildDiffElementIndex(): void {
  diffElementIndex = buildDiffElementIndex(getPaneViewport('A'), getPaneViewport('B'));
}

function rebuildDiffMapItems(): void {
  const containerA = getPaneViewport('A');
  const containerB = getPaneViewport('B');
  if (!containerA || !containerB) {
    diffMapItems.value = [];
    return;
  }

  const items: DiffMapItem[] = [];
  for (let index = 1; index <= totalDiffs.value; index++) {
    const group = getDiffGroup(index);
    const reviewItem = createReviewItem(index, group);
    if (!group || !reviewItem) continue;

    const positions = [
      getDiffMapPosition(containerA, firstReviewElement(group, 'A')),
      getDiffMapPosition(containerB, firstReviewElement(group, 'B'))
    ].filter((position): position is number => position !== null);
    if (positions.length === 0) continue;

    items.push({
      index,
      kind: reviewItem.kind,
      position: positions.reduce((total, position) => total + position, 0) / positions.length
    });
  }

  diffMapItems.value = items;
}

function getDiffMapPosition(container: HTMLElement, element: HTMLElement | null): number | null {
  if (!element) return null;

  const position = (getElementScrollTop(container, element) / Math.max(container.scrollHeight, 1)) * 100;
  return clampNumber(position, 1, 99);
}

function refreshResultLayout(): void {
  if (!hasResult.value) return;

  rebuildDiffElementIndex();
  rebuildDiffMapItems();
  buildViewportLockMatrix();
  scheduleDiffActionPositionUpdate();

  if (syncScroll.value && activeDriver) {
    executeViewportSync(activeDriver);
  }
}

function scheduleResultLayoutRefresh(): void {
  if (!hasResult.value) return;

  if (layoutTimer !== null) window.clearTimeout(layoutTimer);
  layoutTimer = window.setTimeout(() => {
    layoutTimer = null;
    refreshResultLayout();
  }, 120);
}

function observeResultLayout(): void {
  stopLayoutObserver();

  if (!hasResult.value || typeof ResizeObserver === 'undefined') return;

  layoutObserver = new ResizeObserver(() => {
    scheduleResultLayoutRefresh();
  });
  getResultLayoutTargets().forEach((target) => layoutObserver?.observe(target));
}

function stopLayoutObserver(): void {
  if (layoutObserver) {
    layoutObserver.disconnect();
    layoutObserver = null;
  }

  if (layoutTimer !== null) {
    window.clearTimeout(layoutTimer);
    layoutTimer = null;
  }
}

function getResultLayoutTargets(): HTMLElement[] {
  return (['A', 'B'] as PaneKey[]).flatMap((key) => {
    const viewport = getPaneViewport(key);
    if (!viewport) return [];

    const content = viewport.querySelector<HTMLElement>('.docx-render-content');
    return content ? [viewport, content] : [viewport];
  });
}

function getElementScrollTop(container: HTMLElement, element: HTMLElement): number {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  return elementRect.top - containerRect.top + container.scrollTop;
}

function onScrollA(): void {
  onPaneScroll('A');
}

function onScrollB(): void {
  onPaneScroll('B');
}

function onPaneScroll(key: PaneKey): void {
  if (shouldTrackDiffActionPosition()) scheduleDiffActionPositionUpdate();
  scheduleViewportSync(key);
}

function scheduleViewportSync(key: PaneKey): void {
  if (!syncScroll.value || activeDriver !== key) return;

  if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
  scrollRaf = requestAnimationFrame(() => {
    if (!syncScroll.value || activeDriver !== key) {
      scrollRaf = null;
      return;
    }
    executeViewportSync(key);
    scrollRaf = null;
  });
}

function setActiveDriver(key: PaneKey): void {
  activeDriver = key;
}

function executeViewportSync(sourceKey: PaneKey, sourceTop?: number): void {
  if (!syncScroll.value || !hasResult.value) return;

  const sourceContainer = getPaneViewport(sourceKey);
  const targetContainer = getPaneViewport(sourceKey === 'A' ? 'B' : 'A');
  if (!sourceContainer || !targetContainer) return;

  const maxSourceScroll = getMaxScrollTop(sourceContainer);
  const maxTargetScroll = getMaxScrollTop(targetContainer);
  const targetTop = resolveSyncScrollTop({
    sourceKey,
    sourceTop: sourceTop ?? sourceContainer.scrollTop,
    maxSourceTop: maxSourceScroll,
    maxTargetTop: maxTargetScroll,
    anchors: alignmentAnchors
  });

  setSyncedScrollTop(targetContainer, targetTop, maxTargetScroll);
}

function getPaneViewport(key: PaneKey): HTMLElement | null {
  return key === 'A' ? paneA.value?.viewport ?? null : paneB.value?.viewport ?? null;
}

function getMaxScrollTop(container: HTMLElement): number {
  return Math.max(0, container.scrollHeight - container.clientHeight);
}

function setSyncedScrollTop(container: HTMLElement, scrollTop: number, maxScrollTop: number): void {
  const nextTop = Math.round(Math.min(Math.max(scrollTop, 0), maxScrollTop));
  if (Math.abs(container.scrollTop - nextTop) < 1) return;

  container.scrollTop = nextTop;
}

function handleResize(): void {
  if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null;
    refreshResultLayout();
  }, 150);
}

function resolveDocumentError(kind: ErrorKind, detail?: string): string {
  switch (kind) {
    case 'invalidType':
      return i18n.value.app.errors.invalidType;
    case 'fileTooLarge':
      return i18n.value.app.errors.fileTooLarge(deploymentConfig.maxDocxSizeMb);
    case 'emptyFile':
      return i18n.value.app.errors.emptyFile;
    case 'parseFailed':
      return i18n.value.app.errors.parseFailed(detail ?? '');
  }
}

function syncDocumentLocale(): void {
  document.documentElement.lang = locale.value;
  document.title = i18n.value.app.documentTitle;
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasActiveDocumentSession.value) return;

  event.preventDefault();
  event.returnValue = '';
}

onMounted(() => {
  syncDocumentLocale();
  if (allowsExternalInput) {
    uninstallExternalDocumentApi = installExternalDocumentApi(loadExternalDocuments);
  }
  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleWindowKeydown);
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onUnmounted(() => {
  uninstallExternalDocumentApi?.();
  uninstallExternalDocumentApi = null;
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('keydown', handleWindowKeydown);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  compareRunId++;
  clearSettingsCompareTimer();
  cancelPendingTextDiffs();
  if (compareNoticeTimer !== null) window.clearTimeout(compareNoticeTimer);
  clearTableHintTimer();
  if (typeof document !== 'undefined') clearThemeVariables(document.documentElement.style);
  if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  stopLayoutObserver();
  if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
  if (diffActionRaf !== null) cancelAnimationFrame(diffActionRaf);
});
</script>

<style scoped>
.app-container {
  color-scheme: var(--color-scheme);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  width: 100%;
  max-width: 100vw;
  height: 100vh;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 3px;
  box-sizing: border-box;
  background: var(--bg-app);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

.workspace-container {
  display: flex;
  gap: 3px;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.workspace-container--result {
  gap: 1px;
}

.local-processing-strip {
  min-height: 34px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 4px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-panel);
  color: var(--text-secondary);
  box-shadow: var(--shadow-panel);
}

.local-processing-strip__status,
.local-processing-strip button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  font-weight: 650;
  line-height: 1.2;
}

.local-processing-strip__status svg {
  width: 15px;
  height: 15px;
  color: var(--ins-focus);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.local-processing-strip button {
  min-height: 24px;
  padding: 0 9px;
  border: 1px solid var(--accent-border);
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--accent);
  font-family: inherit;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.local-processing-strip button:hover:not(:disabled) {
  border-color: var(--accent-border-strong);
  background: var(--accent-soft-strong);
  box-shadow: var(--control-shadow-hover);
}

.local-processing-strip button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.local-processing-strip button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.local-processing-strip button svg {
  width: 13px;
  height: 13px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-error-banner {
  background: rgba(var(--del-rgb), 0.1);
  border: 1px solid var(--del-border);
  color: var(--text-primary);
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.78rem;
  font-weight: 600;
  flex-shrink: 0;
}

.app-error-banner button {
  border: 1px solid var(--del-border);
  background: var(--surface-card-solid);
  color: var(--del-text);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, color 0.16s ease;
}

.app-error-banner button:hover {
  border-color: var(--del-focus);
  box-shadow: 0 2px 8px rgba(var(--del-rgb), 0.12);
}

.app-error-banner button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--del-rgb), 0.16);
}

.table-hint-tip {
  position: absolute;
  left: 50%;
  top: 70px;
  z-index: 28;
  width: max-content;
  max-width: calc(100vw - 24px);
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px 7px 12px;
  border-radius: 8px;
  border: 1px solid var(--warning-border);
  background: var(--popup-surface);
  color: var(--warning-ink);
  box-shadow: var(--popup-shadow-sm);
  box-sizing: border-box;
  transform: translateX(-50%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.table-hint-tip::before {
  content: '';
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: var(--warning);
}

.table-hint-tip span {
  min-width: 0;
  flex: 1 1 auto;
  color: var(--warning-ink);
  font-size: 0.74rem;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.table-hint-tip__close {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--warning-border);
  border-radius: 6px;
  background: var(--warning-soft);
  color: var(--warning-strong);
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
}

.table-hint-tip__close:hover {
  border-color: var(--warning-border-strong);
  background: var(--warning-soft-strong);
  color: var(--warning-ink);
}

.table-hint-tip__close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--warning-glow);
}

.table-hint-tip-enter-active,
.table-hint-tip-leave-active {
  transition: opacity var(--popup-motion), transform var(--popup-motion);
}

.table-hint-tip-enter-from,
.table-hint-tip-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}

@media (max-width: 1200px) {
  .app-container {
    gap: 3px;
    padding: 3px;
  }

  .workspace-container {
    gap: 3px;
  }
}

@media (max-width: 820px) {
  .app-container {
    gap: 3px;
    padding: 3px;
  }

  .workspace-container {
    flex-direction: column;
    gap: 3px;
  }

  .local-processing-strip {
    min-height: 32px;
    gap: 10px;
    justify-content: space-between;
  }

  .workspace-container--result {
    display: block;
  }

  .workspace-container--result > .view-dock-panel {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transition: opacity 0.16s ease;
  }

  .workspace-container--result > .mobile-pane-inactive {
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
  }

  .workspace-container--result > .mobile-pane-active {
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
  }

  .table-hint-tip {
    top: 124px;
    max-width: calc(100vw - 16px);
  }
}

@media (max-width: 820px) and (prefers-reduced-motion: reduce) {
  .workspace-container--result > .view-dock-panel {
    transition: none !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .local-processing-strip button {
    transition: none !important;
  }
}
</style>
