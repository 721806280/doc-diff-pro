<template>
  <header class="app-toolbar">
    <div class="brand-zone">
      <div class="brand-logo-glow">
        <svg viewBox="0 0 32 32" fill="none">
          <rect x="3" y="3" width="12" height="26" rx="2" fill="#e0e7ff" stroke="#4f46e5" stroke-width="1.5"/>
          <rect x="17" y="3" width="12" height="26" rx="2" fill="#dcfce7" stroke="#16a34a" stroke-width="1.5"/>
          <path d="M6 9h6M6 13h6M6 17h5" stroke="#a5b4fc" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M20 9h6M20 13h6M20 17h5" stroke="#86efac" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M14 16h4" stroke="#4f46e5" stroke-width="2" stroke-linecap="round"/>
          <path d="M16 14v4" stroke="#4f46e5" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="brand-text">
        <h1>DocDiff <span class="badge-pro">Pro</span></h1>
      </div>
    </div>

    <div ref="settingsControlRef" class="header-actions">
      <button
          type="button"
          class="toolbar-icon-button language-trigger"
          :aria-label="`${i18n.header.languageLabel}: ${locale === 'en' ? i18n.header.chinese : i18n.header.english}`"
          :title="`${i18n.header.languageLabel}: ${locale === 'en' ? i18n.header.chinese : i18n.header.english}`"
          @click="toggleLocale"
      >
        <svg
            class="language-icon"
            :class="{ 'is-en': locale === 'en' }"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
        >
          <text class="language-icon__symbol language-icon__symbol--zh" x="1.2" y="12">中</text>
          <path class="language-icon__corner language-icon__corner--top" d="M16 4L19.5 4Q21 4 21 5.5L21 8"></path>
          <text class="language-icon__symbol language-icon__symbol--en" x="12.2" y="22">A</text>
          <path class="language-icon__corner" d="M8 20L4.5 20Q3 20 3 18.5L3 16"></path>
        </svg>
      </button>

      <div class="settings-control">
        <button
            type="button"
            class="toolbar-icon-button settings-trigger"
            :class="{ active: isSettingsPanelOpen }"
            :aria-label="i18n.header.compareSettingsAria"
            :aria-expanded="isSettingsPanelOpen"
            aria-haspopup="dialog"
            :title="i18n.header.compareSettingsAria"
            @click="toggleSettingsPanel"
        >
          <svg class="magic-wand-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.85">
            <path d="M5 19L18.5 5.5"></path>
            <path d="M13.5 4.5L19.5 10.5"></path>
            <path d="M6.25 5.5V8.25"></path>
            <path d="M4.9 6.875H7.6"></path>
            <path d="M17 14.9V17.6"></path>
            <path d="M15.65 16.25H18.35"></path>
          </svg>
        </button>

        <div
            v-if="isSettingsPanelOpen"
            class="settings-popover"
            role="dialog"
            aria-labelledby="compare-settings-title"
        >
          <div class="settings-popover__header">
            <div class="settings-popover__title">
              <span class="settings-popover__mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M15 4l5 5"></path>
                  <path d="M13 6l5 5"></path>
                  <path d="M4 20l10.5-10.5"></path>
                </svg>
              </span>
              <span id="compare-settings-title">{{ i18n.header.compareSettingsAria }}</span>
            </div>
            <button
                type="button"
                class="settings-reset-button"
                :aria-label="i18n.header.resetSettingsTitle"
                :title="i18n.header.resetSettingsTitle"
                :aria-disabled="isUsingDefaultSettings"
                @click="resetSettings"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25">
                <path d="M7.2 7.8A6.9 6.9 0 1 1 5.9 13"></path>
                <path d="M7.2 4.7v3.2H4"></path>
                <path d="M12 8.9v3.8l2.5 1.5"></path>
              </svg>
            </button>
          </div>

          <div class="settings-section">
            <div class="settings-section__title">{{ i18n.header.diffGranularityLabel }}</div>
            <div class="granularity-segmented" role="radiogroup" :aria-label="i18n.header.diffGranularityLabel">
              <button
                  type="button"
                  role="radio"
                  class="granularity-segmented__option"
                  :class="{ active: diffGranularity === 'semantic' }"
                  :aria-checked="diffGranularity === 'semantic'"
                  :title="i18n.header.granularityOptions.semantic"
                  @click="updateGranularity('semantic')"
              >
                {{ i18n.header.granularityCompactOptions.semantic }}
              </button>
              <button
                  type="button"
                  role="radio"
                  class="granularity-segmented__option"
                  :class="{ active: diffGranularity === 'word' }"
                  :aria-checked="diffGranularity === 'word'"
                  :title="i18n.header.granularityOptions.word"
                  @click="updateGranularity('word')"
              >
                {{ i18n.header.granularityCompactOptions.word }}
              </button>
              <button
                  type="button"
                  role="radio"
                  class="granularity-segmented__option"
                  :class="{ active: diffGranularity === 'char' }"
                  :aria-checked="diffGranularity === 'char'"
                  :title="i18n.header.granularityOptions.char"
                  @click="updateGranularity('char')"
              >
                {{ i18n.header.granularityCompactOptions.char }}
              </button>
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-section__title">{{ i18n.header.compareRulesLabel }}</div>
            <div class="settings-toggle-list settings-toggle-list--primary" :aria-label="i18n.header.compareRulesLabel">
              <button
                  type="button"
                  class="settings-toggle"
                  :class="{ active: ignoreSpaces }"
                  :title="i18n.header.ignoreSpacesTitle"
                  :aria-pressed="ignoreSpaces"
                  @click="$emit('update:ignoreSpaces', !ignoreSpaces)"
              >
                <span class="settings-toggle__label">{{ i18n.header.ignoreSpaces }}</span>
                <span class="settings-toggle__switch" aria-hidden="true">
                  <span class="settings-toggle__switch-thumb"></span>
                </span>
              </button>
              <button
                  type="button"
                  class="settings-toggle"
                  :class="{ active: ignoreFullHalfWidth }"
                  :title="i18n.header.ignoreFullHalfWidthTitle"
                  :aria-pressed="ignoreFullHalfWidth"
                  @click="$emit('update:ignoreFullHalfWidth', !ignoreFullHalfWidth)"
              >
                <span class="settings-toggle__label">{{ i18n.header.ignoreFullHalfWidth }}</span>
                <span class="settings-toggle__switch" aria-hidden="true">
                  <span class="settings-toggle__switch-thumb"></span>
                </span>
              </button>
              <button
                  type="button"
                  class="settings-toggle"
                  :class="{ active: filterLayoutNoise }"
                  :title="i18n.header.filterLayoutNoiseTitle"
                  :aria-pressed="filterLayoutNoise"
                  @click="$emit('update:filterLayoutNoise', !filterLayoutNoise)"
              >
                <span class="settings-toggle__label">{{ i18n.header.filterLayoutNoise }}</span>
                <span class="settings-toggle__switch" aria-hidden="true">
                  <span class="settings-toggle__switch-thumb"></span>
                </span>
              </button>
            </div>
          </div>

          <div class="settings-section settings-section--view">
            <div class="settings-section__title">{{ i18n.header.viewOptionsLabel }}</div>
            <div class="settings-toggle-list settings-toggle-list--plain" :aria-label="i18n.header.viewOptionsLabel">
              <button
                  type="button"
                  class="settings-toggle"
                  :class="{ active: syncScroll }"
                  :title="i18n.header.syncScrollTitle"
                  :aria-pressed="syncScroll"
                  @click="$emit('update:syncScroll', !syncScroll)"
              >
                <span class="settings-toggle__label">{{ i18n.header.syncScroll }}</span>
                <span class="settings-toggle__switch" aria-hidden="true">
                  <span class="settings-toggle__switch-thumb"></span>
                </span>
              </button>
              <button
                  type="button"
                  class="settings-toggle"
                  :class="{ active: showTableHints }"
                  :title="i18n.header.showTableHintsTitle"
                  :aria-pressed="showTableHints"
                  @click="$emit('update:showTableHints', !showTableHints)"
              >
                <span class="settings-toggle__label">{{ i18n.header.showTableHints }}</span>
                <span class="settings-toggle__switch" aria-hidden="true">
                  <span class="settings-toggle__switch-thumb"></span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <a
          class="toolbar-icon-button github-link"
          :href="githubRepositoryUrl"
          :aria-label="i18n.header.githubLabel"
          :title="i18n.header.githubLabel"
          target="_blank"
          rel="noreferrer"
          @click="closeSettingsPanel"
      >
        <svg class="github-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.85">
          <path
              d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5"
          />
        </svg>
      </a>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from '@/i18n';
