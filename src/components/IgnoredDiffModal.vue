<template>
  <Teleport to="body">
    <transition name="ignored-diff-overlay">
      <div
          v-if="open && items.length > 0"
          class="ignored-diff-overlay"
          @click.self="emit('close')"
      >
        <section
            class="ignored-diff-panel"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="titleId"
        >
          <div class="ignored-diff-panel__head">
            <div class="ignored-diff-panel__title">
              <strong :id="titleId">{{ i18n.diffNavigator.ignoredDetailsTitle }}</strong>
              <span>{{ i18n.diffNavigator.ignoredDiffs(items.length) }}</span>
            </div>
            <div class="ignored-diff-panel__actions">
              <button
                  type="button"
                  class="ignored-diff-restore-all"
                  @click="emit('restoreAll')"
              >
                {{ i18n.diffNavigator.restoreIgnored }}
              </button>
              <button
                  type="button"
                  class="ignored-diff-close"
                  :aria-label="i18n.diffNavigator.closeDetails"
                  :title="i18n.diffNavigator.closeDetails"
                  @click="emit('close')"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          <ul class="ignored-diff-list">
            <li v-for="item in items" :key="item.id">
              <div class="ignored-diff-meta">
                <span class="ignored-diff-index">#{{ item.index }}</span>
                <span class="ignored-diff-kind" :class="`kind-${item.kind}`">
                  {{ i18n.diffNavigator.ignoredDiffKind[item.kind] }}
                </span>
              </div>
              <div class="ignored-diff-preview">
                <p>
                  <span>{{ i18n.diffNavigator.tableHintSides.original }}</span>
                  <strong>{{ item.originalPreview || i18n.diffNavigator.emptyDiffPreview }}</strong>
                </p>
                <p>
                  <span>{{ i18n.diffNavigator.tableHintSides.revised }}</span>
                  <strong>{{ item.revisedPreview || i18n.diffNavigator.emptyDiffPreview }}</strong>
                </p>
              </div>
              <div class="ignored-diff-row-actions">
                <button type="button" @click="emit('locate', item.id)">
                  {{ i18n.diffNavigator.locateIgnored }}
                </button>
                <button type="button" class="restore" @click="emit('restore', item.id)">
                  {{ i18n.diffNavigator.unignoreHere }}
                </button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from '@/i18n';
import type { IgnoredDiffItem } from '@/types/diff';
import { createBodyScrollLock } from '@/utils/bodyScrollLock';

const props = defineProps<{
  open: boolean;
  items: IgnoredDiffItem[];
}>();

const emit = defineEmits<{
  close: [];
  locate: [id: string];
  restore: [id: string];
  restoreAll: [];
}>();

const { messages: i18n } = useI18n();
const titleId = 'ignored-diff-dialog-title';
const bodyScrollLock = createBodyScrollLock();

watch(() => props.open, (open) => {
  if (open) {
    bodyScrollLock.lock();
  } else {
    bodyScrollLock.release();
  }
});

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.open) emit('close');
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeydown);
  bodyScrollLock.release();
});
</script>

<style scoped>
.ignored-diff-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100dvh;
  overflow-y: auto;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px);
  background: var(--popup-backdrop);
  backdrop-filter: blur(12px) saturate(120%);
  -webkit-backdrop-filter: blur(12px) saturate(120%);
}

.ignored-diff-panel {
  --ignored-ink: #1e293b;
  --ignored-text: #475569;
  --ignored-muted: #64748b;
  --ignored-line: rgba(203, 213, 225, 0.82);

  width: min(780px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid var(--popup-border);
  border-radius: var(--popup-radius);
  background: var(--popup-surface);
  box-shadow: var(--popup-shadow);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.ignored-diff-panel__head {
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--ignored-line);
  background: var(--popup-surface-soft);
}

.ignored-diff-panel__title {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.ignored-diff-panel__title strong {
  color: var(--ignored-ink);
  font-size: 0.9rem;
  font-weight: 650;
}

.ignored-diff-panel__title span {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.09);
  color: var(--ignored-muted);
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 0.68rem;
  font-weight: 750;
}

.ignored-diff-panel__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.ignored-diff-restore-all,
.ignored-diff-close {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: var(--popup-control-radius);
  background: rgba(255, 255, 255, 0.82);
  color: var(--ignored-muted);
  cursor: pointer;
}

.ignored-diff-restore-all {
  min-height: 28px;
  padding: 0 10px;
  font-size: 0.7rem;
  font-weight: 750;
}

.ignored-diff-close {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ignored-diff-restore-all:hover,
.ignored-diff-close:hover {
  border-color: rgba(15, 23, 42, 0.18);
  background: #ffffff;
  color: var(--ignored-ink);
}

.ignored-diff-restore-all:focus-visible,
.ignored-diff-close:focus-visible,
.ignored-diff-row-actions button:focus-visible {
  outline: none;
  box-shadow: var(--popup-focus-ring);
}

.ignored-diff-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 12px;
  list-style: none;
  background: rgba(248, 250, 252, 0.52);
}

.ignored-diff-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px 12px;
  padding: 12px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: var(--popup-control-radius);
  background: #ffffff;
}

