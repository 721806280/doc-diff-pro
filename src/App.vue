<template>
  <div class="app-container">
    <AppHeader
        v-model:diff-granularity="diffGranularity"
        v-model:ignore-spaces="ignoreSpaces"
        v-model:ignore-full-half-width="ignoreFullHalfWidth"
        v-model:filter-layout-noise="filterLayoutNoise"
        v-model:sync-scroll="syncScroll"
        v-model:show-table-hints="showTableHints"
    />

    <CompareToast :message="compareNotice" :comparing="comparing" />

    <div v-if="compareError" class="app-error-banner" role="alert">
      <span>{{ compareError }}</span>
      <button type="button" @click="retryCompare">{{ i18n.app.retryCompare }}</button>
    </div>

    <DiffNavigator
        v-if="hasResult"
        :summary="diffSummary"
        :current-diff-index="currentDiffIndex"
        @previous="prevDiff"
        @next="nextDiff"
    />

    <div class="workspace-container">
      <DocumentPane
          ref="paneA"
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
          :waiting-text="i18n.app.documents.A.waitingText"
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

      <DocumentPane
          ref="paneB"
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
          :waiting-text="i18n.app.documents.B.waitingText"
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
import { useI18n } from '@/i18n';
import AppHeader from './components/AppHeader.vue';
import CompareToast from './components/CompareToast.vue';
import DiffNavigator from './components/DiffNavigator.vue';
import DocumentPane from './components/DocumentPane.vue';
import type { DiffGranularity, DiffSummary, DiffTableContextHint } from './types/diff';
import {
  buildDiffElementIndex,
  DIFF_ELEMENT_SELECTOR,
  type DiffElementGroup,
  type DiffElementIndex
} from './utils/diffElementIndex';
import { readSavedAppSettings, writeSavedAppSettings } from './utils/appSettings';
import { compareDocuments } from './utils/diffEngine';
import { cancelPendingTextDiffs } from './utils/diffWorkerClient';
import { parseDocx, type ParsedDocx } from './utils/docxParser';
import { createEmptyLayoutNoise, type LayoutNoiseData } from './utils/layoutNoise';
import { resolveTableStructureHint, type TableStructureResolution } from './utils/tableStructureHint';
import { diffId, parseDiffId } from './utils/textDiffCore';

type PaneKey = 'A' | 'B';

type DocumentPaneExpose = {
  viewport: HTMLElement | null;
};