import type { DiffGranularity } from '@/types/diff';
import { DEFAULT_APP_SETTINGS } from '@/utils/appSettings';

const props = defineProps<{
  diffGranularity: DiffGranularity;
  ignoreSpaces: boolean;
  ignoreFullHalfWidth: boolean;
  filterLayoutNoise: boolean;
  syncScroll: boolean;
  showTableHints: boolean;
}>();

const emit = defineEmits<{
  'update:diffGranularity': [value: DiffGranularity];
  'update:ignoreSpaces': [value: boolean];
  'update:ignoreFullHalfWidth': [value: boolean];
  'update:filterLayoutNoise': [value: boolean];
  'update:syncScroll': [value: boolean];
  'update:showTableHints': [value: boolean];
}>();

const { locale, messages: i18n, setLocale } = useI18n();
const isSettingsPanelOpen = ref(false);
const settingsControlRef = ref<HTMLElement | null>(null);
const githubRepositoryUrl = 'https://github.com/721806280/doc-diff-vision';
const isUsingDefaultSettings = computed(() =>
  props.diffGranularity === DEFAULT_APP_SETTINGS.diffGranularity &&
  props.ignoreSpaces === DEFAULT_APP_SETTINGS.ignoreSpaces &&
  props.ignoreFullHalfWidth === DEFAULT_APP_SETTINGS.ignoreFullHalfWidth &&
  props.filterLayoutNoise === DEFAULT_APP_SETTINGS.filterLayoutNoise &&
  props.syncScroll === DEFAULT_APP_SETTINGS.syncScroll &&
  props.showTableHints === DEFAULT_APP_SETTINGS.showTableHints
);

