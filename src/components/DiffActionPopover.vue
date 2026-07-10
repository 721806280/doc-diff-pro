<template>
  <Teleport to="body">
    <transition name="diff-action-popover">
      <div
          v-if="open"
          class="diff-action-popover"
          :class="{ ignored }"
          :style="{ top: `${top}px`, left: `${left}px` }"
      >
        <span class="diff-action-popover__rail" aria-hidden="true"></span>
        <span class="diff-action-popover__label">
          <span class="diff-action-popover__label-dot" aria-hidden="true"></span>
          {{ label }}
        </span>
        <button
            type="button"
            class="diff-action-popover__button diff-action-popover__button--main"
            :title="i18n.diffNavigator.shortcutTitle(ignored ? i18n.diffNavigator.unignoreHereTitle : i18n.diffNavigator.ignoreHereTitle, 'I')"
            :aria-label="i18n.diffNavigator.shortcutTitle(ignored ? i18n.diffNavigator.unignoreHereTitle : i18n.diffNavigator.ignoreHereTitle, 'I')"
            aria-keyshortcuts="I"
            @click="handleAction"
        >
          <span class="diff-action-popover__icon" aria-hidden="true">
            <svg v-if="ignored" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 12a8 8 0 0 1 13.7-5.7"></path>
              <path d="M20 4v5h-5"></path>
              <path d="M20 12a8 8 0 0 1-13.7 5.7"></path>
              <path d="M4 20v-5h5"></path>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14"></path>
              <path d="M7 5l10 14"></path>
            </svg>
          </span>
          <span class="diff-action-popover__button-text">{{ ignored ? i18n.diffNavigator.unignoreHere : i18n.diffNavigator.ignoreHere }}</span>
        </button>
        <button
            v-if="!ignored && similarCount > 0"
            type="button"
            class="diff-action-popover__button diff-action-popover__button--similar"
            :title="i18n.diffNavigator.similarDiffsTitle(similarCount)"
            :aria-label="i18n.diffNavigator.similarDiffsTitle(similarCount)"
            @click="$emit('showSimilar')"
        >
          <span class="diff-action-popover__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 8h8"></path>
              <path d="M8 16h8"></path>
              <path d="M5 5l14 14"></path>
            </svg>
          </span>
          <span class="diff-action-popover__button-text">{{ i18n.diffNavigator.similarDiffsLabel }}</span>
          <span class="diff-action-popover__count">{{ similarCount }}</span>
        </button>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useI18n } from '@/i18n';

const props = defineProps<{
  open: boolean;
  top: number;
  left: number;
  label: string;
  ignored: boolean;
  similarCount: number;
}>();

const emit = defineEmits<{
  ignore: [];
  restore: [];
  showSimilar: [];
}>();

const { messages: i18n } = useI18n();

function handleAction(): void {
  if (props.ignored) {
    emit('restore');
    return;
  }

  emit('ignore');
}
</script>

<style scoped>
.diff-action-popover {
  position: fixed;
  z-index: var(--z-diff-action-popover);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 34px;
  max-width: min(328px, calc(100vw - 18px));
  padding: 4px 5px;
  border: 1px solid var(--popup-border);
  border-radius: 8px;
  background: linear-gradient(180deg, var(--popup-surface), var(--popup-surface-soft)), var(--bg-panel-solid);
  color: var(--text-primary);
  box-shadow: var(--shadow-floating);
  transform: translate(-50%, calc(-100% - 9px));
}

.diff-action-popover::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -5px;
  width: 8px;
  height: 8px;
  border-right: 1px solid var(--popup-border);
  border-bottom: 1px solid var(--popup-border);
  background: linear-gradient(135deg, var(--popup-surface-soft), var(--popup-surface-soft)), var(--bg-panel-solid);
  transform: translateX(-50%) rotate(45deg);
}

.diff-action-popover.ignored {
  border-color: var(--accent-border-strong);
  background: linear-gradient(180deg, var(--popup-surface), var(--accent-soft)), var(--bg-panel-solid);
}

.diff-action-popover.ignored::after {
  border-color: var(--accent-border-strong);
  background: linear-gradient(135deg, var(--popup-surface-soft), var(--accent-soft)), var(--bg-panel-solid);
}

.diff-action-popover__rail {
  align-self: stretch;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--warning), var(--warning-strong));
}

.diff-action-popover.ignored .diff-action-popover__rail {
  background: var(--gradient-accent);
}

.diff-action-popover__label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  height: 24px;
  padding: 0 7px;
  border-radius: 6px;
  background: var(--muted-chip-bg);
  color: var(--muted-chip-text);
  font-size: 0.68rem;
  font-weight: 760;
  line-height: 1;
  white-space: nowrap;
}

.diff-action-popover__label-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.5;
}

.diff-action-popover__button {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.68rem;
  font-weight: 750;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.diff-action-popover__button--main {
  border-color: var(--warning-border);
  background: var(--warning-soft);
  color: var(--warning-strong);
}

.diff-action-popover__button--similar {
  gap: 4px;
  padding-right: 5px;
  border-color: var(--accent-border);
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.diff-action-popover.ignored .diff-action-popover__button--main {
  border-color: var(--accent-border);
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.diff-action-popover__button:hover {
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.02);
}

.diff-action-popover__button--main:hover {
  border-color: var(--warning-border-strong);
  background: var(--warning-soft-strong);
}

.diff-action-popover__button--similar:hover,
.diff-action-popover.ignored .diff-action-popover__button--main:hover {
  border-color: var(--accent-border-strong);
  background: var(--accent-soft-strong);
}

.diff-action-popover__button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--warning-glow);
}

.diff-action-popover__button--similar:focus-visible,
.diff-action-popover.ignored .diff-action-popover__button--main:focus-visible {
  box-shadow: var(--popup-focus-ring);
}

.diff-action-popover__button-text {
  min-width: 0;
}

.diff-action-popover__count {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-soft-strong);
  color: var(--accent-strong);
  font-size: 0.61rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.diff-action-popover__button--similar:hover .diff-action-popover__count {
  background: rgba(var(--accent-rgb), 0.2);
}

.diff-action-popover__icon {
  width: 12px;
  height: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.diff-action-popover__icon svg {
  width: 12px;
  height: 12px;
}

.diff-action-popover-enter-active,
.diff-action-popover-leave-active {
  transition: opacity var(--popup-motion), transform var(--popup-motion);
}

.diff-action-popover-enter-from,
.diff-action-popover-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-100% - 5px));
}

@media (max-width: 520px) {
  .diff-action-popover {
    gap: 5px;
    min-height: 32px;
    max-width: calc(100vw - 18px);
    padding: 4px;
  }

  .diff-action-popover__label {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .diff-action-popover-enter-active,
  .diff-action-popover-leave-active {
    transition: none !important;
  }
}
</style>
