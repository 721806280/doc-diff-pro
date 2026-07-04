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
        <button class="btn-action-nav" @click="$emit('previous')" :disabled="currentDiffIndex <= 1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          <span>{{ i18n.diffNavigator.previous }}</span>
        </button>
        <button class="btn-action-nav" @click="$emit('next')" :disabled="currentDiffIndex >= summary.total">
          <span>{{ i18n.diffNavigator.next }}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
        <div class="panel-divider"></div>
        <button
            type="button"
            class="ios-toggle-shell"
            :class="{ active: syncScroll }"
            :title="i18n.diffNavigator.syncScrollTitle"
            :aria-pressed="syncScroll"
            @click="$emit('toggle-sync')"
        >
          <div class="ios-switch"></div>
          <span>{{ i18n.diffNavigator.syncScroll }}</span>
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
  syncScroll: boolean;
}>();

defineEmits<{
  previous: [];
  next: [];
  'toggle-sync': [];
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

.summary-chip.total.alert, .summary-chip.deleted { color: var(--del-text); border-color: var(--del-border); background: rgba(var(--del-rgb), 0.08); }
.summary-chip.total.clean, .summary-chip.inserted { color: var(--ins-text); border-color: var(--ins-border); background: rgba(var(--ins-rgb), 0.08); }
.summary-chip.modified { color: var(--accent); border-color: rgba(var(--accent-rgb), 0.2); background: rgba(var(--accent-rgb), 0.08); }
.summary-chip.similarity { color: #0f766e; border-color: rgba(15, 118, 110, 0.22); background: rgba(15, 118, 110, 0.08); }
.summary-chip.layout-noise { color: #a16207; border-color: rgba(217, 119, 6, 0.24); background: rgba(245, 158, 11, 0.1); }
.summary-chip.layout-noise.active { color: #92400e; border-color: rgba(217, 119, 6, 0.34); background: rgba(245, 158, 11, 0.16); }

.diff-progress {
  width: 120px;
  display: grid;
  gap: 4px;
}

.diff-progress-meta {
  display: flex;
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 700;
}

.diff-progress-index {
  display: flex;
  gap: 4px;
}

.diff-progress-count, .diff-progress-meta strong {
  font-family: 'SF Mono', 'Monaco', monospace;
}

.diff-progress-meta strong { color: var(--accent); font-size: 0.66rem; }
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
  gap: 4px;
  align-items: center;
}

.btn-action-nav {
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  min-height: 28px;
  padding: 0 10px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.18s ease;
  white-space: nowrap;
}

.btn-action-nav:hover:not(:disabled) {
  background: linear-gradient(180deg, #ffffff 0%, #eef2ff 100%);
  color: var(--accent);
  border-color: var(--accent);
}

.btn-action-nav:disabled { opacity: 0.4; cursor: not-allowed; }

.ios-toggle-shell {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  min-height: 28px;
  padding: 0 6px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
}

.ios-switch {
  width: 26px;
  height: 15px;
  background: linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%);
  border-radius: 99px;
  position: relative;
  transition: background 0.2s ease;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
}

.ios-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 11px;
  height: 11px;
  background: white;
  border-radius: 50%;
  transition: left 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.ios-toggle-shell.active, .ios-toggle-shell:active { color: var(--accent); }
.ios-toggle-shell.active .ios-switch { background: var(--gradient-accent); }
.ios-toggle-shell.active .ios-switch::after { left: 13px; }

.btn-action-nav:focus-visible, .ios-toggle-shell:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.ios-toggle-shell span, .btn-action-nav span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-divider {
  height: 14px;
  width: 1px;
  background: linear-gradient(180deg, transparent, var(--border-strong), transparent);
  margin: 0 6px;
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
  }

  .btn-action-nav, .ios-toggle-shell {
    justify-content: center;
    font-size: 0.65rem;
  }

  .panel-divider {
    display: none;
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
  }
}

@media (prefers-reduced-motion: reduce) {
  .diff-progress-bar, .ios-switch, .ios-switch::after {
    transition: none !important;
  }
}
</style>