function updateGranularity(value: DiffGranularity): void {
  emit('update:diffGranularity', value);
}

function resetSettings(): void {
  if (isUsingDefaultSettings.value) return;

  emit('update:diffGranularity', DEFAULT_APP_SETTINGS.diffGranularity);
  emit('update:ignoreSpaces', DEFAULT_APP_SETTINGS.ignoreSpaces);
  emit('update:ignoreFullHalfWidth', DEFAULT_APP_SETTINGS.ignoreFullHalfWidth);
  emit('update:filterLayoutNoise', DEFAULT_APP_SETTINGS.filterLayoutNoise);
  emit('update:syncScroll', DEFAULT_APP_SETTINGS.syncScroll);
  emit('update:showTableHints', DEFAULT_APP_SETTINGS.showTableHints);
}

function toggleLocale(): void {
  isSettingsPanelOpen.value = false;
  setLocale(locale.value === 'en' ? 'zh-CN' : 'en');
}

function toggleSettingsPanel(): void {
  isSettingsPanelOpen.value = !isSettingsPanelOpen.value;
}

function closeSettingsPanel(): void {
  isSettingsPanelOpen.value = false;
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!isSettingsPanelOpen.value) return;
  const target = event.target;
  if (target instanceof Node && !settingsControlRef.value?.contains(target)) {
    isSettingsPanelOpen.value = false;
  }
}

function handleDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    isSettingsPanelOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  document.addEventListener('keydown', handleDocumentKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  document.removeEventListener('keydown', handleDocumentKeyDown);
});
</script>

<style scoped>
.app-toolbar {
  background: var(--bg-panel);
  border-radius: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.02), 0 4px 16px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(12px);
  position: relative;
  z-index: 10;
}

.brand-zone {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.brand-logo-glow {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-logo-glow svg {
  width: 32px;
  height: 32px;
  filter: drop-shadow(0 2px 4px rgba(var(--accent-rgb), 0.18));
}

.brand-text h1 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
}

.badge-pro {
  font-size: 0.55rem;
  background: var(--gradient-accent);
  color: #ffffff;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 800;
  box-shadow: 0 2px 6px rgba(var(--accent-rgb), 0.22);
}

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  margin-left: auto;
  position: relative;
}

.settings-control {
  position: relative;
}

