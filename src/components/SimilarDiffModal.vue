<template>
  <Teleport to="body">
    <transition name="similar-diff-overlay">
      <div
          v-if="open && current && items.length > 0"
          class="similar-diff-overlay"
          @click.self="emit('close')"
      >
        <section
            ref="panelRef"
            class="similar-diff-panel"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="titleId"
        >
          <div class="similar-diff-panel__head">
            <div class="similar-diff-panel__title">
              <strong :id="titleId">{{ i18n.diffNavigator.batchProcessTitle }}</strong>
              <span>{{ i18n.diffNavigator.similarDiffs(items.length) }}</span>
            </div>
            <button
                type="button"
                class="similar-diff-close"
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

          <div class="similar-diff-current">
            <label class="similar-diff-check">
              <input
                  type="checkbox"
                  :aria-label="i18n.diffNavigator.selectCurrentDiff"
                  :checked="selectedIds.has(current.id)"
                  @change="toggleSelected(current.id)"
              >
              <span></span>
            </label>
            <div class="similar-diff-body">
              <div class="similar-diff-meta">
                <span class="similar-diff-current-label">{{ i18n.diffNavigator.similarCurrentLabel }}</span>
                <span class="similar-diff-index">#{{ current.index }}</span>
              </div>
              <div class="similar-diff-preview">
                <p>
                  <span>{{ i18n.diffNavigator.tableHintSides.original }}</span>
                  <strong>{{ current.originalPreview || i18n.diffNavigator.emptyDiffPreview }}</strong>
                </p>
                <p>
                  <span>{{ i18n.diffNavigator.tableHintSides.revised }}</span>
                  <strong>{{ current.revisedPreview || i18n.diffNavigator.emptyDiffPreview }}</strong>
                </p>
              </div>
            </div>
          </div>

          <ul class="similar-diff-list">
            <li v-for="item in items" :key="item.id">
              <label class="similar-diff-check">
                <input
                    type="checkbox"
                    :aria-label="i18n.diffNavigator.selectSimilarDiff(item.index)"
                    :checked="selectedIds.has(item.id)"
                    @change="toggleSelected(item.id)"
                >
                <span></span>
              </label>
              <div class="similar-diff-body">
                <div class="similar-diff-meta">
                  <span class="similar-diff-index">#{{ item.index }}</span>
                  <span class="similar-diff-kind" :class="`kind-${item.kind}`">
                    {{ i18n.diffNavigator.ignoredDiffKind[item.kind] }}
                  </span>
                  <span class="similar-diff-score">{{ i18n.diffNavigator.similarScore(percentFormatter.format(item.similarity)) }}</span>
                </div>
                <div class="similar-diff-preview">
                  <p>
                    <span>{{ i18n.diffNavigator.tableHintSides.original }}</span>
                    <strong>{{ item.originalPreview || i18n.diffNavigator.emptyDiffPreview }}</strong>
                  </p>
                  <p>
                    <span>{{ i18n.diffNavigator.tableHintSides.revised }}</span>
                    <strong>{{ item.revisedPreview || i18n.diffNavigator.emptyDiffPreview }}</strong>
                  </p>
                </div>
              </div>
              <button type="button" class="similar-diff-locate" @click="emit('locate', item.id)">
                {{ i18n.diffNavigator.viewSimilarDiff }}
              </button>
            </li>
          </ul>

          <div class="similar-diff-footer">
            <span class="similar-diff-selected">{{ i18n.diffNavigator.selectedSimilar(selectedIds.size, totalSelectable) }}</span>
            <button type="button" class="secondary" @click="toggleAll">
              {{ allSelected ? i18n.diffNavigator.clearSimilarSelection : i18n.diffNavigator.selectAllSimilar }}
            </button>
            <button
                type="button"
                class="primary"
                :disabled="selectedIds.size === 0"
                @click="emit('ignoreSelected', Array.from(selectedIds))"
            >
              {{ i18n.diffNavigator.ignoreSelectedSimilar(selectedIds.size) }}
            </button>
          </div>
        </section>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from '@/i18n';
import type { IgnoredDiffItem, SimilarDiffItem } from '@/types/diff';
import { createBodyScrollLock } from '@/utils/bodyScrollLock';
import { createFocusTrap } from '@/utils/focusTrap';

