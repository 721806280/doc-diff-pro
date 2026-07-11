<template>
  <div class="floating-navigator">
    <div class="navigator-summary">
      <div class="summary-strip">
        <span class="summary-chip similarity" :title="i18n.diffNavigator.similarityTitle">
          {{ i18n.diffNavigator.similarity }} <strong>{{ similarityPercent }}</strong>
        </span>
        <span
            class="summary-chip total"
            :class="{
              clean: summary.total === 0,
              muted: summary.total > 0 && activeDiffCount === 0,
              alert: activeDiffCount > 0
            }"
        >
          {{ diffCountLabel }}
        </span>
        <template v-if="summary.total > 0">
          <span class="summary-chip modified">{{ i18n.diffNavigator.modified }} <strong>{{ summary.modified }}</strong></span>
          <span class="summary-chip inserted">{{ i18n.diffNavigator.inserted }} <strong>{{ summary.inserted }}</strong></span>
          <span class="summary-chip deleted">{{ i18n.diffNavigator.deleted }} <strong>{{ summary.deleted }}</strong></span>
        </template>
        <button
            v-if="summary.layoutNoiseFiltered > 0"
            type="button"
            class="summary-chip layout-noise"
            :class="{ active: layoutNoiseOpen }"
            :title="i18n.diffNavigator.layoutNoiseTitle"
            :aria-expanded="layoutNoiseOpen"
            @click="toggleLayoutNoise"
        >
          {{ i18n.diffNavigator.layoutNoiseFiltered(summary.layoutNoiseFiltered) }}
        </button>
        <button
            v-if="ignoredDiffCount > 0"
            type="button"
            class="summary-chip ignored"
            :class="{ active: ignoredListOpen }"
            :title="i18n.diffNavigator.ignoredDetailsTitle"
            :aria-expanded="ignoredListOpen"
            aria-haspopup="dialog"
            @click="toggleIgnoredList"
        >
          {{ i18n.diffNavigator.ignoredDiffs(ignoredDiffCount) }}
        </button>
        <button
            v-if="canExportReport"
            type="button"
            class="summary-chip export-report"
            :title="i18n.reviewReport.exportTitle"
            :aria-label="i18n.reviewReport.exportTitle"
            @click="$emit('exportReport')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3v11"></path>
            <path d="M8 10l4 4 4-4"></path>
            <path d="M5 18h14"></path>
          </svg>
          {{ i18n.reviewReport.exportLabel }}
        </button>
      </div>
    </div>

    <div v-if="summary.total > 0 && activeDiffCount > 0" class="navigator-controls">
      <div
          class="diff-progress"
          role="progressbar"
          :aria-label="i18n.diffNavigator.currentPositionAria(activeDiffIndex, activeDiffCount)"
          :aria-valuemin="1"
          :aria-valuemax="activeDiffCount"
          :aria-valuenow="activeDiffIndex"
      >
        <div class="diff-progress-meta">
          <span class="diff-progress-index">
            <span class="diff-progress-label">{{ i18n.diffNavigator.difference }}</span>
            <span class="diff-progress-count">{{ activeDiffIndex }}<span class="slash">/</span>{{ activeDiffCount }}</span>
          </span>
          <strong>{{ progressPercent }}%</strong>
        </div>
        <div class="diff-progress-track">
          <div class="diff-progress-bar" :style="{ width: progressWidth }"></div>
        </div>
      </div>

      <div class="nav-triggers">
        <button
            class="btn-action-nav btn-action-nav--previous"
            :title="i18n.diffNavigator.shortcutTitle(i18n.diffNavigator.previous, 'Alt+↑')"
            aria-keyshortcuts="Alt+ArrowUp"
            @click="$emit('previous')"
            :disabled="!canPrevious"
        >
          <span class="btn-action-nav__icon" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </span>
          <span class="btn-action-nav__label">{{ i18n.diffNavigator.previous }}</span>
        </button>
        <button
            class="btn-action-nav btn-action-nav--next"
            :title="i18n.diffNavigator.shortcutTitle(i18n.diffNavigator.next, 'Alt+↓')"
            aria-keyshortcuts="Alt+ArrowDown"
            @click="$emit('next')"
            :disabled="!canNext"
        >
          <span class="btn-action-nav__label">{{ i18n.diffNavigator.next }}</span>
          <span class="btn-action-nav__icon" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
        </button>
      </div>
    </div>
    <div v-else-if="summary.total > 0" class="ignored-empty">
      <span>{{ i18n.diffNavigator.allDiffsIgnored }}</span>
      <button type="button" @click="$emit('restoreAllIgnored')">
        {{ i18n.diffNavigator.restoreIgnored }}
      </button>
    </div>
  </div>

  <IgnoredDiffModal
      :open="ignoredListOpen"
      :items="ignoredDiffs"
      @close="closeIgnoredList"
      @locate="handleLocateIgnored"
      @restore="handleRestoreIgnored"
      @restore-all="handleRestoreAll"
  />

  <LayoutNoiseModal
      :open="layoutNoiseOpen"
      :total="summary.layoutNoiseFiltered"
      :items="summary.layoutNoiseItems"
      @close="closeLayoutNoise"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import IgnoredDiffModal from '@/components/IgnoredDiffModal.vue';