.ignored-diff-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ignored-diff-index,
.ignored-diff-kind {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 2px 7px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 750;
}

.ignored-diff-index {
  color: #475569;
  background: rgba(241, 245, 249, 0.84);
  font-family: 'SF Mono', 'Monaco', monospace;
}

.ignored-diff-kind.kind-modified { color: #6d28d9; background: rgba(109, 40, 217, 0.07); border-color: rgba(109, 40, 217, 0.15); }
.ignored-diff-kind.kind-inserted { color: #15803d; background: rgba(22, 163, 74, 0.08); border-color: rgba(22, 163, 74, 0.14); }
.ignored-diff-kind.kind-deleted { color: #b91c1c; background: rgba(220, 38, 38, 0.08); border-color: rgba(220, 38, 38, 0.14); }

.ignored-diff-preview {
  grid-column: 1 / 2;
  display: grid;
  gap: 6px;
  min-width: 0;
}

.ignored-diff-preview p {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 8px;
  margin: 0;
  min-width: 0;
}

.ignored-diff-preview span {
  color: var(--ignored-muted);
  font-size: 0.67rem;
  font-weight: 700;
}

.ignored-diff-preview strong {
  min-width: 0;
  color: #334155;
  font-size: 0.76rem;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.ignored-diff-row-actions {
  grid-column: 2 / 3;
  grid-row: 1 / span 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: center;
}

.ignored-diff-row-actions button {
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 6px;
  background: rgba(248, 250, 252, 0.9);
  color: #475569;
  font-size: 0.68rem;
  font-weight: 750;
  white-space: nowrap;
  cursor: pointer;
}

.ignored-diff-row-actions button:hover {
  border-color: rgba(79, 70, 229, 0.22);
  background: #ffffff;
  color: #4338ca;
}

.ignored-diff-row-actions button.restore:hover {
  border-color: rgba(217, 119, 6, 0.24);
  color: #92400e;
}

.ignored-diff-overlay-enter-active,
.ignored-diff-overlay-leave-active {
  transition: opacity var(--popup-motion);
}

.ignored-diff-overlay-enter-from,
.ignored-diff-overlay-leave-to {
  opacity: 0;
}

.ignored-diff-overlay-enter-active .ignored-diff-panel,
.ignored-diff-overlay-leave-active .ignored-diff-panel {
  transition: transform var(--popup-motion), opacity var(--popup-motion);
}

.ignored-diff-overlay-enter-from .ignored-diff-panel,
.ignored-diff-overlay-leave-to .ignored-diff-panel {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

@media (max-width: 720px) {
  .ignored-diff-overlay {
    align-items: flex-start;
    padding: calc(env(safe-area-inset-top, 0px) + 8px) 8px calc(env(safe-area-inset-bottom, 0px) + 8px);
  }

  .ignored-diff-panel {
    width: calc(100vw - 16px);
    max-height: calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  }

  .ignored-diff-list li {
    grid-template-columns: minmax(0, 1fr);
  }

  .ignored-diff-preview,
  .ignored-diff-row-actions {
    grid-column: 1;
  }

  .ignored-diff-row-actions {
    grid-row: auto;
    justify-content: flex-end;
  }
}

@media (max-width: 440px) {
  .ignored-diff-panel__head {
    align-items: flex-start;
  }

  .ignored-diff-preview p {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ignored-diff-overlay-enter-active,
  .ignored-diff-overlay-leave-active,
  .ignored-diff-overlay-enter-active .ignored-diff-panel,
  .ignored-diff-overlay-leave-active .ignored-diff-panel {
    transition: none !important;
  }
}
</style>
