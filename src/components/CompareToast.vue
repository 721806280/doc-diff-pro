<template>
  <Transition name="compare-toast">
    <div v-if="message" class="compare-toast">
      <div class="compare-toast-dot" :class="{ done: !comparing }"></div>
      <span>{{ message }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  message: string;
  comparing: boolean;
}>();
</script>

<style scoped>
.compare-toast {
  position: absolute;
  top: 70px;
  left: 50%;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: min(520px, calc(100vw - 28px));
  padding: 9px 13px;
  border: 1px solid var(--popup-border);
  border-radius: var(--popup-radius);
  background: var(--popup-surface);
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.4;
  box-shadow: var(--popup-shadow-sm);
  transform: translateX(-50%);
  backdrop-filter: blur(12px);
}

.compare-toast span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.compare-toast-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  flex: 0 0 7px;
}

.compare-toast-dot.done {
  background: var(--ins-focus);
}

.compare-toast-enter-active,
.compare-toast-leave-active {
  transition: opacity var(--popup-motion), transform var(--popup-motion);
}

.compare-toast-enter-from,
.compare-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -12px);
}

@media (max-width: 820px) {
  .compare-toast {
    top: 116px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .compare-toast-enter-active,
  .compare-toast-leave-active {
    transition: none !important;
  }
}
</style>
