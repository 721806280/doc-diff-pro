<template>
  <div class="floating-navigator">
    <div class="navigator-summary">
      <div class="summary-strip">
        <span class="summary-chip similarity" :title="i18n.diffNavigator.similarityTitle">
          {{ i18n.diffNavigator.similarity }} <strong>{{ similarityPercent }}</strong>
        </span>
        <span class="summary-chip total" :class="{ clean: summary.total === 0, alert: summary.total > 0 }">
          {{ summary.total === 0 ? i18n.diffNavigator.noDiffsTag : i18n.diffNavigator.differenceCount(summary.total) }}
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
      </div>
    </div>

    <div v-if="summary.total > 0" class="navigator-controls">
      <div
          class="diff-progress"
          role="progressbar"
          :aria-label="i18n.diffNavigator.currentPositionAria(currentDiffIndex, summary.total)"
          :aria-valuemin="1"
          :aria-valuemax="summary.total"
          :aria-valuenow="currentDiffIndex"
      >
        <div class="diff-progress-meta">
          <span class="diff-progress-index">
            <span class="diff-progress-label">{{ i18n.diffNavigator.difference }}</span>
            <span class="diff-progress-count">{{ currentDiffIndex }}<span class="slash">/</span>{{ summary.total }}</span>
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
            @click="$emit('previous')"
            :disabled="currentDiffIndex <= 1"
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
            @click="$emit('next')"
            :disabled="currentDiffIndex >= summary.total"
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
  </div>

  <LayoutNoiseModal
      :open="layoutNoiseOpen"
      :total="summary.layoutNoiseFiltered"
      :items="summary.layoutNoiseItems"
      @close="closeLayoutNoise"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import LayoutNoiseModal from '@/components/LayoutNoiseModal.vue';
import { useI18n } from '@/i18n';
import type { DiffSummary } from '@/types/diff';

const props = defineProps<{
  summary: DiffSummary;
  currentDiffIndex: number;
}>();

defineEmits<{
  previous: [];
  next: [];
}>();

const layoutNoiseOpen = ref(false);
const { locale, messages: i18n } = useI18n();

const percentFormatter = computed(() => new Intl.NumberFormat(locale.value, {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
}));

const progressPercent = computed(() => {
  if (props.summary.total <= 0) return 0;
  return Math.round((props.currentDiffIndex / props.summary.total) * 100);
});

const progressWidth = computed(() => `${progressPercent.value}%`);
const similarityPercent = computed(() => percentFormatter.value.format(props.summary.similarity));

watch(() => props.summary.layoutNoiseFiltered, (count) => {
  if (count === 0) layoutNoiseOpen.value = false;
});

function toggleLayoutNoise(): void {
  layoutNoiseOpen.value = !layoutNoiseOpen.value;
}

function closeLayoutNoise(): void {
  layoutNoiseOpen.value = false;
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
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.03);
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
  background: rgba(248, 250, 252, 0.9);
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

.summary-chip.total.alert { color: #1d4ed8; border-color: rgba(37, 99, 235, 0.24); background: rgba(37, 99, 235, 0.08); }
.summary-chip.total.clean, .summary-chip.inserted { color: var(--ins-text); border-color: var(--ins-border); background: rgba(var(--ins-rgb), 0.08); }
.summary-chip.modified { color: #6d28d9; border-color: rgba(109, 40, 217, 0.2); background: rgba(109, 40, 217, 0.08); }
.summary-chip.deleted { color: var(--del-text); border-color: var(--del-border); background: rgba(var(--del-rgb), 0.08); }
.summary-chip.similarity { color: #0f766e; border-color: rgba(15, 118, 110, 0.22); background: rgba(15, 118, 110, 0.08); }
.summary-chip.layout-noise { color: #a16207; border-color: rgba(217, 119, 6, 0.24); background: rgba(245, 158, 11, 0.1); }
.summary-chip.layout-noise.active { color: #92400e; border-color: rgba(217, 119, 6, 0.34); background: rgba(245, 158, 11, 0.16); }

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
  background: rgba(203, 213, 225, 0.64);
  overflow: hidden;
}

.diff-progress-bar {
  height: 100%;
  min-width: 6px;
  background: var(--gradient-accent);
  transition: width 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.nav-triggers {
  display: flex;
  gap: 6px;
  align-items: center;
}

.btn-action-nav {
  min-height: 30px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 650;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78);
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
  background: #ffffff;
  color: var(--accent);
  border-color: rgba(var(--accent-rgb), 0.22);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.btn-action-nav:disabled {
  background: rgba(248, 250, 252, 0.78);
  border-color: rgba(148, 163, 184, 0.12);
  color: var(--text-tertiary);
  cursor: not-allowed;
  box-shadow: none;
}

.btn-action-nav:focus-visible {
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