const props = defineProps<{
  open: boolean;
  current: IgnoredDiffItem | null;
  items: SimilarDiffItem[];
}>();

const emit = defineEmits<{
  close: [];
  locate: [id: string];
  ignoreSelected: [ids: string[]];
}>();

const { locale, messages: i18n } = useI18n();
const titleId = 'similar-diff-dialog-title';
const selectedIds = ref<Set<string>>(new Set());
const bodyScrollLock = createBodyScrollLock();
const focusTrap = createFocusTrap();
const panelRef = ref<HTMLElement | null>(null);
const percentFormatter = computed(() => new Intl.NumberFormat(locale.value, {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
}));
const totalSelectable = computed(() => props.items.length + (props.current ? 1 : 0));
const allSelected = computed(() => selectedIds.value.size === totalSelectable.value);

watch(
  () => [props.open, props.items.map((item) => item.id).join('\u0000')] as const,
  ([open]) => {
    selectedIds.value = open && props.current
      ? new Set([props.current.id, ...props.items.map((item) => item.id)])
      : new Set();
  },
  { immediate: true }
);

watch(() => props.open, async (open) => {
  if (open) {
    bodyScrollLock.lock();
    await nextTick();
    if (props.open) focusTrap.activate(panelRef.value);
  } else {
    focusTrap.deactivate();
    bodyScrollLock.release();
  }
});

function toggleSelected(id: string): void {
  const nextSelectedIds = new Set(selectedIds.value);
  if (nextSelectedIds.has(id)) {
    nextSelectedIds.delete(id);
  } else {
    nextSelectedIds.add(id);
  }
  selectedIds.value = nextSelectedIds;
}

function selectAll(): void {
  selectedIds.value = new Set([
    ...(props.current ? [props.current.id] : []),
    ...props.items.map((item) => item.id)
  ]);
}

function toggleAll(): void {
  if (allSelected.value) {
    clearSelected();
    return;
  }
  selectAll();
}

function clearSelected(): void {
  selectedIds.value = new Set();
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (!props.open) return;

  if (event.key === 'Escape') {
    emit('close');
    return;
  }

  focusTrap.handleKeydown(event);
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeydown);
  focusTrap.deactivate({ restoreFocus: false });
  bodyScrollLock.release();
});
</script>

<style scoped>
.similar-diff-overlay {
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

.similar-diff-panel {
  --similar-ink: var(--text-primary);
  --similar-muted: var(--text-tertiary);
  --similar-line: var(--popup-border);

  width: min(820px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  overflow: hidden;
  border: 1px solid var(--popup-border);
  border-radius: var(--popup-radius);
  background: var(--popup-surface);
  box-shadow: var(--popup-shadow);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.similar-diff-panel__head {
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--similar-line);
  background: var(--popup-surface-soft);
}

.similar-diff-panel__title {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.similar-diff-panel__title strong {
  color: var(--similar-ink);
  font-size: 0.9rem;
  font-weight: 650;
}

.similar-diff-panel__title span,
.similar-diff-current strong {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 0.68rem;
  font-weight: 750;
}

.similar-diff-close {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--control-border);
  border-radius: var(--popup-control-radius);
  background: var(--control-surface);
  color: var(--similar-muted);
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.similar-diff-close:hover {
  border-color: var(--control-border-hover);
  background: var(--control-surface-hover);
  color: var(--similar-ink);
  box-shadow: var(--control-shadow-hover);
}

.similar-diff-current {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  min-width: 0;
  padding: 12px 14px;
  color: var(--similar-muted);
  font-size: 0.72rem;
  font-weight: 700;
  border-bottom: 1px solid var(--popup-border);
  background: var(--surface-chip);
}

.similar-diff-current-label {
  min-height: 20px;
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 0.65rem;
  font-weight: 750;
}

.similar-diff-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 12px;
  overflow-y: auto;
  list-style: none;
  background: var(--surface-chip);
}

.similar-diff-list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--control-border);
  border-radius: var(--popup-control-radius);
  background: var(--surface-card-solid);
}

