<template>
  <div class="floating-navigator">
    <div class="navigator-summary">
      <div class="summary-strip">
        <div class="radar-dot" :class="{ clean: summary.total === 0 }"></div>
        <span class="summary-chip status" :class="{ clean: summary.total === 0 }">
          {{ i18n.diffNavigator.complete }}
        </span>
        <span class="summary-chip total" :class="{ clean: summary.total === 0, alert: summary.total > 0 }">
          {{ summary.total === 0 ? i18n.diffNavigator.noDiffsTag : i18n.diffNavigator.differenceCount(summary.total) }}
        </span>
        <span class="summary-chip similarity" :title="i18n.diffNavigator.similarityTitle">
          {{ i18n.diffNavigator.similarity }} <strong>{{ similarityPercent }}</strong>
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
  minimumFractionDigits: 1,
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
  padding: 7px 10px;
  border: 1px solid var(--border-subtle);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  flex-shrink: 0;
  box-shadow:
    0 2px 8px rgba(15, 23, 42, 0.04),
    0 8px 24px rgba(15, 23, 42, 0.03);
  backdrop-filter: blur(12px);
  position: relative;
  z-index: 5;
  animation: navigator-rise 0.34s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.navigator-summary {
  min-width: 0;
  display: grid;
  gap: 6px;
  align-items: start;
}

.navigator-controls {
  display: flex;
  align-items: center;
  justify-self: end;
  gap: 12px;
  min-width: 0;
}

.summary-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.radar-dot {
  width: 7px;
  height: 7px;
  background: var(--del-focus);
  border-radius: 50%;
  animation: micro-flash 2s infinite;
  box-shadow: 0 0 8px rgba(var(--del-rgb), 0.36);
}

.radar-dot.clean {
  background: var(--ins-focus);
  animation: none;
  box-shadow: 0 0 8px rgba(var(--ins-rgb), 0.36);
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: 650;
  white-space: nowrap;
  border: 1px solid var(--border-subtle);
  background: rgba(248, 250, 252, 0.9);
  line-height: 1;
  min-height: 22px;
  box-sizing: border-box;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.summary-chip strong {
  font-family: 'SF Mono', 'Monaco', monospace;
  font-weight: 750;
}

button.summary-chip {
  appearance: none;
  font-family: inherit;
  margin: 0;
  cursor: pointer;
}

.summary-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.05);
}

.summary-chip.status {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.94);
}

.summary-chip.status.clean {
  color: var(--ins-text);
  border-color: rgba(var(--ins-rgb), 0.18);
  background: rgba(var(--ins-rgb), 0.08);
}

.summary-chip.total.alert {
  color: var(--del-text);
  border-color: var(--del-border);
  background: rgba(var(--del-rgb), 0.08);
}

.summary-chip.total.clean {
  color: var(--ins-text);
  border-color: rgba(var(--ins-rgb), 0.18);
  background: rgba(var(--ins-rgb), 0.08);
}

.summary-chip.modified {
  color: var(--accent);
  border-color: rgba(var(--accent-rgb), 0.2);
  background: rgba(var(--accent-rgb), 0.08);
}

.summary-chip.similarity {
  color: #0f766e;
  border-color: rgba(15, 118, 110, 0.22);
  background: rgba(15, 118, 110, 0.08);
}

.summary-chip.inserted {
  color: var(--ins-text);
  border-color: var(--ins-border);
  background: rgba(var(--ins-rgb), 0.08);
}

.summary-chip.deleted {
  color: var(--del-text);
  border-color: var(--del-border);
  background: rgba(var(--del-rgb), 0.08);
}

.summary-chip.layout-noise {
  color: #a16207;
  border-color: rgba(217, 119, 6, 0.24);
  background: rgba(245, 158, 11, 0.1);
  padding-inline: 6px;
}

.summary-chip.layout-noise.active {
  color: #92400e;
  border-color: rgba(217, 119, 6, 0.34);
  background: rgba(245, 158, 11, 0.16);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.12);
}

.slash {
  color: var(--text-tertiary);
  font-weight: 400;
  margin: 0 1px;
}

.diff-progress {
  width: 118px;
  min-width: 0;
  padding: 0 2px;
  display: grid;
  gap: 4px;
  align-self: center;
}

.diff-progress-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
}

.diff-progress-index {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.diff-progress-label {
  flex: 0 0 auto;
  font-weight: 650;
}

.diff-progress-count {
  min-width: 0;
  color: var(--text-primary);
  font-family: 'SF Mono', 'Monaco', monospace;
  letter-spacing: -0.01em;
}

.diff-progress-meta strong {
  color: var(--accent);
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 0.66rem;
  opacity: 0.9;
}

.diff-progress-track {
  height: 3px;
  width: 100%;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(203, 213, 225, 0.64);
}

.diff-progress-bar {
  height: 100%;
  min-width: 6px;
  border-radius: inherit;
  background: var(--gradient-accent);
  position: relative;
  overflow: hidden;
  transition: width 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.diff-progress-bar::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.42) 48%, transparent 100%);
  transform: translateX(-120%);
  animation: progress-sheen 1.8s ease-in-out infinite;
}

