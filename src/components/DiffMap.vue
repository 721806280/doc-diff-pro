<template>
  <aside
      v-if="items.length"
      class="diff-map"
      :class="{ 'is-collapsed': collapsed }"
      :aria-label="i18n.diffNavigator.diffMapLabel"
  >
    <button
        v-for="item in items"
        v-show="!collapsed"
        :key="item.index"
        type="button"
        tabindex="-1"
        class="diff-map__marker"
        :class="[
          `is-${item.kind}`,
          {
            'is-active': item.index === currentIndex,
            'is-ignored': ignoredIndices.has(item.index)
          }
        ]"
        :style="{ top: `${item.position}%` }"
        :title="i18n.diffNavigator.diffMapItem(item.index, i18n.diffNavigator.ignoredDiffKind[item.kind])"
        :aria-label="i18n.diffNavigator.diffMapItem(item.index, i18n.diffNavigator.ignoredDiffKind[item.kind])"
        :aria-current="item.index === currentIndex ? 'true' : undefined"
        @click="$emit('select', item.index)"
    >
      <span aria-hidden="true"></span>
    </button>
  </aside>
</template>

<script setup lang="ts">
import { useI18n } from '@/i18n';
import type { DiffMapItem } from '@/types/diff';

defineProps<{
  items: DiffMapItem[];
  currentIndex: number;
  ignoredIndices: ReadonlySet<number>;
  collapsed: boolean;
}>();

defineEmits<{
  select: [index: number];
}>();

const { messages: i18n } = useI18n();
</script>

<style scoped>
.diff-map {
  position: relative;
  align-self: stretch;
  width: 8px;
  flex: 0 0 8px;
  min-height: 0;
  margin: 44px 0 5px;
  border-radius: 999px;
}

.diff-map.is-collapsed {
  width: 1px;
  flex-basis: 1px;
}

.diff-map.is-collapsed::before {
  display: none;
}

.diff-map::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 50%;
  width: 2px;
  border-radius: 999px;
  background: var(--border-subtle);
  transform: translateX(-50%);
}

.diff-map__marker {
  position: absolute;
  left: 50%;
  z-index: 1;
  width: 16px;
  height: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  transform: translate(-50%, -50%);
}

.diff-map__marker span {
  width: 6px;
  height: 4px;
  display: block;
  margin: auto;
  border-radius: 999px;
  background: var(--modified-text);
  box-shadow: 0 0 0 1px var(--bg-panel-solid);
  transition: width 0.16s ease, height 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
}

.diff-map__marker.is-inserted span {
  background: var(--ins-focus);
}

.diff-map__marker.is-deleted span {
  background: var(--del-focus);
}

.diff-map__marker.is-ignored span {
  opacity: 0.28;
}

.diff-map__marker:hover span,
.diff-map__marker.is-active span {
  width: 10px;
  height: 6px;
  opacity: 1;
  box-shadow: 0 0 0 2px var(--bg-panel-solid), 0 1px 5px rgba(15, 23, 42, 0.24);
}

.diff-map__marker.is-active {
  z-index: 2;
}

.diff-map__marker:focus-visible {
  outline: none;
}

.diff-map__marker:focus-visible span {
  box-shadow: 0 0 0 3px var(--accent-glow);
}

@media (max-width: 820px) {
  .diff-map {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .diff-map__marker span {
    transition: none !important;
  }
}
</style>
