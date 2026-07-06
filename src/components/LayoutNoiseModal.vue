<template>
  <Teleport to="body">
    <transition name="layout-noise-overlay">
      <div
          v-if="open && items.length > 0"
          class="layout-noise-overlay"
          @click.self="emit('close')"
      >
        <section
            class="layout-noise-panel"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="titleId"
        >
          <div class="layout-noise-panel__head">
            <div class="layout-noise-panel__title-group">
              <strong :id="titleId">{{ i18n.diffNavigator.layoutNoiseDetailsTitle }}</strong>
              <span class="layout-noise-total">
                {{ i18n.diffNavigator.layoutNoiseDetailsCount(total) }}
              </span>
            </div>
            <button
                type="button"
                class="layout-noise-panel__close"
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

          <ul class="layout-noise-list">
            <li
                v-for="(item, index) in items"
                :key="`${item.side}-${item.reason}-${index}`"
                :class="`is-${item.side}`"
            >
              <div class="layout-noise-meta">
                <span class="layout-noise-badge layout-noise-side" :class="`side-${item.side}`">
                  {{ i18n.diffNavigator.layoutNoiseSide[item.side] }}
                </span>
                <span class="layout-noise-badge layout-noise-reason" :class="`reason-${item.reason}`">
                  {{ i18n.diffNavigator.layoutNoiseReason[item.reason] }}
                </span>
                <span v-if="item.count > 1" class="layout-noise-badge layout-noise-count">x{{ item.count }}</span>
              </div>
              <p class="layout-noise-text">{{ item.text }}</p>
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
import type { LayoutNoiseItem } from '@/types/diff';

const props = defineProps<{
  open: boolean;
  total: number;
  items: LayoutNoiseItem[];
}>();

const emit = defineEmits<{
  close: [];
}>();

const { messages: i18n } = useI18n();
const titleId = 'layout-noise-dialog-title';

watch(() => props.open, (open) => {
  document.body.style.overflow = open ? 'hidden' : '';
});

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.open) emit('close');
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeydown);
  document.body.style.overflow = '';
});
</script>

<style scoped>
.layout-noise-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  height: 100dvh;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px);
  background: var(--popup-backdrop);
  backdrop-filter: blur(12px) saturate(120%);
  -webkit-backdrop-filter: blur(12px) saturate(120%);
}

.layout-noise-panel {
  --noise-ink: #1e293b;
  --noise-text: #475569;
  --noise-muted: #64748b;
  --noise-line: rgba(203, 213, 225, 0.8);

  position: relative;
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable both-edges;
  -webkit-overflow-scrolling: touch;
  border: 1px solid var(--popup-border);
  border-radius: var(--popup-radius);
  background: var(--popup-surface);
  box-shadow: var(--popup-shadow);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.48) transparent;
}

.layout-noise-panel::-webkit-scrollbar {
  width: 10px;
}

.layout-noise-panel::-webkit-scrollbar-track {
  background: transparent;
}

.layout-noise-panel::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.48);
  background-clip: padding-box;
}

.layout-noise-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: 48px;
  padding: 12px 14px;
  background: var(--popup-surface-soft);
  border-bottom: 1px solid var(--noise-line);
}

.layout-noise-panel__title-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.layout-noise-panel__title-group strong {
  color: var(--noise-ink);
  font-size: 0.9rem;
  font-weight: 600;
}

.layout-noise-total {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 20px;
  color: var(--noise-muted);
  background: rgba(15, 23, 42, 0.05);
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 0.68rem;
  font-weight: 600;
}

.layout-noise-panel__close {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--popup-control-radius);
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.8);
  color: var(--noise-muted);
  cursor: pointer;
  transition: all 0.16s ease;
}

.layout-noise-panel__close:hover {
  border-color: rgba(15, 23, 42, 0.18);
  color: var(--noise-ink);
  background: #ffffff;
}

.layout-noise-panel__close:focus-visible {
  outline: none;
  box-shadow: var(--popup-focus-ring);
}

.layout-noise-list {
  margin: 0;
  padding: 12px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(248, 250, 252, 0.5);
}

.layout-noise-list li {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 72px;
  padding: 12px 14px 14px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: var(--popup-control-radius);
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.02);
  overflow: visible;
  transition: all 0.16s ease;
}

.layout-noise-list li:hover {
  border-color: rgba(15, 23, 42, 0.12);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
}

.layout-noise-list li::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: rgba(148, 163, 184, 0.34);
}

.layout-noise-list li.is-original::before { background: rgba(220, 38, 38, 0.5); }
.layout-noise-list li.is-revised::before { background: rgba(22, 163, 74, 0.5); }

.layout-noise-meta {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.layout-noise-badge {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.65rem;
  line-height: 1.1;
  font-weight: 600;
  color: var(--noise-muted);
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid rgba(15, 23, 42, 0.05);
}

.layout-noise-side.side-original { color: #c2410c; background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.12); }
.layout-noise-side.side-revised { color: #15803d; background: rgba(34, 197, 94, 0.08); border-color: rgba(34, 197, 94, 0.12); }
.layout-noise-reason.reason-hint { color: #4f46e5; background: rgba(79, 70, 229, 0.07); border-color: rgba(79, 70, 229, 0.16); }
.layout-noise-reason.reason-page-number, .layout-noise-reason.reason-repeated-layout-text { color: #475569; }
.layout-noise-count { font-family: 'SF Mono', 'Monaco', monospace; font-weight: 700; }

.layout-noise-text {
  margin: 0;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 500;
  line-height: 1.6;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.layout-noise-overlay-enter-active,
.layout-noise-overlay-leave-active {
  transition: opacity var(--popup-motion);
}

.layout-noise-overlay-enter-from,
.layout-noise-overlay-leave-to {
  opacity: 0;
}

.layout-noise-overlay-enter-active .layout-noise-panel,
.layout-noise-overlay-leave-active .layout-noise-panel {
  transition: transform var(--popup-motion), opacity var(--popup-motion);
}

.layout-noise-overlay-enter-from .layout-noise-panel,
.layout-noise-overlay-leave-to .layout-noise-panel {
  opacity: 0;
  transform: translateY(12px) scale(0.97);
}

@media (max-width: 768px) {
  .layout-noise-overlay {
    padding: calc(env(safe-area-inset-top, 0px) + 8px) 8px calc(env(safe-area-inset-bottom, 0px) + 8px);
  }

  .layout-noise-panel {
    width: calc(100vw - 16px);
    max-height: calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  }
}

@media (max-height: 720px) {
  .layout-noise-overlay {
    align-items: flex-start;
  }
}

@media (max-width: 440px) {
  .layout-noise-list { padding: 8px; }
  .layout-noise-list li { min-height: 64px; padding: 10px 12px 12px; }
  .layout-noise-meta { gap: 4px; }
  .layout-noise-text { font-size: 0.77rem; }
}

@media (prefers-reduced-motion: reduce) {
  .layout-noise-overlay-enter-active,
  .layout-noise-overlay-leave-active,
  .layout-noise-overlay-enter-active .layout-noise-panel,
  .layout-noise-overlay-leave-active .layout-noise-panel {
    transition: none !important;
  }
}
</style>
