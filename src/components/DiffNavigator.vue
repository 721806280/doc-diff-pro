<template>
  <div class="floating-navigator">
    <div class="stat-banner">
      <div class="radar-dot" :class="{ clean: summary.total === 0 }"></div>
      <template v-if="summary.total === 0">
        <span class="pure-text">{{ i18n.diffNavigator.noDiffs }}</span>
        <span class="summary-chip similarity" :title="i18n.diffNavigator.similarityTitle">
          {{ i18n.diffNavigator.similarity }} <strong>{{ similarityPercent }}</strong>
        </span>
        <div v-if="summary.layoutNoiseFiltered > 0" class="layout-noise-chip">
          <button type="button" class="summary-chip layout-noise" :title="i18n.diffNavigator.layoutNoiseTitle">
            {{ i18n.diffNavigator.layoutNoiseFiltered(summary.layoutNoiseFiltered) }}
          </button>
          <div v-if="summary.layoutNoiseItems.length > 0" class="layout-noise-popover" role="tooltip">
            <div class="layout-noise-popover__head">
              <strong>{{ i18n.diffNavigator.layoutNoiseDetailsTitle }}</strong>
              <span>{{ i18n.diffNavigator.layoutNoiseDetailsCount(summary.layoutNoiseFiltered) }}</span>
            </div>
            <ul class="layout-noise-list">
              <li v-for="(item, index) in summary.layoutNoiseItems" :key="`${item.side}-${item.reason}-${index}`">
                <div class="layout-noise-meta">
                  <span class="layout-noise-side">{{ i18n.diffNavigator.layoutNoiseSide[item.side] }}</span>
                  <span class="layout-noise-reason">{{ i18n.diffNavigator.layoutNoiseReason[item.reason] }}</span>
                  <span v-if="item.count > 1" class="layout-noise-count">x{{ item.count }}</span>
                </div>
                <p class="layout-noise-text">{{ item.text }}</p>
              </li>
            </ul>
          </div>
        </div>
      </template>
      <template v-else>
        <span class="pure-text">{{ i18n.diffNavigator.withDiffsBefore }} <strong class="diff-count">{{ summary.total }}</strong> {{ i18n.diffNavigator.withDiffsAfter(summary.total) }}</span>
        <span class="summary-chip similarity" :title="i18n.diffNavigator.similarityTitle">
          {{ i18n.diffNavigator.similarity }} <strong>{{ similarityPercent }}</strong>
        </span>
        <span class="summary-chip modified">{{ i18n.diffNavigator.modified }} {{ summary.modified }}</span>
        <span class="summary-chip inserted">{{ i18n.diffNavigator.inserted }} {{ summary.inserted }}</span>
        <span class="summary-chip deleted">{{ i18n.diffNavigator.deleted }} {{ summary.deleted }}</span>
        <div v-if="summary.layoutNoiseFiltered > 0" class="layout-noise-chip">
          <button type="button" class="summary-chip layout-noise" :title="i18n.diffNavigator.layoutNoiseTitle">
            {{ i18n.diffNavigator.layoutNoiseFiltered(summary.layoutNoiseFiltered) }}
          </button>
          <div v-if="summary.layoutNoiseItems.length > 0" class="layout-noise-popover" role="tooltip">
            <div class="layout-noise-popover__head">
              <strong>{{ i18n.diffNavigator.layoutNoiseDetailsTitle }}</strong>
              <span>{{ i18n.diffNavigator.layoutNoiseDetailsCount(summary.layoutNoiseFiltered) }}</span>
            </div>
            <ul class="layout-noise-list">
              <li v-for="(item, index) in summary.layoutNoiseItems" :key="`${item.side}-${item.reason}-${index}`">
                <div class="layout-noise-meta">
                  <span class="layout-noise-side">{{ i18n.diffNavigator.layoutNoiseSide[item.side] }}</span>
                  <span class="layout-noise-reason">{{ i18n.diffNavigator.layoutNoiseReason[item.reason] }}</span>
                  <span v-if="item.count > 1" class="layout-noise-count">x{{ item.count }}</span>
                </div>
                <p class="layout-noise-text">{{ item.text }}</p>
              </li>
            </ul>
          </div>
        </div>
        <div
          class="diff-progress"
          role="progressbar"
          :aria-label="i18n.diffNavigator.currentPositionAria(currentDiffIndex, summary.total)"
          :aria-valuemin="1"
          :aria-valuemax="summary.total"
          :aria-valuenow="currentDiffIndex"
        >
          <div class="diff-progress-meta">
            <span>{{ i18n.diffNavigator.difference }} {{ currentDiffIndex }} <span class="slash">/</span> {{ summary.total }}</span>
            <strong>{{ progressPercent }}%</strong>
          </div>
          <div class="diff-progress-track">
            <div class="diff-progress-bar" :style="{ width: progressWidth }"></div>
          </div>
        </div>
      </template>
    </div>

    <div class="nav-triggers" v-if="summary.total > 0">
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
</template>

<script setup lang="ts">
import { computed } from 'vue';
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
</script>

<style scoped>
.floating-navigator {
  background: var(--bg-panel);
  border-radius: 8px;
  padding: 7px 10px;
  border: 1px solid var(--border-subtle);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  justify-content: space-between;
  align-items: center;
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

.stat-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
}

.radar-dot {
  width: 7px;
  height: 7px;
  background: var(--del-focus);
  border-radius: 50%;
  animation: micro-flash 2s infinite;
  box-shadow: 0 0 8px rgba(244, 63, 94, 0.4);
}