type AlignmentAnchor = {
  topA: number;
  topB: number;
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

const EMPTY_DIFF_SUMMARY: DiffSummary = {
  total: 0,
  inserted: 0,
  deleted: 0,
  modified: 0,
  similarity: 1,
  layoutNoiseFiltered: 0,
  layoutNoiseItems: []
};
const MAX_DOCX_SIZE = 25 * 1024 * 1024;

const documents = reactive<Record<PaneKey, DocumentState>>({
  A: createEmptyDocumentState(),
  B: createEmptyDocumentState()
});
const comparing = ref(false);
const compareNotice = ref('');
const compareError = ref('');
const hasResult = ref(false);
const diffSummary = ref<DiffSummary>({ ...EMPTY_DIFF_SUMMARY });
const currentDiffIndex = ref(0);
const activeTableHint = ref<DiffTableContextHint | null>(null);
const tableHintPanelOpen = ref(false);
const initialSettings = readSavedAppSettings();
const syncScroll = ref(initialSettings.syncScroll);
const showTableHints = ref(initialSettings.showTableHints);

const ignoreSpaces = ref(initialSettings.ignoreSpaces);
const ignoreFullHalfWidth = ref(initialSettings.ignoreFullHalfWidth);
const filterLayoutNoise = ref(initialSettings.filterLayoutNoise);
const diffGranularity = ref<DiffGranularity>(initialSettings.diffGranularity);

const paneA = ref<DocumentPaneExpose | null>(null);
const paneB = ref<DocumentPaneExpose | null>(null);
const { locale, messages: i18n } = useI18n();

let activeDriver: PaneKey | null = null;
let alignmentAnchors: AlignmentAnchor[] = [];
let diffElementIndex: DiffElementIndex = new Map();
let focusedDiffElements: HTMLElement[] = [];
let compareNoticeTimer: number | null = null;
let tableHintTimer: number | null = null;
let resizeTimer: number | null = null;
let settingsCompareTimer: number | null = null;
let scrollRaf: number | null = null;
let compareRunId = 0;
const fileLoadIds: Record<PaneKey, number> = { A: 0, B: 0 };
const documentErrors = reactive<Partial<Record<PaneKey, { kind: ErrorKind; detail?: string }>>>({});
const compareErrorDetail = ref('');

const ready = computed(() => documents.A.status === 'ready' && documents.B.status === 'ready');
const totalDiffs = computed(() => diffSummary.value.total);
const tableHintMessageText = computed(() => activeTableHint.value
    ? formatTableHintMessage(activeTableHint.value)
    : ''
);

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

function validateDocxFile(file: File): ErrorKind | '' {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return 'invalidType';
  }

  if (file.size > MAX_DOCX_SIZE) {
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

watch([diffGranularity, ignoreSpaces, ignoreFullHalfWidth, filterLayoutNoise, syncScroll, showTableHints], (
    [
      nextDiffGranularity,
      nextIgnoreSpaces,
      nextIgnoreFullHalfWidth,
      nextFilterLayoutNoise,
      nextSyncScroll,
      nextShowTableHints
    ]
) => {
  writeSavedAppSettings({
    diffGranularity: nextDiffGranularity,
    ignoreSpaces: nextIgnoreSpaces,
    ignoreFullHalfWidth: nextIgnoreFullHalfWidth,
    filterLayoutNoise: nextFilterLayoutNoise,
    syncScroll: nextSyncScroll,
    showTableHints: nextShowTableHints
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
  compareError.value = '';
  compareErrorDetail.value = '';
  hasResult.value = false;
  diffSummary.value = { ...EMPTY_DIFF_SUMMARY };
  currentDiffIndex.value = 0;
  syncActiveTableHint(null);
  alignmentAnchors = [];
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
  cancelPendingTextDiffs();
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
    buildViewportLockMatrix();
    if (totalDiffs.value > 0) focusOnDiff(1, 'auto');
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
      if (showDoneNotice) showCompareNotice(i18n.value.app.notices.compareRefreshed);
    }
  }
}

function retryCompare(): void {
  if (!ready.value) return;

  void compare(true);
}

function prevDiff(): void {
  if (currentDiffIndex.value <= 1) return;

  currentDiffIndex.value--;
  focusOnDiff(currentDiffIndex.value);
}

function nextDiff(): void {
  if (currentDiffIndex.value >= totalDiffs.value) return;

  currentDiffIndex.value++;
  focusOnDiff(currentDiffIndex.value);
}

function focusOnDiff(index: number, behavior: ScrollBehavior = 'smooth'): void {
  clearFocusedDiffElements();
  const group = diffElementIndex.get(diffId(index));
  if (!group) {
    syncActiveTableHint(null);
    return;
  }

  focusedDiffElements = [...group.A, ...group.B];
  focusedDiffElements.forEach((element) => element.classList.add('focus-diff'));
  syncActiveTableHint(resolveFocusedTableHint(group));
  const containerA = getPaneViewport('A');
  const containerB = getPaneViewport('B');
  const targetA = firstDiffElement(group, 'A');
  const targetB = firstDiffElement(group, 'B');

  activeDriver = null;

  const alignedTopA = containerA && targetA ? smoothViewportAlign(containerA, targetA, behavior) : null;
  const alignedTopB = containerB && targetB ? smoothViewportAlign(containerB, targetB, behavior) : null;

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
}

function resolveFocusedTableHint(group = diffElementIndex.get(diffId(currentDiffIndex.value))): DiffTableContextHint | null {
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
    case 'row-count-mismatch':
      return i18n.value.diffNavigator.tableHintMessages.rowCountMismatch(hint.tableNumber);
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

function firstDiffElement(group: DiffElementGroup, key: PaneKey): HTMLElement | null {
  return group[key][0] ?? null;
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

  const index = parseDiffId(rawId);
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

  const index = parseDiffId(rawId);
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
}

function buildViewportLockMatrix(): void {
  alignmentAnchors = [];
  if (!hasResult.value || totalDiffs.value === 0) return;

  const containerA = getPaneViewport('A');
  const containerB = getPaneViewport('B');
  if (!containerA || !containerB) return;

  for (let index = 1; index <= totalDiffs.value; index++) {
    const group = diffElementIndex.get(diffId(index));
    const elementA = group ? firstDiffElement(group, 'A') : null;
    const elementB = group ? firstDiffElement(group, 'B') : null;

    if (elementA && elementB) {
      alignmentAnchors.push({ topA: elementA.offsetTop, topB: elementB.offsetTop });
    }
  }
}

function rebuildDiffElementIndex(): void {
  diffElementIndex = buildDiffElementIndex(getPaneViewport('A'), getPaneViewport('B'));
}

function onScrollA(): void {
  if (!syncScroll.value || activeDriver !== 'A') return;
  if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
  scrollRaf = requestAnimationFrame(() => {
    if (!syncScroll.value || activeDriver !== 'A') {
      scrollRaf = null;
      return;
    }
    executeViewportSync('A');
    scrollRaf = null;
  });
}

function onScrollB(): void {
  if (!syncScroll.value || activeDriver !== 'B') return;
  if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
  scrollRaf = requestAnimationFrame(() => {
    if (!syncScroll.value || activeDriver !== 'B') {
      scrollRaf = null;
      return;
    }
    executeViewportSync('B');
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
  const currentSourceTop = clampScrollTop(sourceTop ?? sourceContainer.scrollTop, maxSourceScroll);

  if (currentSourceTop <= 4) {
    targetContainer.scrollTop = 0;
    return;
  }

  if (currentSourceTop >= maxSourceScroll - 4) {
    targetContainer.scrollTop = maxTargetScroll;
    return;
  }

  if (alignmentAnchors.length === 0) {
    targetContainer.scrollTop = maxSourceScroll > 0
        ? Math.round((currentSourceTop / maxSourceScroll) * maxTargetScroll)
        : 0;
    return;
  }

  syncByAnchors(sourceKey, currentSourceTop, maxSourceScroll, maxTargetScroll, targetContainer);
}

function syncByAnchors(
    sourceKey: PaneKey,
    currentSourceTop: number,
    maxSourceScroll: number,
    maxTargetScroll: number,
    targetContainer: HTMLElement
): void {
  const sourceTopKey = sourceKey === 'A' ? 'topA' : 'topB';
  const targetTopKey = sourceKey === 'A' ? 'topB' : 'topA';
  const nextIndex = alignmentAnchors.findIndex((anchor) => anchor[sourceTopKey] >= currentSourceTop);

  if (nextIndex === 0) {
    const first = alignmentAnchors[0];
    targetContainer.scrollTop = interpolateScrollTop(currentSourceTop, 0, first[sourceTopKey], 0, first[targetTopKey]);
    return;
  }

  if (nextIndex === -1) {
    const last = alignmentAnchors[alignmentAnchors.length - 1];
    targetContainer.scrollTop = interpolateScrollTop(
        currentSourceTop,
        last[sourceTopKey],
        maxSourceScroll,
        last[targetTopKey],
        maxTargetScroll
    );
    return;
  }

  const previous = alignmentAnchors[nextIndex - 1];
  const next = alignmentAnchors[nextIndex];
  targetContainer.scrollTop = interpolateScrollTop(
      currentSourceTop,
      previous[sourceTopKey],
      next[sourceTopKey],
      previous[targetTopKey],
      next[targetTopKey]
  );
}

function getPaneViewport(key: PaneKey): HTMLElement | null {
  return key === 'A' ? paneA.value?.viewport ?? null : paneB.value?.viewport ?? null;
}

function getMaxScrollTop(container: HTMLElement): number {
  return Math.max(0, container.scrollHeight - container.clientHeight);
}

function clampScrollTop(value: number, maxScrollTop: number): number {
  return Math.min(Math.max(value, 0), maxScrollTop);
}

function interpolateScrollTop(
    sourceTop: number,
    sourceStart: number,
    sourceEnd: number,
    targetStart: number,
    targetEnd: number
): number {
  const sourceDistance = sourceEnd - sourceStart;
  if (sourceDistance <= 0) return targetStart;

  const ratio = (sourceTop - sourceStart) / sourceDistance;
  return targetStart + (ratio * (targetEnd - targetStart));
}

function handleResize(): void {
  if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null;
    if (hasResult.value) buildViewportLockMatrix();
  }, 150);
}

function resolveDocumentError(kind: ErrorKind, detail?: string): string {
  switch (kind) {
    case 'invalidType':
      return i18n.value.app.errors.invalidType;
    case 'fileTooLarge':
      return i18n.value.app.errors.fileTooLarge;
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

onMounted(() => {
  syncDocumentLocale();
  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleWindowKeydown);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('keydown', handleWindowKeydown);
  compareRunId++;
  clearSettingsCompareTimer();
  cancelPendingTextDiffs();
  if (compareNoticeTimer !== null) window.clearTimeout(compareNoticeTimer);
  clearTableHintTimer();
  if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
});
</script>

<style scoped>
.app-container {
  --bg-app: transparent;
  --bg-panel: rgba(255, 255, 255, 0.95);
  --border-subtle: rgba(229, 231, 235, 0.82);
  --border-strong: #d1d5db;
  --text-primary: #111827;
  --text-secondary: #4b5563;
  --text-tertiary: #9ca3af;

  --accent: #4f46e5;
  --accent-rgb: 79, 70, 229;
  --accent-glow: rgba(var(--accent-rgb), 0.16);

  --ins-text: #15803d;
  --ins-border: rgba(22, 163, 74, 0.28);
  --ins-focus: #16a34a;
  --ins-rgb: 22, 163, 74;

  --del-text: #b91c1c;
  --del-border: rgba(220, 38, 38, 0.28);
  --del-focus: #dc2626;
  --del-rgb: 220, 38, 38;

  --gradient-accent: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
  --gradient-ins: linear-gradient(135deg, rgba(var(--ins-rgb), 0.12) 0%, rgba(var(--ins-rgb), 0.06) 100%);
  --gradient-del: linear-gradient(135deg, rgba(var(--del-rgb), 0.12) 0%, rgba(var(--del-rgb), 0.06) 100%);

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

.app-error-banner {
  background: rgba(255, 241, 242, 0.96);
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
  background: #ffffff;
  color: var(--del-text);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.app-error-banner button:hover {
  border-color: var(--del-focus);
  box-shadow: 0 2px 8px rgba(var(--del-rgb), 0.12);
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
  border: 1px solid rgba(217, 119, 6, 0.24);
  background: rgba(255, 255, 255, 0.96);
  color: #78350f;
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
  background: #d97706;
}

.table-hint-tip span {
  min-width: 0;
  flex: 1 1 auto;
  color: #78350f;
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
  border: 1px solid rgba(217, 119, 6, 0.18);
  border-radius: 6px;
  background: rgba(255, 251, 235, 0.7);
  color: #92400e;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
}

.table-hint-tip__close:hover {
  border-color: rgba(217, 119, 6, 0.32);
  background: rgba(254, 243, 199, 0.9);
  color: #78350f;
}

.table-hint-tip__close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
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

  .table-hint-tip {
    top: 124px;
    max-width: calc(100vw - 16px);
  }
}
</style>
