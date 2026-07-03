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
              ×
            </button>
          </div>

          <ul class="layout-noise-list">
            <li
              v-for="(item, index) in items"
              :key="`${item.side}-${item.reason}-${index}`"
              :class="`is-${item.side}`"
            >
              <div class="layout-noise-meta">
                <span class="layout-noise-side" :class="`side-${item.side}`">
                  {{ i18n.diffNavigator.layoutNoiseSide[item.side] }}
                </span>
                <span class="layout-noise-reason" :class="`reason-${item.reason}`">
                  {{ i18n.diffNavigator.layoutNoiseReason[item.reason] }}
                </span>
                <span v-if="item.count > 1" class="layout-noise-count">x{{ item.count }}</span>
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
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  padding: calc(env(safe-area-inset-top, 0px) + 14px) 14px calc(env(safe-area-inset-bottom, 0px) + 14px);
  background: rgba(30, 41, 59, 0.28);
  backdrop-filter: blur(6px);
}

.layout-noise-panel {
  --noise-ink: #334155;
  --noise-text: #475569;
  --noise-muted: #64748b;
  --noise-line: rgba(203, 213, 225, 0.76);
  --noise-fill: #f8fafc;

  width: min(640px, calc(100vw - 28px));
  max-height: calc(100dvh - 28px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  box-shadow:
    0 22px 50px rgba(15, 23, 42, 0.18),
    0 4px 14px rgba(15, 23, 42, 0.08);
}

.layout-noise-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  z-index: 1;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.88);
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
}

.layout-noise-panel__title-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.layout-noise-panel__title-group strong {
  color: var(--noise-ink);
  font-size: 0.78rem;
  line-height: 1.15;
  font-weight: 680;
}

.layout-noise-total {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  color: var(--noise-muted);
  background: var(--noise-fill);
  border: 1px solid var(--noise-line);
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 0.64rem;
  font-weight: 700;
}

.layout-noise-panel__close {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(255, 255, 255, 0.92);
  color: var(--noise-muted);
  font-size: 1.04rem;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease, transform 0.16s ease;
}

.layout-noise-panel__close:hover {
  border-color: rgba(100, 116, 139, 0.4);
  color: var(--noise-ink);
  background: #ffffff;
  transform: translateY(-1px);
}

.layout-noise-panel__close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.16);
}

.layout-noise-list {
  margin: 0;
  padding: 8px;
  list-style: none;
  display: grid;
  gap: 6px;
  min-height: 0;
  overflow: auto;
  background: rgba(248, 250, 252, 0.8);
}

.layout-noise-list li {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 7px;
  align-items: start;
  padding: 9px 11px 9px 13px;
  border: 1px solid rgba(226, 232, 240, 0.88);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  overflow: hidden;
}

.layout-noise-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: rgba(148, 163, 184, 0.38);
}

.layout-noise-list li.is-original::before {
  background: rgba(220, 38, 38, 0.36);
}

.layout-noise-list li.is-revised::before {
  background: rgba(22, 163, 74, 0.36);
}

.layout-noise-meta {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
}

.layout-noise-side,
.layout-noise-reason,
.layout-noise-count {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 1px 6px 2px;
  border-radius: 999px;
  font-size: 0.62rem;
  line-height: 1;
}

.layout-noise-side,
.layout-noise-reason {
  font-weight: 600;
}

.layout-noise-side {
  color: var(--noise-muted);
  background: var(--noise-fill);
  border: 1px solid rgba(203, 213, 225, 0.7);
}

.layout-noise-side.side-original {
  color: #b91c1c;
  background: rgba(220, 38, 38, 0.06);
  border-color: rgba(220, 38, 38, 0.14);
}

.layout-noise-side.side-revised {
  color: #15803d;
  background: rgba(22, 163, 74, 0.06);
  border-color: rgba(22, 163, 74, 0.15);
}

.layout-noise-reason {
  color: var(--noise-muted);
  background: var(--noise-fill);
  border: 1px solid rgba(203, 213, 225, 0.75);
}

.layout-noise-reason.reason-hint {
  color: #4f46e5;
  background: rgba(79, 70, 229, 0.07);
  border-color: rgba(79, 70, 229, 0.16);
}

.layout-noise-reason.reason-page-number,
.layout-noise-reason.reason-repeated-layout-text {
  color: #475569;
}

.layout-noise-count {
  background: var(--noise-fill);
  color: var(--noise-muted);
  border: 1px solid rgba(203, 213, 225, 0.75);
  font-family: 'SF Mono', 'Monaco', monospace;
  font-weight: 700;
}

.layout-noise-text {
  margin: 0;
  color: var(--noise-text);
  font-size: 0.75rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.layout-noise-overlay-enter-active,
.layout-noise-overlay-leave-active {
  transition: opacity 0.16s ease;
}

.layout-noise-overlay-enter-from,
.layout-noise-overlay-leave-to {
  opacity: 0;
}

.layout-noise-overlay-enter-active .layout-noise-panel,
.layout-noise-overlay-leave-active .layout-noise-panel {
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.layout-noise-overlay-enter-from .layout-noise-panel,
.layout-noise-overlay-leave-to .layout-noise-panel {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
}

@media (max-width: 640px) {
  .layout-noise-overlay {
    padding: calc(env(safe-area-inset-top, 0px) + 8px) 8px calc(env(safe-area-inset-bottom, 0px) + 8px);
  }

  .layout-noise-panel {
    width: calc(100vw - 16px);
    max-height: calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    border-radius: 12px;
  }

  .layout-noise-list {
    padding: 7px;
  }

  .layout-noise-list li {
    padding: 9px 10px 10px 13px;
  }

  .layout-noise-meta {
    gap: 4px;
  }

  .layout-noise-text {
    font-size: 0.74rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .layout-noise-overlay-enter-active,
  .layout-noise-overlay-leave-active,
  .layout-noise-overlay-enter-active .layout-noise-panel,
  .layout-noise-overlay-leave-active .layout-noise-panel {
    transition: none;
  }
}
</style>