.nav-triggers {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  min-width: 0;
  border-radius: 7px;
}

.btn-action-nav {
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
  white-space: nowrap;
  min-width: 0;
}

.btn-action-nav svg {
  flex: 0 0 auto;
}

.btn-action-nav:hover:not(:disabled) {
  background: linear-gradient(180deg, #ffffff 0%, #eef2ff 100%);
  color: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 2px 8px var(--accent-glow);
  transform: translateY(-1px);
}

.btn-action-nav:active:not(:disabled) {
  transform: translateY(0);
}

.btn-action-nav:focus-visible,
.ios-toggle-shell:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.btn-action-nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ios-toggle-shell {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  padding: 4px 7px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
  min-width: 0;
}

.ios-toggle-shell:hover {
  background: rgba(255, 255, 255, 0.72);
  transform: translateY(-1px);
}

.ios-toggle-shell:active {
  transform: translateY(0);
}

.ios-toggle-shell span,
.btn-action-nav span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ios-switch {
  width: 26px;
  height: 15px;
  flex: 0 0 26px;
  background: linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%);
  border-radius: 99px;
  position: relative;
  transition: all 0.25s ease;
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
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.ios-toggle-shell.active {
  color: var(--accent);
}

.ios-toggle-shell.active .ios-switch {
  background: var(--gradient-accent);
  box-shadow: 0 0 8px var(--accent-glow);
}

.ios-toggle-shell.active .ios-switch::after {
  left: 13px;
}

.panel-divider {
  height: 14px;
  width: 1px;
  background: linear-gradient(180deg, transparent, var(--border-strong), transparent);
  margin: 0 6px;
}

@keyframes micro-flash {
  0% { box-shadow: 0 0 0 0 rgba(var(--del-rgb), 0.36); }
  70% { box-shadow: 0 0 0 6px rgba(var(--del-rgb), 0); }
  100% { box-shadow: 0 0 0 0 rgba(var(--del-rgb), 0); }
}

@keyframes navigator-rise {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes progress-sheen {
  0%, 35% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(120%);
  }
}

@media (max-width: 820px) {
  .floating-navigator {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    gap: 6px;
    padding: 6px 10px;
  }

  .navigator-controls {
    justify-self: stretch;
    justify-content: space-between;
  }

  .nav-triggers {
    flex-wrap: nowrap;
  }

  .panel-divider {
    display: none;
  }
}

@media (max-width: 640px) {
  .summary-chip {
    min-height: 20px;
    padding: 2px 6px;
    font-size: 0.62rem;
  }

  .radar-dot {
    flex: 0 0 6px;
    width: 6px;
    height: 6px;
  }

  .diff-progress {
    padding: 0 1px;
    width: 108px;
  }

  .diff-progress-meta {
    gap: 4px;
    font-size: 0.66rem;
  }

  .diff-progress-index {
    letter-spacing: -0.02em;
  }

  .diff-progress-meta strong {
    font-size: 0.62rem;
  }

  .diff-progress-track {
    width: 100%;
  }

  .navigator-controls {
    gap: 8px;
  }

  .nav-triggers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: center;
    flex: 1 1 auto;
  }

  .btn-action-nav {
    justify-content: center;
  }

  .ios-toggle-shell {
    justify-content: center;
    padding: 4px 6px;
  }
}

@media (max-width: 520px) {
  .summary-chip.status {
    display: none;
  }

  .navigator-controls {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }
}

@media (max-width: 420px) {
  .summary-chip.modified,
  .summary-chip.inserted,
  .summary-chip.deleted,
  .summary-chip.similarity {
    display: none;
  }

  .btn-action-nav {
    padding: 5px 4px;
    gap: 3px;
    font-size: 0.64rem;
  }

  .ios-toggle-shell {
    padding: 4px 3px;
    gap: 4px;
    font-size: 0.64rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .floating-navigator,
  .radar-dot,
  .diff-progress-bar::after {
    animation: none;
  }

  .summary-chip,
  .diff-progress-bar,
  .btn-action-nav,
  .ios-toggle-shell,
  .ios-switch,
  .ios-switch::after {
    transition: none;
  }

  .summary-chip:hover,
  .btn-action-nav:hover:not(:disabled),
  .btn-action-nav:active:not(:disabled),
  .ios-toggle-shell:hover,
  .ios-toggle-shell:active {
    transform: none;
  }
}
</style>