.toolbar-icon-button {
  position: relative;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.toolbar-icon-button::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 3px;
  width: 12px;
  height: 2px;
  border-radius: 999px;
  background: var(--accent);
  opacity: 0;
  transform: translateX(-50%) scaleX(0.45);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.toolbar-icon-button:hover,
.settings-trigger.active {
  color: var(--accent);
}

.toolbar-icon-button:hover {
  transform: translateY(-1px);
}

.settings-trigger.active::after {
  opacity: 1;
  transform: translateX(-50%) scaleX(1);
}

.toolbar-icon-button:focus-visible,
.granularity-segmented__option:focus-visible,
.settings-toggle:focus-visible,
.settings-reset-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.toolbar-icon-button > svg {
  position: relative;
  z-index: 1;
}

.language-icon {
  display: block;
  width: 21px;
  height: 21px;
  color: currentColor;
  overflow: visible;
}

.language-icon__corner {
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.82;
}

.language-icon__corner--top {
  transform: translate(-2px, 0);
}

.language-icon__symbol {
  fill: currentColor;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1;
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.language-icon__symbol--zh {
  font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}

.language-icon__symbol--en {
  font-family: "Helvetica Neue", Arial, sans-serif;
  transform: translate(0, -1px);
}

.language-icon.is-en .language-icon__symbol--zh {
  transform: translate(8.9587px, 7.2597px);
}

.language-icon.is-en .language-icon__symbol--en {
  transform: translate(-9.5125px, -10.9448px);
}

.magic-wand-icon {
  width: 17px;
  height: 17px;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform: rotate(-8deg);
}

.github-icon {
  width: 17px;
  height: 17px;
  display: block;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform: translateY(0.2px) scale(1.02);
}

.settings-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 40;
  width: min(286px, calc(100vw - 24px));
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(5, 5, 5, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.99);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(12px);
}

.settings-popover__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 2px 4px;
  color: var(--text-primary);
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1.25;
}

.settings-popover__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.settings-popover__mark {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(var(--accent-rgb), 0.08);
  color: var(--accent);
}

.settings-popover__mark svg {
  width: 12px;
  height: 12px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.settings-reset-button {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color 0.18s ease, transform 0.18s ease;
}

.settings-reset-button svg {
  width: 19px;
  height: 19px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.settings-reset-button:hover {
  color: var(--accent);
  transform: rotate(-18deg);
}

.granularity-segmented {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px;
  padding: 2px;
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 8px;
  background: #ffffff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.granularity-segmented__option {
  min-width: 0;
  height: 28px;
  padding: 0 4px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.granularity-segmented__option:hover {
  color: var(--text-primary);
}

.granularity-segmented__option.active {
  background: rgba(var(--accent-rgb), 0.08);
  color: var(--accent);
}

.settings-section {
  display: grid;
  gap: 5px;
}

.settings-section--view {
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.14);
}

.settings-section__title {
  padding: 0 2px;
  color: var(--text-tertiary);
  font-size: 0.64rem;
  font-weight: 700;
  line-height: 1.2;
}

.settings-toggle-list {
  display: grid;
  gap: 1px;
  padding: 4px;
  border-radius: 8px;
}

.settings-toggle-list--primary {
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: #ffffff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.settings-toggle-list--plain {
  gap: 1px;
  padding: 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.78);
}

.settings-toggle {
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 6px 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.settings-toggle:hover {
  background: rgba(248, 250, 252, 0.96);
  color: var(--text-primary);
}

.settings-toggle.active {
  color: var(--text-primary);
}

.settings-toggle__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-toggle__switch {
  width: 30px;
  height: 17px;
  flex: 0 0 30px;
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 999px;
  background: #cbd5e1;
  transition: background 0.18s ease;
}

.settings-toggle.active .settings-toggle__switch {
  background: var(--accent);
}

.settings-toggle__switch-thumb {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.22);
  transform: translateX(0);
  transition: transform 0.18s ease;
}

.settings-toggle.active .settings-toggle__switch-thumb {
  transform: translateX(13px);
}

@media (max-width: 820px) {
  .app-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 6px 8px;
    gap: 8px;
  }

  .header-actions {
    order: 2;
    margin-left: auto;
  }

  .settings-popover {
    right: 0;
    width: min(286px, calc(100vw - 16px));
  }
}

@media (max-width: 400px) {
  .brand-logo-glow {
    display: none;
  }

  .brand-text h1 {
    font-size: 0.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .brand-logo-glow svg,
  .toolbar-icon-button,
  .toolbar-icon-button::after,
  .language-icon__symbol,
  .granularity-segmented__option,
  .settings-reset-button,
  .settings-toggle,
  .settings-toggle__switch,
  .settings-toggle__switch-thumb {
    transition: none !important;
  }
}
</style>