.similar-diff-check {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.similar-diff-check input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.similar-diff-check span {
  width: 16px;
  height: 16px;
  border: 1px solid var(--control-border-hover);
  border-radius: 4px;
  background: var(--surface-card-solid);
}

.similar-diff-check input:checked + span {
  border-color: var(--accent-border-strong);
  background: var(--accent);
  box-shadow: inset 0 0 0 3px #ffffff;
}

.similar-diff-body {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.similar-diff-meta {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.similar-diff-index,
.similar-diff-kind,
.similar-diff-score {
  min-height: 20px;
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border: 1px solid var(--control-border);
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 750;
}

.similar-diff-index,
.similar-diff-score {
  color: var(--text-secondary);
  background: var(--muted-chip-bg);
  font-family: 'SF Mono', 'Monaco', monospace;
}

.similar-diff-kind.kind-modified { color: var(--modified-text); background: rgba(var(--modified-rgb), 0.08); border-color: rgba(var(--modified-rgb), 0.18); }
.similar-diff-kind.kind-inserted { color: var(--ins-text); background: rgba(var(--ins-rgb), 0.08); border-color: rgba(var(--ins-rgb), 0.16); }
.similar-diff-kind.kind-deleted { color: var(--del-text); background: rgba(var(--del-rgb), 0.08); border-color: rgba(var(--del-rgb), 0.16); }

.similar-diff-preview {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.similar-diff-preview p {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 8px;
  margin: 0;
  min-width: 0;
}

.similar-diff-preview span {
  color: var(--similar-muted);
  font-size: 0.67rem;
  font-weight: 700;
}

.similar-diff-preview strong {
  min-width: 0;
  color: var(--document-text);
  font-size: 0.76rem;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.similar-diff-locate,
.similar-diff-footer button {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  background: var(--control-surface);
  color: var(--similar-muted);
  font-size: 0.68rem;
  font-weight: 750;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.similar-diff-locate:hover,
.similar-diff-footer button:hover:not(:disabled) {
  border-color: var(--accent-border);
  background: var(--control-surface-hover);
  color: var(--accent-strong);
  box-shadow: var(--control-shadow-hover);
}

.similar-diff-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--similar-line);
  background: var(--popup-surface-soft);
}

.similar-diff-selected {
  margin-right: auto;
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 700;
}

.similar-diff-footer .primary {
  border-color: var(--warning-border);
  background: var(--warning-soft);
  color: var(--warning-strong);
}

.similar-diff-footer .primary:hover:not(:disabled) {
  border-color: var(--warning-border-strong);
  background: var(--warning-soft-strong);
  color: var(--warning-ink);
}

.similar-diff-footer .primary:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.similar-diff-close:focus-visible,
.similar-diff-check input:focus-visible + span,
.similar-diff-locate:focus-visible,
.similar-diff-footer button:focus-visible {
  outline: none;
  box-shadow: var(--popup-focus-ring);
}

.similar-diff-overlay-enter-active,
.similar-diff-overlay-leave-active {
  transition: opacity var(--popup-motion);
}

.similar-diff-overlay-enter-from,
.similar-diff-overlay-leave-to {
  opacity: 0;
}

.similar-diff-overlay-enter-active .similar-diff-panel,
.similar-diff-overlay-leave-active .similar-diff-panel {
  transition: transform var(--popup-motion), opacity var(--popup-motion);
}

.similar-diff-overlay-enter-from .similar-diff-panel,
.similar-diff-overlay-leave-to .similar-diff-panel {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

@media (max-width: 720px) {
  .similar-diff-overlay {
    align-items: flex-start;
    padding: calc(env(safe-area-inset-top, 0px) + 8px) 8px calc(env(safe-area-inset-bottom, 0px) + 8px);
  }

  .similar-diff-panel {
    width: calc(100vw - 16px);
    max-height: calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  }

  .similar-diff-list li {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .similar-diff-locate {
    grid-column: 2;
    justify-self: start;
  }
}

@media (max-width: 440px) {
  .similar-diff-footer {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .similar-diff-footer .primary {
    grid-column: 1 / -1;
  }

  .similar-diff-preview p {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .similar-diff-overlay-enter-active,
  .similar-diff-overlay-leave-active,
  .similar-diff-overlay-enter-active .similar-diff-panel,
  .similar-diff-overlay-leave-active .similar-diff-panel {
    transition: none !important;
  }
}
</style>