.radar-dot.clean {
  background: var(--ins-focus);
  animation: none;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
}

.pure-text {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-secondary);
  line-height: 1.4;
  min-width: 0;
}

.pure-text strong {
  color: var(--text-primary);
}

.diff-count {
  color: var(--del-focus);
  font-weight: 700;
  font-family: 'SF Mono', 'Monaco', monospace;
  background: var(--gradient-del);
  padding: 2px 7px;
  border-radius: 5px;
  border: 1px solid var(--del-border);
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: 650;
  white-space: nowrap;
  border: 1px solid var(--border-subtle);
  background: rgba(248, 250, 252, 0.9);
  line-height: 1;
  min-height: 20px;
  box-sizing: border-box;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

button.summary-chip {
  appearance: none;
  font: inherit;
  margin: 0;
  cursor: pointer;
}

.summary-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.05);
}

.summary-chip.modified {
  color: var(--accent);
  border-color: rgba(37, 99, 235, 0.2);
  background: rgba(37, 99, 235, 0.08);
}

.summary-chip.similarity {
  color: #0f766e;
  border-color: rgba(20, 184, 166, 0.24);
  background: rgba(20, 184, 166, 0.09);
}

.summary-chip.similarity strong {
  font-family: 'SF Mono', 'Monaco', monospace;
  font-weight: 750;
}

.summary-chip.inserted {
  color: var(--ins-text);
  border-color: var(--ins-border);
  background: rgba(16, 185, 129, 0.08);
}

.summary-chip.deleted {
  color: var(--del-text);
  border-color: var(--del-border);
  background: rgba(244, 63, 94, 0.08);
}

.summary-chip.layout-noise {
  color: #6d4c1d;
  border-color: rgba(180, 83, 9, 0.22);
  background: rgba(245, 158, 11, 0.1);
}

.layout-noise-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  outline: none;
}

.layout-noise-chip:focus-within .summary-chip.layout-noise {
  border-color: rgba(180, 83, 9, 0.42);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.24);
}

.layout-noise-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  width: 360px;
  max-width: min(360px, calc(100vw - 32px));
  max-height: 220px;
  overflow-y: auto;
  padding: 9px 10px 8px;
  border: 1px solid rgba(180, 83, 9, 0.22);
  border-radius: 8px;
  background: #ffffff;
  box-shadow:
    0 4px 12px rgba(15, 23, 42, 0.08),
    0 8px 24px rgba(15, 23, 42, 0.1);
  text-align: left;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
  pointer-events: none;
}

.layout-noise-chip:hover .layout-noise-popover,
.layout-noise-chip:focus-within .layout-noise-popover {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  pointer-events: auto;
}

.layout-noise-popover__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 0.72rem;
  padding-bottom: 7px;
  margin-bottom: 2px;
  border-bottom: 1px solid rgba(180, 83, 9, 0.12);
}

.layout-noise-popover__head strong {
  color: #92400e;
  font-size: 0.74rem;
}

.layout-noise-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.layout-noise-list li {
  padding: 7px 0;
  border-bottom: 1px solid rgba(226, 232, 240, 0.8);
}

.layout-noise-list li:last-child {
  border-bottom: 0;
  padding-bottom: 1px;
}

.layout-noise-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 4px;
}

.layout-noise-side,
.layout-noise-reason {
  display: inline-flex;
  align-items: center;
  min-height: 17px;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.64rem;
  font-weight: 700;
  line-height: 1;
}

.layout-noise-side {
  color: var(--text-secondary);
  background: #f1f5f9;
  border: 1px solid rgba(203, 213, 225, 0.7);
}

.layout-noise-reason {
  color: #92400e;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.18);
}

.layout-noise-count {
  display: inline-flex;
  align-items: center;
  min-height: 17px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(180, 83, 9, 0.1);
  color: #78350f;
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1;
}

.layout-noise-text {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.72rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.slash {
  color: var(--text-tertiary);
  font-weight: 400;
  margin: 0 2px;
}

.diff-progress {
  width: auto;
  min-width: 112px;
  padding: 5px 10px;
  border-radius: 6px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  display: flex;
  flex-direction: column;
  gap: 0;
}

.diff-progress-meta {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 650;
  white-space: nowrap;
}

.diff-progress-meta strong {
  color: var(--accent);
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 0.68rem;
}

.diff-progress-track {
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(203, 213, 225, 0.58);
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
  background: linear-gradient(180deg, #ffffff 0%, #eff6ff 100%);
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
  0% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(244, 63, 94, 0); }
  100% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0); }
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

  .stat-banner {
    justify-content: flex-start;
    text-align: left;
  }

  .nav-triggers {
    justify-content: flex-start;
    flex-wrap: nowrap;
  }

  .panel-divider {
    display: none;
  }
}

@media (max-width: 640px) {
  .pure-text {
    flex: 1 1 100%;
  }

  .diff-progress {
    flex: 1 1 128px;
    width: auto;
    min-width: 118px;
  }

  .diff-progress-meta {
    justify-content: flex-start;
    gap: 8px;
  }

  .nav-triggers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: center;
  }

  .btn-action-nav {
    justify-content: center;
  }

  .ios-toggle-shell {
    justify-content: center;
    padding: 4px 6px;
  }

  .layout-noise-popover {
    right: auto;
    left: 0;
  }
}

@media (max-width: 420px) {
  .summary-chip {
    flex: 0 0 auto;
    text-align: center;
    padding: 3px 4px;
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
