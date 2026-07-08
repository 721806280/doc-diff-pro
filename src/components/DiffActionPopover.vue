<template>
  <Teleport to="body">
    <transition name="diff-action-popover">
      <div
          v-if="open"
          class="diff-action-popover"
          :class="{ ignored }"
          :style="{ top: `${top}px`, left: `${left}px` }"
      >
        <span class="diff-action-popover__label">{{ label }}</span>
        <button
            type="button"
            :title="ignored ? i18n.diffNavigator.unignoreHereTitle : i18n.diffNavigator.ignoreHereTitle"
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
          <span>{{ ignored ? i18n.diffNavigator.unignoreHere : i18n.diffNavigator.ignoreHere }}</span>
        </button>
        <button
            v-if="!ignored && similarCount > 0"
            type="button"
            class="diff-action-popover__similar"
            :title="i18n.diffNavigator.similarDiffsTitle(similarCount)"
            @click="$emit('showSimilar')"
        >
          <span class="diff-action-popover__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 8h8"></path>
              <path d="M8 16h8"></path>
              <path d="M5 5l14 14"></path>
            </svg>
          </span>
          <span>{{ i18n.diffNavigator.similarDiffs(similarCount) }}</span>
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
  gap: 6px;
  min-height: 31px;
  max-width: calc(100vw - 18px);
  padding: 4px 5px 4px 9px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.97);
  color: #334155;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  transform: translate(-50%, calc(-100% - 10px));
}

.diff-action-popover::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -5px;
  width: 8px;
  height: 8px;
  border-right: 1px solid rgba(148, 163, 184, 0.22);
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.97);
  transform: translateX(-50%) rotate(45deg);
}

.diff-action-popover.ignored {
  border-color: rgba(100, 116, 139, 0.24);
  background: rgba(248, 250, 252, 0.98);
}

.diff-action-popover__label {
  min-width: 0;
  color: #64748b;
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 0.66rem;
  font-weight: 750;
  white-space: nowrap;
}

.diff-action-popover button {
  position: relative;
  z-index: 1;
  min-height: 23px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 7px;
  border: 1px solid rgba(217, 119, 6, 0.22);
  border-radius: 6px;
  background: rgba(255, 251, 235, 0.82);
  color: #92400e;
  font-family: inherit;
  font-size: 0.68rem;
  font-weight: 750;
  white-space: nowrap;
  cursor: pointer;
}

.diff-action-popover__similar {
  border-color: rgba(79, 70, 229, 0.18) !important;
  background: rgba(238, 242, 255, 0.82) !important;
  color: #4338ca !important;
}

.diff-action-popover.ignored button {
  border-color: rgba(79, 70, 229, 0.18);
  background: rgba(238, 242, 255, 0.84);
  color: #4338ca;
}

.diff-action-popover button:hover {
  border-color: rgba(217, 119, 6, 0.34);
  background: rgba(254, 243, 199, 0.98);
}

.diff-action-popover__similar:hover {
  border-color: rgba(79, 70, 229, 0.28) !important;
  background: rgba(224, 231, 255, 0.92) !important;
}

.diff-action-popover.ignored button:hover {
  border-color: rgba(79, 70, 229, 0.28);
  background: rgba(224, 231, 255, 0.92);
}

.diff-action-popover button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
}

.diff-action-popover.ignored button:focus-visible {
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.16);
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
  transform: translate(-50%, calc(-100% - 4px));
}

@media (max-width: 520px) {
  .diff-action-popover {
    gap: 5px;
    min-height: 30px;
    padding-left: 7px;
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