import LayoutNoiseModal from '@/components/LayoutNoiseModal.vue';
import { useI18n } from '@/i18n';
import type { DiffSummary, IgnoredDiffItem } from '@/types/diff';

const props = defineProps<{
  summary: DiffSummary;
  activeDiffCount: number;
  activeDiffIndex: number;
  ignoredDiffCount: number;
  ignoredDiffs: IgnoredDiffItem[];
  canPrevious: boolean;
  canNext: boolean;
  canExportReport: boolean;
}>();

const emit = defineEmits<{
  previous: [];
  next: [];
  locateIgnored: [id: string];
  restoreIgnored: [id: string];
  restoreAllIgnored: [];
  exportReport: [];
}>();

const layoutNoiseOpen = ref(false);
const ignoredListOpen = ref(false);
const { locale, messages: i18n } = useI18n();

const percentFormatter = computed(() => new Intl.NumberFormat(locale.value, {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
}));

const progressPercent = computed(() => {
  if (props.activeDiffCount <= 0) return 0;
  return Math.round((props.activeDiffIndex / props.activeDiffCount) * 100);
});

const progressWidth = computed(() => `${progressPercent.value}%`);
const similarityPercent = computed(() => percentFormatter.value.format(props.summary.similarity));
const diffCountLabel = computed(() => {
  if (props.summary.total === 0) return i18n.value.diffNavigator.noDiffsTag;
  if (props.ignoredDiffCount === 0) return i18n.value.diffNavigator.differenceCount(props.summary.total);

  return i18n.value.diffNavigator.activeDifferenceCount(props.activeDiffCount, props.summary.total);
});

watch(() => props.summary.layoutNoiseFiltered, (count) => {
  if (count === 0) layoutNoiseOpen.value = false;
});

watch(() => props.ignoredDiffCount, (count) => {
  if (count === 0) ignoredListOpen.value = false;
});

function toggleLayoutNoise(): void {
  layoutNoiseOpen.value = !layoutNoiseOpen.value;
}

function closeLayoutNoise(): void {
  layoutNoiseOpen.value = false;
}

function toggleIgnoredList(): void {
  ignoredListOpen.value = !ignoredListOpen.value;
}

function closeIgnoredList(): void {
  ignoredListOpen.value = false;
}

function handleLocateIgnored(id: string): void {
  emit('locateIgnored', id);
  ignoredListOpen.value = false;
}

function handleRestoreIgnored(id: string): void {
  emit('restoreIgnored', id);
}

function handleRestoreAll(): void {
  emit('restoreAllIgnored');
}
</script>

<style scoped>
.floating-navigator {
  background: var(--bg-panel);
  border-radius: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  box-shadow: var(--shadow-panel);
  backdrop-filter: blur(12px);
  position: relative;
  z-index: 5;
}

.navigator-summary, .summary-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.navigator-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: 650;
  white-space: nowrap;
  border: 1px solid var(--border-subtle);
  background: var(--surface-chip);
  min-height: 24px;
  box-sizing: border-box;
  color: var(--text-secondary);
}

.summary-chip strong {
  font-family: 'SF Mono', 'Monaco', monospace;
  font-weight: 750;
}

button.summary-chip {
  appearance: none;
  font-family: inherit;
  cursor: pointer;
}

.summary-chip.total.alert { color: var(--accent-strong); border-color: var(--accent-border); background: var(--accent-soft); }
.summary-chip.total.muted { color: var(--muted-chip-text); border-color: var(--muted-chip-border); background: var(--muted-chip-bg); }
.summary-chip.total.clean, .summary-chip.inserted { color: var(--ins-text); border-color: var(--ins-border); background: rgba(var(--ins-rgb), 0.08); }
.summary-chip.modified { color: var(--modified-text); border-color: rgba(var(--modified-rgb), 0.2); background: rgba(var(--modified-rgb), 0.08); }
.summary-chip.deleted { color: var(--del-text); border-color: var(--del-border); background: rgba(var(--del-rgb), 0.08); }
.summary-chip.similarity { color: var(--similarity-text); border-color: rgba(var(--similarity-rgb), 0.22); background: rgba(var(--similarity-rgb), 0.08); }
.summary-chip.layout-noise { color: var(--warning-strong); border-color: var(--warning-border); background: var(--warning-soft); }
.summary-chip.layout-noise.active { color: var(--warning-ink); border-color: var(--warning-border-strong); background: var(--warning-soft-strong); }
.summary-chip.ignored { color: var(--muted-chip-text); border-color: var(--muted-chip-border); background: var(--muted-chip-bg); }
.summary-chip.ignored:hover, .summary-chip.ignored.active { color: var(--muted-chip-strong); border-color: var(--control-border-hover); background: var(--muted-chip-bg-hover); }
.summary-chip.export-report { color: var(--accent); border-color: var(--accent-border); background: var(--accent-soft); }
.summary-chip.export-report:hover { border-color: var(--accent-border-strong); background: var(--accent-soft-strong); }
.summary-chip.export-report svg { width: 13px; height: 13px; stroke-linecap: round; stroke-linejoin: round; }

.diff-progress {
  width: 112px;
  display: grid;
  gap: 4px;
  flex: 0 0 112px;
  min-width: 0;
}

.diff-progress-meta {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 700;
  min-width: 0;
}

.diff-progress-index {
  display: flex;
  gap: 4px;
  min-width: 0;
}

.diff-progress-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-progress-count {
  flex: 0 0 auto;
}

.diff-progress-count, .diff-progress-meta strong {
  font-family: 'SF Mono', 'Monaco', monospace;
}

.diff-progress-meta strong {
  flex: 0 0 auto;
  color: var(--accent);
  font-size: 0.66rem;
}
.slash { color: var(--text-tertiary); margin: 0 1px; font-weight: 400; }

.diff-progress-track {
  height: 3px;
  width: 100%;
  border-radius: 999px;
  background: var(--border-subtle);
  overflow: hidden;
}

.diff-progress-bar {
  height: 100%;
  min-width: 6px;
  background: var(--gradient-accent);
  transition: width 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.nav-triggers {
  display: grid;
  grid-template-columns: auto auto;
  gap: 6px;
  align-items: center;
}

.btn-action-nav {
  min-height: 30px;
  padding: 0 10px;
  background: var(--control-surface-hover);
  border: 1px solid var(--control-border);
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 650;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: var(--inset-control);
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  white-space: nowrap;
}

.btn-action-nav__icon {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.btn-action-nav__icon svg {
  display: block;
}

.btn-action-nav__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-action-nav--previous {
  padding-left: 8px;
}

.btn-action-nav--next {
  padding-right: 8px;
}

.btn-action-nav:hover:not(:disabled) {
  background: var(--control-surface-hover);
  color: var(--accent);
  border-color: var(--accent-border);
  box-shadow: var(--control-shadow-hover);
}

.btn-action-nav:disabled {
  background: var(--control-surface-disabled);
  border-color: var(--control-border);
  color: var(--text-tertiary);
  cursor: not-allowed;
  box-shadow: none;
}

.btn-action-nav:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.ignored-empty {
  min-width: min(320px, 100%);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 650;
}

.ignored-empty span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ignored-empty button {
  min-height: 28px;
  flex: 0 0 auto;
  padding: 0 10px;
  border: 1px solid var(--control-border);
  border-radius: 7px;
  background: var(--surface-card-solid);
  color: var(--accent);
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.ignored-empty button:hover {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  box-shadow: var(--control-shadow-hover);
}

.ignored-empty button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-glow);
}

@media (max-width: 820px) {
  .floating-navigator {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    padding: 8px;
  }

  .navigator-controls {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    justify-content: stretch;
    gap: 10px;
  }

  .nav-triggers {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .ignored-empty {
    justify-content: space-between;
  }

  .btn-action-nav {
    font-size: 0.65rem;
  }
}

@media (max-width: 440px) {
  .summary-chip.modified,
  .summary-chip.inserted,
  .summary-chip.deleted,
  .summary-chip.similarity {
    display: none;
  }

  .navigator-controls {
    grid-template-columns: minmax(0, 1fr);
  }

  .diff-progress {
    width: 100%;
    flex-basis: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .diff-progress-bar,
  .btn-action-nav {
    transition: none !important;
  }
}
</style>
